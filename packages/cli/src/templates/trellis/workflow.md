# Development Workflow

---

## Core Principles

1. **Plan before code** — decide what to do before starting.
2. **Cost scales with the change** — a small change gets a short path; only complex work pays for artifacts.
3. **Rules are advice, not gates** — follow the workflow unless a step costs more than it returns; say so when you skip one.
4. **Specs are injected, not remembered** — guidelines reach you through hooks, not recall.
5. **Persist what outlives the session** — decisions, research, and lessons go to files; conversations get compacted.
6. **Code is the source of truth** — specs hold only what code cannot express.

## Verification Principles

- Verification proves the requirement was implemented correctly. Its input is the acceptance
  criteria in `prd.md` (task mode) or the confirmed restatement (no-task mode). Its output is
  evidence per criterion: a command output, a file:line, or a short argument.
- Acceptance criteria are observable outcomes of what the user asked for. Never invent
  quantitative thresholds, metrics, or benchmarks the user did not state. If a threshold is
  needed, ask once.
- Do not write tests to reach a coverage number. Add a test only when the requirement asks for
  it, when fixing a bug (one minimal reproduction), or when you changed behavior that an
  existing test covers.
- Run only checks related to the change: lint, type-check, existing tests that cover the touched
  code. If a check cannot run, say so; do not substitute a different check.
- Verify against the code and the acceptance criteria, not against the spec. Specs only supply
  conventions the code cannot express.
- When reviewing, flag only issues that affect correctness or the stated requirement. List
  everything else as optional suggestions and do not act on them.

## Avoid Over-engineering

- Only make changes that are directly requested or clearly necessary. A bug fix does not need
  surrounding code cleaned up.
- Do not add error handling, fallbacks, or validation for scenarios that cannot happen. Trust
  internal code and framework guarantees. Validate at system boundaries only (user input,
  external APIs, files from outside the repo).
- Do not create helpers, abstractions, or configuration for one-time operations or hypothetical
  future requirements. The right amount of complexity is the minimum needed for the current task.
- Do not add docstrings, comments, or type annotations to code you did not change.

---

## Trellis System

### Developer Identity

```bash
python3 ./.trellis/scripts/init_developer.py <your-name>
```

Creates `.trellis/.developer` (gitignored) and `.trellis/workspace/<your-name>/`.

### Spec System

`.trellis/spec/<package>/<layer>/index.md` maps a package/layer to its guideline files; `.trellis/spec/guides/index.md` holds cross-package thinking guides.

```bash
python3 ./.trellis/scripts/get_context.py --mode packages   # list packages / layers
```

Spec content is injected by path when you edit a matching file. A spec earns its place only by holding what code cannot express: a constraint that breaks tests when violated, a decision with its reason, or a lesson from a real incident. Everything derivable from reading the code belongs in the code.

### Task System

A task owns `.trellis/tasks/{MM-DD-name}/`: `task.json`, `prd.md`, `design.md` + `implement.md` for complex work, optional `research/`, and optional `implement.jsonl` / `check.jsonl` manifests for sub-agent context.

```bash
python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>] [--parent <dir>]
python3 ./.trellis/scripts/task.py start <name>       # status → in_progress
python3 ./.trellis/scripts/task.py current --source   # active task + how it was resolved
python3 ./.trellis/scripts/task.py finish             # clear the active task
python3 ./.trellis/scripts/task.py archive <name>     # status=completed, move to archive/
python3 ./.trellis/scripts/task.py add-context <name> <implement|check> <file> <reason>
```

Run `python3 ./.trellis/scripts/task.py --help` for the authoritative list.

### Workspace System

`.trellis/workspace/<developer>/journal-N.md` records every session (max 2000 lines per file; a new file is created on overflow). `index.md` is the personal index.

```bash
python3 ./.trellis/scripts/add_session.py --title "Title" --commit "hash" --summary "Summary"
```

### Context Script

```bash
python3 ./.trellis/scripts/get_context.py                            # full session runtime
python3 ./.trellis/scripts/get_context.py --mode packages            # packages + spec layers
python3 ./.trellis/scripts/get_context.py --mode phase --step <X.Y>  # one workflow step
```

