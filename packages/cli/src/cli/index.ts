import chalk from "chalk";
import { Command } from "commander";
import { runMem } from "../commands/mem.js";
import {
  init,
  PLATFORMS,
  PLATFORM_LABELS,
  update,
} from "../commands/skills.js";
import type { Platform } from "../commands/skills.js";
import { upgrade } from "../commands/upgrade.js";
import { VERSION } from "../constants/version.js";

function fail(error: unknown): never {
  console.error(
    chalk.red("Error:"),
    error instanceof Error ? error.message : error,
  );
  if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
    console.error(error instanceof Error ? error.stack : error);
  }
  process.exit(1);
}

const program = new Command();

program
  .name("trellis")
  .description(
    "Recall local AI agent sessions (trellis mem) and install manual-only collaboration skills into a project",
  )
  .version(VERSION, "-v, --version", "output the version number");

const initCommand = program
  .command("init")
  .description(
    "Install the bundled skills into the current project (.claude/skills, .agents/skills)",
  );
for (const p of PLATFORMS) {
  initCommand.option(`--${p}`, `Install skills for ${PLATFORM_LABELS[p]}`);
}
initCommand
  .option("-f, --force", "Overwrite changed skill files without asking")
  .option("--dry-run", "Show what would change without writing")
  .action(async (options: Record<string, unknown>) => {
    try {
      const platforms = PLATFORMS.filter((p): p is Platform =>
        Boolean(options[p]),
      );
      await init({
        platforms,
        force: options.force as boolean | undefined,
        dryRun: options.dryRun as boolean | undefined,
      });
    } catch (error) {
      fail(error);
    }
  });

program
  .command("update")
  .description(
    "Refresh installed skills from this CLI version; changed files are shown as a diff before overwriting",
  )
  .option("-f, --force", "Overwrite changed skill files without asking")
  .option("--dry-run", "Show what would change without writing")
  .action(async (options: Record<string, unknown>) => {
    try {
      await update({
        force: options.force as boolean | undefined,
        dryRun: options.dryRun as boolean | undefined,
      });
    } catch (error) {
      fail(error);
    }
  });

program
  .command("upgrade")
  .description("Upgrade the global Trellis CLI package")
  .option(
    "--tag <tag>",
    "npm dist-tag or version to install (default follows current channel: latest, beta, or rc)",
  )
  .option("--dry-run", "Print the install command without running it")
  .action(async (options: Record<string, unknown>) => {
    try {
      await upgrade({
        tag: options.tag as string | undefined,
        dryRun: options.dryRun as boolean,
      });
    } catch (error) {
      fail(error);
    }
  });

program
  .command("mem")
  .description(
    "Search/recall local AI conversation history across Claude Code, Codex, DeepSeek Harness and more (run 'trellis mem help' for subcommands and flags)",
  )
  .allowUnknownOption(true)
  .helpOption(false)
  .argument(
    "[args...]",
    "subcommand and arguments (list|search|context|extract|projects|help)",
  )
  .action((args: string[] = []) => {
    try {
      runMem(args);
    } catch (error) {
      fail(error);
    }
  });

program.parse();
