/**
 * Shared hook templates — platform-independent Python hook scripts.
 *
 * These scripts read only from .trellis/ paths (JSONL, prd.md, spec/) and
 * have no platform-specific placeholders. They can be written as-is to any
 * platform's hooks directory.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

export interface HookScript {
  /** Filename (e.g., "session-start.py") */
  name: string;
  /** Script content — no placeholders, ready to write directly */
  content: string;
}

export type SharedHookName =
  | "session-start.py"
  | "inject-shell-session-context.py"
  | "inject-workflow-state.py"
  | "inject-subagent-context.py"
  | "inject-spec-context.py";

export type SharedHookPlatform =
  | "claude"
  | "cursor"
  | "codex"
  | "opencode"
  | "gemini"
  | "qoder"
  | "copilot"
  | "codebuddy"
  | "droid"
  | "kiro"
  | "trae"
  | "zcode"
  | "dsh";

/**
 * Which shared hooks each platform actually invokes. Single source of truth
 * for shared-hook distribution — `collectSharedHooks` reads this table, and
 * both `trellis init` and `trellis update` consume the map it returns.
 *
 * Routing rules encoded here:
 * - `session-start.py` — shipped by every platform with a SessionStart
 *   hook event *except* codex + copilot, which bundle a platform-specific
 *   session-start.py under their own template dirs.
 * - `inject-workflow-state.py` — every platform with a UserPromptSubmit
 *   (or equivalent) event. Kiro + codex self-included; platforms without
 *   per-turn main-session hooks are excluded.
 * - `inject-subagent-context.py` — platforms with native sub-agent context
 *   delivery. Most use a PreToolUse prompt mutation; Codex uses its
 *   SubagentStart `additionalContext` event. Class-2 (pull-based) platforms
 *   such as copilot, gemini, qoder, and trae still load context from a
 *   self-loading agent profile.
 * - `inject-shell-session-context.py` — platforms with a hook that fires
 *   *before* a shell command and receives both the session id and the pending
 *   command. That hook is the only channel by which session identity reaches
 *   `task.py`, which runs in the shell child: no platform researched exports a
 *   session id into that child (2026-08-05 audit of 21 platforms). Declaring a
 *   platform here also requires an entry in its own hook config template —
 *   `shared-hooks.test.ts` fails the build when the two disagree, because a
 *   script on disk that nothing invokes is indistinguishable from success.
 *   Kiro is deliberately absent: its two hook surfaces (CLI agent JSON
 *   `hooks.{agentSpawn,userPromptSubmit}` and IDE `.kiro.hook` `when.type`)
 *   publish no pre-tool trigger, and an unknown key in the agent JSON risks
 *   the whole agent failing to load. Settle it by running Kiro and checking
 *   its hook trigger list before adding it.
 * - Kiro supports per-turn + spawn hooks on both surfaces (per the official
 *   docs https://kiro.dev/docs/cli/hooks/): the CLI custom agent declares
 *   `hooks.userPromptSubmit` + `hooks.agentSpawn`, and the IDE declares a
 *   `.kiro.hook` with `when.type=promptSubmit`. So Kiro ships
 *   `session-start.py` (agentSpawn overview), `inject-workflow-state.py`
 *   (per-turn breadcrumb), and `inject-subagent-context.py` (sub-agent
 *   spawn). The scripts emit a plain-text Kiro branch — Kiro adds a hook's
 *   stdout directly to the conversation context (no JSON envelope).
 * - `inject-spec-context.py` — path-scoped spec injection. Claude Code uses
 *   PostToolUse Read/Edit/Write/MultiEdit; Codex and OpenCode use PreToolUse.
 *   Codex passes the native apply_patch payload directly. OpenCode's plugin
 *   adapts write/edit/apply_patch calls and blocks a FULL emission once so the
 *   model sees the specs before retrying. Class-2 platforms use
 *   `get_context.py --mode spec` pull mode instead.
 * - Claude Code `statusLine` is intentionally not installed by default.
 *   Users can add their own statusLine command in `.claude/settings.json`,
 *   or opt in to the Trellis one via `trellis init --with-statusline`
 *   (installed from `templates/claude/hooks/`, not from this table — no
 *   other platform has a statusLine event).
 * - ZCode (3.x) ships a workspace hook config at `.zcode/config.json` covering
 *   SessionStart + UserPromptSubmit in the main session, plus PreToolUse for
 *   `Agent|Task`. Live probing confirmed `hookSpecificOutput.updatedInput`
 *   reaches the sub-agent prompt, so ZCode is class-1 and ships
 *   `inject-subagent-context.py`.
 * - DSH (0.1.5+) has no hook system of its own; it reaches these scripts through
 *   the `@deepseek-ai/dsh-hooks-claude-code` bridge, mounted by the operator in
 *   their DSH profile. Trellis writes `.dsh/hooks.json` for that bridge and the
 *   scripts under `.dsh/hooks/`. Two probe-verified constraints shape the set:
 *   the bridge's `SubagentStart` seam injects context but its `PreToolUse` seam
 *   ignores `updatedInput`, and the bridge spawns hooks with no `DSH_*`
 *   namespace (it does set `CLAUDE_PROJECT_DIR`), which is why both
 *   `session-start.py` and `inject-workflow-state.py` detect DSH from the
 *   `.dsh` script path before trusting any environment alias.
 */