---

<!--
  WORKFLOW-STATE BREADCRUMB CONTRACT

  The [workflow-state:STATUS] blocks below are the SINGLE source of truth for
  the per-turn `<workflow-state>` breadcrumb. inject-workflow-state.py and
  inject-workflow-state.js only parse them; no fallback text is baked into the
  scripts.

  TOKEN BUDGET: SessionStart injects the text between `## Phase Index` and
  `## Phase 1: Plan` after removing HTML comments, `[workflow-state:*]` blocks,
  and bare marker lines. Tag blocks therefore cost ZERO per session — only
  prose inside that range is a token tax. Keep that range lean; put step detail
  after `## Phase 1: Plan`, where it is loaded on demand by
  `get_context.py --mode phase --step <X.Y>`.

  MISSING TAG: build_breadcrumb falls back from `<status>-inline` to `<status>`
  and only then to a generic "Refer to workflow.md for current step." line, so
  a deleted variant block degrades gracefully instead of breaking the turn.

  STATUS charset: [A-Za-z0-9_-]+

  Runtime contract, status writers, and the hook reachability matrix:
    .trellis/spec/cli/backend/workflow-state-contract.md
-->

## Phase Index

```
Phase 1: Plan    → agree the requirements, then get approval before implementing
Phase 2: Execute → implement, then verify once against the acceptance criteria
Phase 3: Finish  → commit; archive only when the user says so
```

### Two modes

| Mode | Entered when | Artifacts | Ends with |
|---|---|---|---|
| **A. No task** (default) | the user did not ask for a task | none | checks pass → commit → report files, checks, commit |
| **B. Task** | the user explicitly asks for a task | `prd.md` + `design.md` + `implement.md` | verify once → commit → archive on the user's word |

In mode A the agent may suggest creating a task once. If the user does not answer, keep going in mode A.

[workflow-state:no_task]
No active task. Default: do not create a task.
Before editing, restate the requirement, what you will change, and what you will not do;
then wait for confirmation. Create a task only when the user explicitly asks, then load
`trellis-brainstorm`. After changes: run change-related checks, commit unless told not to,
report files, checks, and commit.
[/workflow-state:no_task]

[workflow-state:task_error]
The active task record could not be read. Do not create or activate another task.
Inspect the task directory named above and repair its task.json. It must be a valid JSON object with a non-empty status.
Preserve existing task fields and artifacts. If the correct status cannot be determined safely, ask the user before reconstructing the record.
[/workflow-state:task_error]

[workflow-state:planning]
Load `trellis-brainstorm`; stay in planning.
Finish `prd.md`, `design.md`, and `implement.md`; present the planning summary and wait for approval before `task.py start`.
Acceptance criteria are observable outcomes of the request; never invent thresholds, metrics, or test counts.
There is one task shape: no lightweight tier. A tiny task does not need a task at all (mode A).
Multi-deliverable scope: consider a parent task plus independently verifiable child tasks; dependencies belong in the child artifacts, not implied by tree position.
[/workflow-state:planning]

<!-- Per-turn breadcrumb: shown throughout Phase 1 when codex.dispatch_mode=inline.
     The main agent edits code directly in Phase 2, so the dispatch protocol
     below does not apply; only this block's wording differs. -->

[workflow-state:planning-inline]
Load `trellis-brainstorm`; stay in planning.
Finish `prd.md`, `design.md`, and `implement.md`; present the planning summary and wait for approval before `task.py start`.
Acceptance criteria are observable outcomes of the request; never invent thresholds, metrics, or test counts.
Multi-deliverable scope: consider a parent task plus independently verifiable child tasks; dependencies belong in the child artifacts, not implied by tree position.
Inline mode: no jsonl manifests needed; Phase 2 reads artifacts and specs directly.
[/workflow-state:planning-inline]

