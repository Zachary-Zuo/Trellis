#!/usr/bin/env node
/**
 * Trellis hook launcher — resolve a working Python 3 at run time and run a hook
 * with it.
 *
 * ## Why this exists
 *
 * Hook commands are committed to the repository (`.claude/settings.json`,
 * `.codex/hooks.json`, and friends), so whatever interpreter name is baked into
 * them travels with the repo across machines and operating systems. A command
 * written on Windows (`python`) breaks on Linux, and one written on Linux
 * (`python3`) breaks on Windows. This launcher keeps the committed command
 * platform-independent — every hook runs through
 * `node .trellis/scripts/run-python-hook.cjs <hook.py>` — and defers the
 * interpreter choice to run time on the machine that actually runs the hook.
 *
 * It also normalizes the invocation: `-X utf8` is always passed, so a hook reads
 * its JSON stdin and writes its output as UTF-8 regardless of the host console
 * codepage, and `TRELLIS_PYTHON` can pin an interpreter where PATH order alone
 * is not enough.
 *
 * ## Maintainer notes
 *
 * **Written verbatim.** This file is exempt from the CLI's `python3` →
 * platform-command rewrite (`replacePythonCommandLiterals`): rewriting the
 * candidate names below would delete `python3` from the POSIX branch as soon as
 * the repo is materialized on Windows, which is precisely the cross-platform
 * failure this launcher exists to prevent. If you add another launcher like
 * this one, add it to `isPythonRewriteExempt` as well.
 *
 * **De-duplicated on purpose.** Because the exemption is path-based rather than
 * content-based, `candidateList()` still de-duplicates: a machine whose PATH
 * exposes the same interpreter under two names must not pay for two probe
 * spawns, and a future rewrite accident must not produce a silent duplicate.
 */
"use strict";

const { spawnSync } = require("node:child_process");
const os = require("node:os");

const script = process.argv[2];
const scriptArgs = process.argv.slice(3);

if (!script) {
  console.error(
    "Usage: node .trellis/scripts/run-python-hook.cjs <hook.py> [args...]",
  );
  process.exit(2);
}

/**
 * Candidate interpreters, most likely first.
 *
 * `TRELLIS_PYTHON` always wins, so a machine that pins its interpreter is not
 * at the mercy of PATH order. It is probed like any other candidate, so a stale
 * or wrong value falls through instead of breaking every hook.
 */
function candidateList() {
  const envPython = process.env.TRELLIS_PYTHON?.trim();
  const candidates = [];
  if (envPython) {
    candidates.push({ command: envPython, args: [], label: "TRELLIS_PYTHON" });
  }

  if (os.platform() === "win32") {
    // `py -3` is the python.org launcher and the only candidate that selects a
    // major version explicitly, so it stays last as the backstop; `python` is
    // tried first because it is what most Windows installs provide.
    candidates.push(
      { command: "python", args: [], label: "python" },
      { command: "python3", args: [], label: "python3" },
      { command: "py", args: ["-3"], label: "py -3" },
    );
  } else {
    candidates.push(
      { command: "python3", args: [], label: "python3" },
      { command: "python", args: [], label: "python" },
    );
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = [candidate.command, ...candidate.args].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True when this candidate resolves to a working Python 3. */
function isPython3(candidate) {
  const result = spawnSync(
    candidate.command,
    [
      ...candidate.args,
      "-c",
      "import sys; raise SystemExit(0 if sys.version_info[0] == 3 else 1)",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  return result.status === 0;
}

function findPython() {
  for (const candidate of candidateList()) {
    if (isPython3(candidate)) return candidate;
  }
  return null;
}

const python = findPython();
if (!python) {
  console.error(
    "Trellis hook error: no Python 3 executable found. " +
      "Set TRELLIS_PYTHON to an interpreter path, or install Python 3 " +
      "(python3 / python / py -3).",
  );
  process.exit(127);
}

// `-X utf8` is unconditional: hook input is JSON on stdin and hook output is
// consumed as UTF-8, so the host codepage must not leak into either side.
const result = spawnSync(
  python.command,
  [...python.args, "-X", "utf8", script, ...scriptArgs],
  { stdio: "inherit", windowsHide: true },
);

if (result.error) {
  console.error(
    `Trellis hook error: failed to run Python via ${python.label}: ${result.error.message}`,
  );
  process.exit(1);
}

process.exit(typeof result.status === "number" ? result.status : 1);
