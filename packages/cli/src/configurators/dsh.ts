/**
 * DeepSeek Harness (dsh) configurator.
 *
 * dsh reaches hooks only through the `@deepseek-ai/dsh-hooks-claude-code`
 * bridge, which the operator mounts once in their DSH profile; Trellis writes
 * the bridge config and the scripts it names. Four output paths:
 * - `.agents/skills/` — workflow + bundled skills, written via the NEUTRAL
 *   resolver so the files stay byte-identical to Codex/Gemini/Pi/Kimi writes
 *   into the same shared root (dsh discovers `.agents/skills/` natively).
 * - `.dsh/skills/` — dsh-private entry skills plus collision-free Trellis role
 *   skills (trellis-agent-implement / trellis-agent-check /
 *   trellis-agent-research) with the pull-based prelude on implement/check.
 * - `.dsh/hooks/` + `.dsh/hooks.json` — the shared hook scripts and the Claude
 *   Code dialect config the bridge reads.
 * - `.dsh/DSH.md` — operator guide and a configDir-owned tracked file for
 *   platform detection and uninstall scoping.
 *
 * dsh has no declarative custom sub-agent definitions (dispatch goes through
 * the `subagent` tool), so the agent prompts ship as skills.
 */

import { AI_TOOLS } from "../types/ai-tools.js";
import {
  getAllAgents,
  getDshGuide,
  getDshHooksConfig,
} from "../templates/dsh/index.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSharedHooks,
  collectSkillTemplates,
  replacePythonCommandLiterals,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolveSkillsNeutral,
  type AgentContent,
} from "./shared.js";

/**
 * Command templates that become user-invocable dsh skills
 * (loaded by their `trellis-<name>` skill names). dsh has no slash-command
 * mechanism besides skills, so every command that should be reachable in a
 * dsh project has to be listed here — not just the session-boundary ones.
 */
const DSH_COMMAND_SKILL_NAMES = new Set([
  "trellis-start",
  "trellis-continue",
  "trellis-finish-work",
  "trellis-spec-review",
]);

/** Commands resolved as dsh skills (dsh-private root, so platform-specific
 *  `{{CLI_FLAG}}` / `{{CMD_REF}}` resolution is correct). */
function resolveDshCommandSkills(): ReturnType<typeof resolveAllAsSkills> {
  const ctx = AI_TOOLS.dsh.templateContext;
  return resolveAllAsSkills(ctx).filter((skill) =>
    DSH_COMMAND_SKILL_NAMES.has(skill.name),
  );
}

/**
 * `trellis-start` as an explicit escape hatch.
 *
 * `resolveAllAsSkills` drops `start` once `hasHooks` is true (the SessionStart
 * hook injects the workflow overview instead), which is right for the automatic
 * path but would leave a dsh user with no way to bootstrap Trellis on demand.
 * Claude Code keeps `/trellis:start` as a command for exactly this; dsh has no
 * slash-command mechanism, so it stays a skill.
 */
function resolveDshStartSkill(): ReturnType<typeof resolveAllAsSkills> {
  const ctx = { ...AI_TOOLS.dsh.templateContext, hasHooks: false };
  return resolveAllAsSkills(ctx).filter(
    (skill) => skill.name === "trellis-start",
  );
}

/** Trellis agent prompts as DSH-private skills. The `trellis-agent-*` names
 *  intentionally do not collide with shared main-session workflow skills such
 *  as `.agents/skills/trellis-check`. */
function resolveDshAgentSkills(): AgentContent[] {
  return applyPullBasedPreludeMarkdown(getAllAgents()).map((agent) => {
    const name = agent.name.replace(/^trellis-/, "trellis-agent-");
    return {
      ...agent,
      name,
      content: replacePythonCommandLiterals(agent.content).replace(
        /^name:\s*trellis-[^\r\n]+$/m,
        `name: ${name}`,
      ),
    };
  });
}

/**
 * The DeepSeek Harness file set — written at init and diffed by `trellis update`.
 */
export function collectDshTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.dsh.templateContext;
  const files = new Map<string, string>();

  // 1. Workflow + bundled skills → shared `.agents/skills/` (neutral
  //    rendering, byte-identical to Codex/Gemini/Pi/Kimi writes).
  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  // 2. Commands-as-skills + Trellis agent prompts → `.dsh/skills/`.
  for (const [filePath, content] of collectSkillTemplates(".dsh/skills", [
    ...resolveDshCommandSkills(),
    ...resolveDshStartSkill(),
    ...resolveDshAgentSkills(),
  ])) {
    files.set(filePath, content);
  }

  // 3. Hook scripts + bridge config → `.dsh/hooks/` and `.dsh/hooks.json`.
  //    `.dsh/hooks.json` is what the operator mounts through
  //    `@deepseek-ai/dsh-hooks-claude-code`; it is written unconditionally, so
  //    `trellis update` re-materializes it in projects initialized before dsh
  //    had any hook support.
  for (const [k, v] of collectSharedHooks(".dsh/hooks", "dsh")) {
    files.set(k, v);
  }
  files.set(".dsh/hooks.json", getDshHooksConfig());

  // 4. Operator guide → `.dsh/DSH.md`.
  files.set(".dsh/DSH.md", getDshGuide());

  return files;
}