[workflow-state:in_progress]
Implement in the main session by default; sub-agents are optional (see 2.1 for your platform).
Main-session default: dispatch sub-agents; dispatch is main session only. Dispatch prompt starts with `Active task: <task path from task.py current>`.
Sub-agent self-exemption: if already running as `trellis-implement`, do NOT spawn another `trellis-implement`; if already running as `trellis-check`, do NOT spawn another `trellis-check`.
Then verify once against the `prd.md` acceptance criteria plus change-related lint / type-check /
existing tests (2.2): give evidence per criterion, and never invent a metric the user did not ask for.
When checks pass, commit (Phase 3.4). Do not amend, do not push.
Write spec only for a non-obvious pitfall or a decision future sessions must know (Phase 3.3).
Archive only when the user says so (Phase 3.5).
[/workflow-state:in_progress]

<!-- Per-turn breadcrumb: shown while status='in_progress' when
     codex.dispatch_mode=inline. The main session edits code directly, so the
     dispatch and self-exemption lines above do not apply. -->

[workflow-state:in_progress-inline]
Implement in the main session; do not dispatch implement/check sub-agents.
Verify once against the `prd.md` acceptance criteria plus change-related lint / type-check / existing tests (2.2).
When checks pass, commit (Phase 3.4). Do not amend, do not push.
Write spec only for a non-obvious pitfall or a decision future sessions must know (Phase 3.3).
Archive only when the user says so (Phase 3.5).
[/workflow-state:in_progress-inline]

[workflow-state:completed]
Code committed. Run `/trellis:finish-work`; if dirty, return to Phase 3.4 first.
[/workflow-state:completed]

### Active Task Routing

When a user request matches one of these intents inside an active task, route first, then load the detailed step if needed.

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code, DeepSeek Harness]

- Planning or unclear requirements -> `trellis-brainstorm`.
- `in_progress` implementation/check -> dispatch `trellis-implement` / `trellis-check`.
- Repeated debugging -> `trellis-break-loop`; spec updates -> `trellis-update-spec`.

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code, DeepSeek Harness]

[codex-inline, Kilo, Antigravity, Devin]

- Planning or unclear requirements -> `trellis-brainstorm`.
- Before editing -> `trellis-before-dev`; after editing -> `trellis-check`.
- Repeated debugging -> `trellis-break-loop`; spec updates -> `trellis-update-spec`.

[/codex-inline, Kilo, Antigravity, Devin]

### Rules

1. Continue from the next unfinished step in your phase. `[required]` steps are never skipped; `[once]` steps are skipped when their output already exists.
2. Phases roll back: a defect found in Execute sends you back to Plan, then re-enter Execute.

### Loading Step Detail

```bash
python3 ./.trellis/scripts/get_context.py --mode phase --step <step>
# e.g. python3 ./.trellis/scripts/get_context.py --mode phase --step 1.1
```

---

## Phase 1: Plan

Mode B only. In mode A there is no Phase 1 — see the `no_task` breadcrumb.

### Planning Artifacts

- `prd.md` — goal, requirements, constraints, acceptance criteria. No technical design and no execution checklist.
- `design.md` — boundaries, contracts, data flow, tradeoffs, compatibility, rollout / rollback shape.
- `implement.md` — ordered checklist, validation commands, review gates, rollback points.
- `implement.jsonl` / `check.jsonl` — optional spec/research manifests for sub-agent context. They do not replace `implement.md`.

Before `task.py start`: `prd.md`, `design.md`, and `implement.md` must all exist and be reviewed by the user.

### Parent / Child Task Trees

Use a parent task when one request contains several independently verifiable deliverables. The parent owns the source requirements, the task map, cross-child acceptance criteria, and the final integration review; it normally is not the implementation target.

Use child tasks for work that can be planned, implemented, checked, and archived independently. Parent/child structure is not a dependency system: if child B must wait for child A, write that ordering in child B's `prd.md` / `implement.md` and keep each child's acceptance criteria testable.

Create new children with `task.py create "<title>" --slug <name> --parent <parent-dir>`. Link existing tasks with `task.py add-subtask <parent> <child>`, and unlink mistakes with `task.py remove-subtask <parent> <child>`. Always start the child that owns the next independently verifiable deliverable; do not start the parent just because children exist.