export const SHARED_HOOKS_BY_PLATFORM: Record<
  SharedHookPlatform,
  readonly SharedHookName[]
> = {
  claude: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
    "inject-spec-context.py",
  ],
  cursor: [
    "session-start.py",
    "inject-shell-session-context.py",
    "inject-subagent-context.py",
  ],
  codex: [
    "inject-workflow-state.py",
    "inject-subagent-context.py",
    "inject-spec-context.py",
  ],
  opencode: ["inject-spec-context.py"],
  gemini: [
    "session-start.py",
    "inject-shell-session-context.py",
    "inject-workflow-state.py",
  ],
  qoder: [
    "session-start.py",
    "inject-shell-session-context.py",
    "inject-workflow-state.py",
  ],
  copilot: ["inject-workflow-state.py"],
  codebuddy: [
    "session-start.py",
    "inject-shell-session-context.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
  droid: [
    "session-start.py",
    "inject-shell-session-context.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
  kiro: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
  trae: [
    "session-start.py",
    "inject-shell-session-context.py",
    "inject-workflow-state.py",
  ],
  zcode: [
    "session-start.py",
    "inject-shell-session-context.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
  ],
  // DSH reaches hooks only through the `dsh-hooks-claude-code` bridge, so this
  // set is exactly what that bridge's interception seams can carry.
  // `session-start.py` (SessionStart), `inject-workflow-state.py`
  // (UserPromptSubmit) and `inject-spec-context.py` (PostToolUse) all deliver
  // through `hookSpecificOutput.additionalContext`, which the bridge honors.
  // `inject-subagent-context.py` ships for its `SubagentStart` branch only: the
  // bridge logs and ignores `updatedInput`, so that script's PreToolUse delivery
  // path is inert here. `inject-shell-session-context.py` is absent because the
  // bridge registers no pre-shell event, and DSH publishes session identity into
  // model shells through its own layering instead.
  dsh: [
    "session-start.py",
    "inject-workflow-state.py",
    "inject-subagent-context.py",
    "inject-spec-context.py",
  ],
};

/**
 * Get all shared hook scripts. Content is platform-independent and can be
 * written directly without placeholder resolution.
 */
export function getSharedHookScripts(): HookScript[] {
  const scripts: HookScript[] = [];
  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith(".py"))
    .sort();

  for (const file of files) {
    scripts.push({ name: file, content: readTemplate(file) });
  }

  return scripts;
}

/**
 * Get the shared hook scripts that a given platform actually registers.
 * Drives `collectSharedHooks` so distribution never drifts from the
 * per-platform capability declared above.
 */
export function getSharedHookScriptsForPlatform(
  platform: SharedHookPlatform,
): HookScript[] {
  const allowed = new Set<string>(SHARED_HOOKS_BY_PLATFORM[platform]);
  return getSharedHookScripts().filter((h) => allowed.has(h.name));
}
