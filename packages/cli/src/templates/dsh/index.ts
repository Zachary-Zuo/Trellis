/**
 * DeepSeek Harness (dsh) template module.
 *
 * dsh is a class-2 pull-based platform:
 * - Workflow/bundled skills go to the shared `.agents/skills/` root via the
 *   neutral resolver (byte-identical to Codex/Gemini/Pi/Kimi writes).
 * - User-invocable entry points (`trellis-start` / `trellis-continue` /
 *   `trellis-finish-work`) and Trellis role prompts live under
 *   `.dsh/skills/trellis-agent-<role>/SKILL.md`.
 * - Operator guide `.dsh/DSH.md`.
 *
 * dsh has no hook system of its own, so Trellis writes `.dsh/hooks.json` for
 * the `@deepseek-ai/dsh-hooks-claude-code` bridge and ships the shared hook
 * scripts under `.dsh/hooks/`. The operator mounts that bridge once in their
 * DSH profile — `.dsh/DSH.md` carries the snippet.
 *
 * dsh has no declarative custom sub-agent definitions, so the Trellis agent
 * prompts ship as skills; the main session dispatches them through the
 * `subagent` tool and trellis-agent-implement / trellis-agent-check get the
 * pull-based prelude.
 */

import { createTemplateReader, type AgentTemplate } from "../template-utils.js";

const { listMdAgents, readTemplate } = createTemplateReader(import.meta.url);

/** Source role prompts; the configurator installs collision-free DSH skills. */
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}

/** Operator guide copied to `.dsh/DSH.md`. */
export function getDshGuide(): string {
  return readTemplate("DSH.md");
}

/** One entry of a Claude-Code-dialect hooks.json event list. */
interface HookGroup {
  matcher?: string;
  hooks: { type: "command"; command: string; timeout: number }[];
}

/**
 * One Claude-Code-dialect hook group running a shared hook script.
 *
 * `matcher` is omitted for events that carry no matcher subject
 * (`UserPromptSubmit`) — the DSH bridge discards a matcher on those events,
 * so emitting one would be noise rather than behavior.
 */
function hookGroup(script: string, matcher?: string): HookGroup {
  return {
    ...(matcher === undefined ? {} : { matcher }),
    hooks: [
      {
        type: "command",
        command: `node .trellis/scripts/run-python-hook.cjs .dsh/hooks/${script}`,
        timeout: 30,
      },
    ],
  };
}

/**
 * The `.dsh/hooks.json` document — the DSH hook bridge config.
 *
 * DSH has no hook system of its own. It reaches these hooks through
 * `@deepseek-ai/dsh-hooks-claude-code`, which runs a Claude Code dialect
 * `hooks.json` / settings file on the harness interception seams. Trellis
 * therefore writes this document for the operator to mount once in their
 * profile; the hook scripts it names are the same shared scripts every other
 * platform uses.
 *
 * Two DSH-specific facts shape this file:
 *
 * - **Tool names are lowercase.** DSH's filesystem tools are `read`, `write`
 *   and `edit` (not Claude's `Read`/`Write`/`Edit`), and
 *   `inject-spec-context.py` matches tool names case-sensitively. Its default
 *   trigger list already contains the lowercase names, so no script change is
 *   needed — but a matcher written for Claude would never fire here.
 * - **`PreToolUse` cannot rewrite tool input.** The bridge logs and ignores
 *   `updatedInput`, so `inject-subagent-context.py`'s PreToolUse delivery path
 *   is inert on DSH; the `SubagentStart` hook below is the working path.
 */
export function getDshHooksConfig(): string {
  const config = {
    hooks: {
      SessionStart: [
        { ...hookGroup("session-start.py"), matcher: "startup" },
        { ...hookGroup("session-start.py"), matcher: "clear" },
        { ...hookGroup("session-start.py"), matcher: "compact" },
      ],
      UserPromptSubmit: [hookGroup("inject-workflow-state.py")],
      PostToolUse: [
        hookGroup("inject-spec-context.py", "read|write|edit|glob|grep"),
      ],
      SubagentStart: [
        {
          ...hookGroup("inject-subagent-context.py"),
          matcher: "general-purpose",
        },
      ],
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