#### 1.0 Create task `[required · once]`

Create the task only after the user asks for one. The command sets status to `planning`, writes `task.json`, creates `prd.md`, and auto-targets the new task when session identity is available:

```bash
python3 ./.trellis/scripts/task.py create "<task title>" --slug <name>
```

`--slug` is the human-readable name only — do **not** add the `MM-DD-` prefix; `create` adds it.

For a task tree, create the parent first, then each child with `--parent <parent-dir>`. Do not start the parent just because children exist; start the child that owns the next deliverable.

Run only `create` here. `start` flips the status to `in_progress` and switches the breadcrumb before the artifacts have been reviewed — that belongs to step 1.4.

Skip when `task.py current --source` already points to this task.

#### 1.1 Requirement exploration `[required · repeatable]`

Load the `trellis-brainstorm` skill and explore the requirements with the user. It drives: one question at a time, evidence before questions, updating `prd.md` immediately after each answer, and producing `design.md` + `implement.md` before implementation.

When considering a parent/child split:
- Use a parent task when one request contains several independently verifiable deliverables.
- Parent tasks own source requirements, child-task mapping, cross-child acceptance criteria, and final integration review.
- Child tasks own actual deliverables that can be planned, implemented, checked, and archived independently.
- Parent/child structure is not a dependency system. If child B depends on child A, write that ordering in child B's `prd.md` / `implement.md`.
- Do not start the parent unless the parent itself has direct implementation work.

Return to this step whenever the requirements change and revise the relevant artifact.

#### 1.2 Research `[optional · repeatable]`

Research may happen at any point during requirement exploration, and is not limited to local code — use any available tool (MCP servers, skills, web search) for third-party docs, API references, and prior art.

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code, DeepSeek Harness]

Spawn the research sub-agent:

- **Agent type**: `trellis-research`
- **Task description**: Research <specific question>
- **Key requirement**: output MUST be persisted to `{TASK_DIR}/research/`
- **DeepSeek Harness**: tell the child to load `trellis-agent-research` exactly once. If `trellis_wait` is available, use the default continuable background mode and consume each settlement notice before advancing. Without `trellis_wait`, dispatch with `run_in_background: false`. Do not poll or sleep.

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code, DeepSeek Harness]

[codex-inline, Kilo, Antigravity, Devin]

Do the research in the main session and write findings into `{TASK_DIR}/research/`.

[/codex-inline, Kilo, Antigravity, Devin]

One file per topic (e.g. `research/auth-library-comparison.md`). Record library usage examples, API references, version constraints, and the spec paths you found.

**Key principle**: research output goes to files, not only into the chat. Conversations get compacted; files do not.

#### 1.3 Context manifests `[optional · once]`

`implement.jsonl` and `check.jsonl` exist only to hand a sub-agent the spec and research context it needs. The main session reads specs through path-based injection, so a main-session implementation does not need them at all.

Fill them in when Phase 2 will dispatch sub-agents. One JSON object per line, repo-root relative:

```json
{"file": ".trellis/spec/cli/backend/spec-injection.md", "reason": "how the hook matches and budgets injection"}
```

Specs and `{TASK_DIR}/research/*.md` only — never code paths, and never a file you are about to modify. `task.py start` refuses an empty manifest only when the file was seeded; pass `--allow-empty-context` when empty is intentional.

#### 1.4 Activate task `[required · once]`

After the user has reviewed the artifacts and said to proceed:

```bash
python3 ./.trellis/scripts/task.py start <task-dir>
```

`prd.md`, `design.md`, and `implement.md` must all exist. This is the only blocking confirmation in mode B; the breadcrumb then switches to `[workflow-state:in_progress]`.

If `start` errors with a session-identity message (no context key from hook input, `TRELLIS_CONTEXT_ID`, or platform-native session env), follow the hint in the error, then retry.

---

## Phase 2: Execute

Goal: turn the reviewed plan into code that satisfies the requirement.

### Sub-agent dispatch protocol

