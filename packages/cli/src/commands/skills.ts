/**
 * skills.ts — install / refresh the bundled manual-only skills in a project.
 *
 * Layout written into the project:
 *   .claude/skills/<name>/...   Claude Code (frontmatter `disable-model-invocation: true`)
 *   .agents/skills/<name>/...   Codex, DeepSeek Harness and Cursor all discover this
 *                               root; adds `agents/openai.yaml` so Codex also treats
 *                               the skill as explicit-invocation only.
 *
 * There is no manifest: a project file that differs from the bundled template is
 * shown as a diff and the user decides whether to overwrite it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { createTwoFilesPatch } from "diff";
import inquirer from "inquirer";

export const PLATFORMS = ["claude", "codex", "dsh", "cursor"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  claude: "Claude Code",
  codex: "Codex",
  dsh: "DeepSeek Harness",
  cursor: "Cursor",
};

type SkillRoot = ".claude/skills" | ".agents/skills";

const PLATFORM_ROOT: Record<Platform, SkillRoot> = {
  claude: ".claude/skills",
  codex: ".agents/skills",
  dsh: ".agents/skills",
  cursor: ".agents/skills",
};

const SKILL_ROOTS: readonly SkillRoot[] = [".claude/skills", ".agents/skills"];

const CODEX_POLICY = "policy:\n  allow_implicit_invocation: false\n";

const TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../templates/skills",
);

export type Decision = "overwrite" | "skip" | "overwrite-all" | "skip-all";

/** Asks what to do with one project file that differs from the template. */
export type ConflictResolver = (
  file: string,
  patch: string,
) => Promise<Decision>;

export interface SyncOptions {
  cwd: string;
  roots: readonly SkillRoot[];
  /** Overwrite every differing file without asking. */
  force?: boolean;
  /** Report what would change without writing. */
  dryRun?: boolean;
  /** Absent → differing files are skipped (non-interactive). */
  resolve?: ConflictResolver;
}

export interface SyncReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  skipped: string[];
}

export function listSkillNames(): string[] {
  return fs
    .readdirSync(TEMPLATE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function listFiles(dir: string, prefix = ""): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? listFiles(path.join(dir, e.name), `${prefix}${e.name}/`)
        : [`${prefix}${e.name}`],
    )
    .sort();
}

/** Template files for one skill root, keyed by project-relative POSIX path. */
export function renderSkillFiles(root: SkillRoot): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of listSkillNames()) {
    const skillDir = path.join(TEMPLATE_DIR, name);
    for (const rel of listFiles(skillDir)) {
      files.set(
        `${root}/${name}/${rel}`,
        fs.readFileSync(path.join(skillDir, rel), "utf-8"),
      );
    }
    if (root === ".agents/skills") {
      files.set(`${root}/${name}/agents/openai.yaml`, CODEX_POLICY);
    }
  }
  return files;
}

export function rootsForPlatforms(platforms: readonly Platform[]): SkillRoot[] {
  const wanted = new Set(platforms.map((p) => PLATFORM_ROOT[p]));
  return SKILL_ROOTS.filter((r) => wanted.has(r));
}

/** Skill roots in `cwd` that already hold at least one bundled skill. */
export function detectInstalledRoots(cwd: string): SkillRoot[] {
  const names = listSkillNames();
  return SKILL_ROOTS.filter((root) =>
    names.some((n) => fs.existsSync(path.join(cwd, root, n, "SKILL.md"))),
  );
}