This section is loaded on demand (it sits outside the per-turn Phase Index range). It applies only when you choose to dispatch a sub-agent in 2.1 / 2.2.

Sub-agent dispatch protocol applies to all platforms and all sub-agents, including native Codex `SubagentStart` context injection with child-side pull fallback, class-2 Gemini/Qoder/Copilot/Reasonix/Trae/Grok/Kimi Code/DeepSeek Harness, hook-backed ZCode/Snow, and `trellis-research`: every dispatch prompt starts with `Active task: <task path from task.py current>` before role-specific instructions. On Grok Build, use `spawn_subagent` with `subagent_type` set to the Trellis agent name (e.g. `trellis-implement`). On Kimi Code, dispatch the built-in `coder` / `explore` sub-agent with the matching `.kimi-code/skills/trellis-<role>/SKILL.md` instructions. On DeepSeek Harness, tell the child to load the matching `.dsh/skills/trellis-agent-<role>/SKILL.md` exactly once, then choose the synchronization path by capability. If the optional companion plugin exposes `trellis_wait`, dispatch `subagent` in its default continuable background mode, continue independent work, and call `trellis_wait` once per dependent child id when a dependent gate is next; each call returns only after DSH has queued that child's native settlement notice. Without `trellis_wait`, dispatch each child with `run_in_background: false` from the outset so no dependent gate can overtake it. Never simulate waiting with shell sleep, polling loops, `job_output`, repeated `list_agents`, or another long-running command, and never leave a background child without an event-driven wait path.

Tools: `trellis-implement` / `trellis-research` name sub-agent roles dispatched through your platform's sub-agent mechanism, not skills the main session loads itself (on Claude Code: use the Task/Agent tool, never the Skill tool). `trellis-update-spec` is a skill. `trellis-check` exists as both; prefer the Agent/role form when verifying after code changes.

#### 2.1 Implement `[required · repeatable]`

**Default: implement in the main session.** Dispatching a sub-agent is an option, not a requirement — use it when the work is large, parallel, or benefits from a fresh context. Whichever you choose, the acceptance criteria in `prd.md` still have to be proven in 2.2.

[Claude Code, Cursor, OpenCode, codex-sub-agent, CodeBuddy, Droid, Pi, ZCode, Snow, Oh My Pi]

Spawn the implement sub-agent:

- **Agent type**: `trellis-implement`
- **Task description**: Implement the reviewed task artifacts, consulting materials under `{TASK_DIR}/research/`; run the checks related to the change
- **Dispatch prompt guard**: The prompt MUST start with `Active task: <task path>`, then tell the spawned agent it is already the `trellis-implement` sub-agent and must implement directly, not spawn another `trellis-implement` / `trellis-check`.

The platform hook/plugin auto-handles:
- Reads `implement.jsonl` and injects referenced spec/research files into the agent prompt
- Injects `prd.md`, `design.md` if present, and `implement.md` if present
- For Codex, `SubagentStart` supplies native context injection; the agent profile keeps child-side loading as the fallback

[/Claude Code, Cursor, OpenCode, codex-sub-agent, CodeBuddy, Droid, Pi, ZCode, Snow, Oh My Pi]

[Gemini, Qoder, Copilot, Reasonix, Trae, Grok, Kimi Code, DeepSeek Harness]

Spawn the implement sub-agent:

- **Agent type**: `trellis-implement`
- **Task description**: Implement the reviewed task artifacts, consulting materials under `{TASK_DIR}/research/`; run the checks related to the change
- **Dispatch prompt guard**: The prompt MUST start with `Active task: <task path>`, then explicitly say the spawned agent is already `trellis-implement` and must implement directly without spawning another `trellis-implement` / `trellis-check`.
- **DeepSeek Harness**: tell the child to load `trellis-agent-implement` exactly once. If `trellis_wait` is available, use the default background mode, continue independent work, then wait once for that child id and consume its successful native settlement notice before Phase 2.2. Without `trellis_wait`, dispatch that child with `run_in_background: false`. Do not poll or sleep.

The pull-based sub-agent definition auto-handles the context load requirement:
- Resolves the active task with `task.py current --source`, then reads `prd.md`, `design.md` if present, and `implement.md` if present
- Reads `implement.jsonl` and requires the agent to load each referenced spec/research file before coding

[/Gemini, Qoder, Copilot, Reasonix, Trae, Grok, Kimi Code, DeepSeek Harness]

[Kiro]

Spawn the implement sub-agent:

- **Agent type**: `trellis-implement`
- **Task description**: Implement the reviewed task artifacts, consulting materials under `{TASK_DIR}/research/`; run the checks related to the change
- **Dispatch prompt guard**: Tell the spawned agent it is already the `trellis-implement` sub-agent and must implement directly, not spawn another `trellis-implement` / `trellis-check`.

The platform prelude auto-handles the context load requirement:
- Reads `implement.jsonl` and injects referenced spec/research files into the agent prompt
- Injects `prd.md`, `design.md` if present, and `implement.md` if present

[/Kiro]

[codex-inline, Kilo, Antigravity, Devin]

1. Load the `trellis-before-dev` skill to read project guidelines
2. Read `{TASK_DIR}/prd.md`, then `design.md` if present, then `implement.md` if present
3. Consult materials under `{TASK_DIR}/research/`
4. Implement the code per reviewed artifacts
5. Run the checks related to the change

[/codex-inline, Kilo, Antigravity, Devin]

#### 2.2 Verify `[required · repeatable]`

Verify **once** per task, against the requirement — not against the spec. Repeat only when verification fails and you had to change the code.

1. Read the acceptance criteria in `prd.md`. In mode A, read the restatement the user confirmed.
2. `git diff --name-only` to list what changed.
3. For each criterion, give evidence: a command output, a `file:line`, or a short argument. Mark anything you cannot evidence as **unverified** — never fabricate evidence.
4. Run the checks related to the change: lint, type-check, and existing tests that cover the touched code. If a check cannot run, say so; do not substitute a different check and do not weaken an acceptance criterion to pass.
5. Scope self-check: only requested or clearly necessary changes; no invented abstractions; no cleanup of untouched code.

Fix mechanical problems in place. Report judgment calls and stop.

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code, DeepSeek Harness]

A `trellis-check` sub-agent may do steps 2-5 instead of the main session:

- **Agent type**: `trellis-check`
- **Task description**: review the changes against `prd.md` acceptance criteria; fix mechanical problems in place, report judgment calls
- **Dispatch prompt guard**: The prompt MUST start with `Active task: <task path>`, then tell the spawned agent it is already the `trellis-check` sub-agent and must review/fix directly, not spawn another `trellis-check` / `trellis-implement`.
- Reviewer constraint to pass through: flag only issues that affect correctness or the stated requirement; list everything else as optional suggestions and do not act on them.
- On DeepSeek Harness, tell the child to load `trellis-agent-check` exactly once; same `trellis_wait` rule as 2.1.

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code, DeepSeek Harness]

[codex-inline, Kilo, Antigravity, Devin]

Load the `trellis-check` skill and verify against the acceptance criteria plus lint / type-check / existing tests. Fix mechanical problems, report judgment calls.

[/codex-inline, Kilo, Antigravity, Devin]

Cross-layer or multi-package changes: `guides/thinking-triggers.md` lists the triggers worth walking through.

#### 2.3 Rollback `[on demand]`

- verification reveals a defect in `prd.md` → return to Phase 1, fix `prd.md`, then redo 2.1
- the implementation went wrong → revert the code, redo 2.1
- more research needed → same as 1.2, write findings into `research/`

---

## Phase 3: Finish

Goal: commit the work, and record anything the next session must know.

> Step 3.1 was folded into 2.2 and 3.4. Numbering is kept stable to avoid breaking external references.

#### 3.2 Debug retrospective `[on demand]`

Only when this task involved the same problem being fixed more than once. Load the `trellis-break-loop` skill to classify the root cause, explain why the earlier fixes failed, and propose prevention.

#### 3.3 Spec note `[optional · once]`