/** Line endings are normalized so a CRLF checkout does not count as a change. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export async function syncSkills(opts: SyncOptions): Promise<SyncReport> {
  const report: SyncReport = {
    created: [],
    updated: [],
    unchanged: [],
    skipped: [],
  };
  let sticky: "overwrite" | "skip" | undefined;

  for (const root of opts.roots) {
    for (const [rel, content] of renderSkillFiles(root)) {
      const dest = path.join(opts.cwd, rel);

      if (!fs.existsSync(dest)) {
        if (!opts.dryRun) writeFile(dest, content);
        report.created.push(rel);
        continue;
      }

      const current = normalize(fs.readFileSync(dest, "utf-8"));
      if (current === normalize(content)) {
        report.unchanged.push(rel);
        continue;
      }

      let decision: "overwrite" | "skip";
      if (opts.force) decision = "overwrite";
      else if (sticky) decision = sticky;
      else if (opts.dryRun || !opts.resolve) decision = "skip";
      else {
        const patch = createTwoFilesPatch(
          `${rel} (project)`,
          `${rel} (template)`,
          current,
          normalize(content),
        );
        const answer = await opts.resolve(rel, patch);
        if (answer === "overwrite-all") sticky = "overwrite";
        if (answer === "skip-all") sticky = "skip";
        decision =
          answer === "overwrite-all" || answer === "overwrite"
            ? "overwrite"
            : "skip";
      }

      if (decision === "overwrite") {
        if (!opts.dryRun) writeFile(dest, content);
        report.updated.push(rel);
      } else {
        report.skipped.push(rel);
      }
    }
  }
  return report;
}

function writeFile(dest: string, content: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, "utf-8");
}

// ---------- interactive layer ----------

function colorPatch(patch: string): string {
  return patch
    .split("\n")
    .map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++"))
        return chalk.green(line);
      if (line.startsWith("-") && !line.startsWith("---"))
        return chalk.red(line);
      if (line.startsWith("@@")) return chalk.cyan(line);
      return line;
    })
    .join("\n");
}

export const promptResolver: ConflictResolver = async (file, patch) => {
  console.log(chalk.yellow(`\n${file} differs from the bundled template:`));
  console.log(colorPatch(patch));
  const { decision } = await inquirer.prompt<{ decision: Decision }>([
    {
      type: "list",
      name: "decision",
      message: `${file}:`,
      choices: [
        { name: "Keep the project version", value: "skip" },
        { name: "Overwrite with the template", value: "overwrite" },
        { name: "Keep all remaining changed files", value: "skip-all" },
        {
          name: "Overwrite all remaining changed files",
          value: "overwrite-all",
        },
      ],
    },
  ]);
  return decision;
};

export interface InstallOptions {
  platforms: Platform[];
  force?: boolean;
  dryRun?: boolean;
}

async function choosePlatforms(): Promise<Platform[]> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `No platform given. Pass one or more of: ${PLATFORMS.map((p) => `--${p}`).join(" ")}`,
    );
  }
  const { platforms } = await inquirer.prompt<{ platforms: Platform[] }>([
    {
      type: "checkbox",
      name: "platforms",
      message: "Install skills for which agents?",
      choices: PLATFORMS.map((p) => ({
        name: PLATFORM_LABELS[p],
        value: p,
        checked: p === "claude" || p === "codex",
      })),
      validate: (v: readonly unknown[]) =>
        v.length > 0 || "Select at least one agent",
    },
  ]);
  return platforms;
}

function resolverFor(opts: {
  force?: boolean;
  dryRun?: boolean;
}): ConflictResolver | undefined {
  if (opts.force || opts.dryRun || !process.stdin.isTTY) return undefined;
  return promptResolver;
}

/** `trellis init`: install skills for the chosen platforms. */
export async function init(opts: InstallOptions): Promise<void> {
  const platforms =
    opts.platforms.length > 0 ? opts.platforms : await choosePlatforms();
  const roots = rootsForPlatforms(platforms);
  console.log(
    chalk.cyan(
      `Installing skills for ${platforms.map((p) => PLATFORM_LABELS[p]).join(", ")} → ${roots.join(", ")}`,
    ),
  );
  const report = await syncSkills({
    cwd: process.cwd(),
    roots,
    force: opts.force,
    dryRun: opts.dryRun,
    resolve: resolverFor(opts),
  });
  printReport(report, opts.dryRun ?? false);
}

/** `trellis update`: refresh skills in every root that already has them. */
export async function update(
  opts: Omit<InstallOptions, "platforms">,
): Promise<void> {
  const cwd = process.cwd();
  const roots = detectInstalledRoots(cwd);
  if (roots.length === 0) {
    console.log(
      chalk.yellow(
        "No Trellis skills found in this project. Run: trellis init",
      ),
    );
    return;
  }
  console.log(chalk.cyan(`Updating skills in ${roots.join(", ")}`));
  const report = await syncSkills({
    cwd,
    roots,
    force: opts.force,
    dryRun: opts.dryRun,
    resolve: resolverFor(opts),
  });
  printReport(report, opts.dryRun ?? false);
}

export function printReport(report: SyncReport, dryRun: boolean): void {
  const verb = dryRun ? "would be " : "";
  const sections: [string, string[], (s: string) => string][] = [
    [`${verb}created`, report.created, chalk.green],
    [`${verb}updated`, report.updated, chalk.cyan],
    ["kept (differs from template)", report.skipped, chalk.yellow],
  ];
  for (const [label, files, color] of sections) {
    if (files.length === 0) continue;
    console.log(color(`\n${files.length} file(s) ${label}:`));
    for (const f of files) console.log(`  ${f}`);
  }
  if (report.skipped.length > 0 && !dryRun) {
    console.log(
      chalk.gray(
        "Re-run in a terminal to review each diff, or pass --force to overwrite.",
      ),
    );
  }
  if (
    report.created.length + report.updated.length + report.skipped.length ===
    0
  ) {
    console.log(chalk.gray("All skill files are up to date."));
  }
}