Write to `.trellis/spec/` only when the task hit a non-obvious pitfall, made a decision a future session must know, or found a convention that differs from the language / framework default. Before writing, ask whether the fact is derivable from the code in a minute — if it is, do not write it.

When you do write, say which existing entry this replaces or retires, and remove that one. Load the `trellis-update-spec` skill for the file conventions. A conclusion of "nothing to write" is a normal outcome.

#### 3.4 Commit `[required · once]`

Commit this task's changes once 2.2 has passed. Do not wait for a second confirmation, and do not invent a commit plan the user has to approve.

1. `git status --porcelain` to snapshot the dirty paths.
2. Take `git log --oneline -5` as the style reference (prefix, language, length).
3. Commit only files you changed in this session, grouped by coherent change unit — not one commit per file.
4. Do **not** touch unrecognized dirty files. List them in the report.
5. Never `git commit --amend`. Never push.

If the user asks for changes after seeing the result, add a new commit rather than rewriting history.

#### 3.5 Wrap-up

Tell the user they can run `/trellis:finish-work` to archive the task and record the session. Archiving is theirs to trigger; the two bookkeeping commits stay as they are.

---

## Customizing Trellis (for forks)

This section is for changing the workflow itself. Customization means editing this file; the scripts are parsers only.

### Changing what a step means

Edit the step body in the Phase 1 / 2 / 3 sections. Invariants:
- With no active task, the default is *not* to create one, and the agent restates what it will change before editing.
- A task requires `prd.md`, `design.md`, and `implement.md` before `task.py start`.
- Commit happens once checks pass and contains only this task's files; archiving happens only when the user asks.
- Anything a per-turn decision depends on must live inside the `## Phase Index` → `## Phase 1: Plan` range or in a `[workflow-state:*]` block; everything else is loaded on demand and will not be seen per turn.

### Breadcrumb tag scopes

| Scope | Tag |
|---|---|
| No active task (before Phase 1) | `[workflow-state:no_task]` |
| Active task record unreadable | `[workflow-state:task_error]` |
| All of Phase 1 (created → ready to implement) | `[workflow-state:planning]` |
| Phase 2 + Phase 3 (implementation through wrap-up) | `[workflow-state:in_progress]` |
| After archive | `[workflow-state:completed]` (currently unreachable — see the contract file) |

### Changing the per-turn prompt text

Edit the body of the relevant `[workflow-state:STATUS]` block. No script change is needed: run `trellis update` if you maintain the template, or restart your session if you are customizing your own project.

Codex `dispatch_mode: inline` used to select `<status>-inline` variants. Those blocks are gone; `build_breadcrumb` falls back from `<status>-inline` to `<status>`, so the mode no longer needs its own text. Do not re-add variants unless a mode genuinely needs different words per turn — duplicated text drifts.

### Adding a custom status

Add a block anywhere inside the `## Phase Index` range:

```
[workflow-state:<STATUS>]
your per-turn prompt text
[/workflow-state:<STATUS>]
```

`<STATUS>` is a placeholder: the parser's charset is `[A-Za-z0-9_-]+`, so a literal name here would be read as a real breadcrumb key.

Constraints:
- STATUS charset: `[A-Za-z0-9_-]+`
- Something must actually write `task.json.status` to that value, or the tag is never read
- Lifecycle hooks live in `task.json.hooks.after_*` and bind to `after_create / after_start / after_finish / after_archive`

The parser scans the whole file and is **not** fence-aware, so a real tag written inside a documentation example becomes a real breadcrumb key. Always use a non-matching placeholder in examples.

### Adding a lifecycle hook

```json
{
  "hooks": {
    "after_finish": [
      "your-script-or-command-here"
    ]
  }
}
```

Supported events: `after_create / after_start / after_finish / after_archive`. `after_finish` is not a status change (it only clears the active-task pointer); use `after_archive` for "task is done" notifications.

### Full contract

- `.trellis/spec/cli/backend/workflow-state-contract.md` — runtime contract, status writers, hook reachability matrix
- `.trellis/scripts/inject-workflow-state.py` — the actual parser (reads workflow.md; no embedded text)
