---
description: "Guide requirements discovery for a Trellis task after task-creation consent."
---

# Trellis Brainstorm

## Planning contract

A request to build, implement, fix, refactor, or "go ahead" is not approval to leave planning. Task-creation consent is also not implementation approval.

If no clarification is needed, the user's next response must approve the final planning summary described below.

While any user-owned product, scope, UX, compatibility, risk, or acceptance decision remains unresolved, end the turn with exactly one highest-value question. Do not edit product code, dispatch implementation, or run `task.py start`.

## Evidence first

If a question can be answered by exploring the codebase, explore the codebase instead.

This is mandatory. Before asking the user a question, first check whether the answer is already available in code, tests, configs, docs, existing specs, or task history.

Do not ask the user to confirm facts that the repository can answer. Ask only for product intent, preference, scope, risk tolerance, acceptance behavior, or decisions that remain ambiguous after inspection.

Repository evidence establishes current behavior and technical constraints. The user's intended behavior, feature scope boundaries, and UX preferences are never answerable by repository evidence alone, even when an existing pattern exists; existing patterns are options and recommendation evidence, not decisions.

**Exception**: situation and goal questions (see "Question design") ask about the user's own experience, history, and intent. The repository cannot answer those, so the rule above does not apply to them.

---

Use this skill during Phase 1 planning to turn the user's request into clear requirements and planning artifacts.

## Preconditions

Use this skill only after task-creation consent has been given and the user is ready to enter Trellis planning.

If no task exists yet, create one:

```bash
TASK_DIR=$({{PYTHON_CMD}} ./.trellis/scripts/task.py create "<short task title>" --description "<one-line summary>" --slug <slug>)
```

Use a concise title from the user's request. Both the title and `--description` must be non-empty — `create` rejects blanks, and a record with either one empty is refused at archive. Use a slug without a date prefix. `task.py create` adds the `MM-DD-` directory prefix automatically.

`task.py create` creates the default `prd.md`. Update that file with the current understanding before asking follow-up questions.

## Planning Flow

1. Capture the user's request and initial known facts in `prd.md`.
2. Inspect available evidence before asking questions:
   - code, tests, fixtures, and configs
   - README files, docs, existing specs, and domain notes
   - related Trellis tasks, research files, and session history when present
3. Separate what you found into:
   - confirmed facts
   - product intent still needed from the user
   - scope or risk decisions still needed from the user
   - likely out-of-scope items
4. If a user-owned decision remains, ask the single highest-value question, include your recommendation and trade-off, then stop. Do not perform implementation work in the same turn.
5. After each user answer, update `prd.md`, recompute the decision inventory, and repeat from step 2.
6. When no user-owned decision remains, create or update `design.md` and `implement.md`.
7. Run the requirement convergence gate.
8. Present the final planning summary and stop. Do not run `task.py start` or edit product code in the same turn.
9. Only a subsequent user message that explicitly approves the latest planning summary authorizes `task.py start` and implementation. If the artifacts change materially after approval, repeat the final review.

Do not invent a project-specific product/spec hierarchy. If the repository already has product, domain, or spec docs, use them. If it does not, proceed with the evidence that exists.

## Question design

A selection question — "here are two options, which do you want?" — assumes you already read the problem correctly and only need a verdict. It sits downstream of understanding. Ambiguity in the user's wording has nowhere to go in that shape, so it gets resolved silently and carried into `prd.md`.

Ask questions in this order, and clear the first four kinds before asking a selection question:

| Kind | Purpose | Typical wording |
|---|---|---|
| Situation | Establish what is actually happening. Facts, not opinions. | What happens today? When did you last hit this? Give me one concrete example. |
| Goal | Find the real objective and catch XY problems (the user described a solution, not a problem). | What will be different when this is done? What happens if we don't do it? Why now? |
| Alignment | Check your reading before building on it. | I read that as A, but it could be B. A would change X; B would change Y. Which is it? |
| Boundary | Split the problem apart. | What looks related but should stay untouched? Which part is essential and which is incidental? If the two conflict, which wins? |
| Selection | The existing shape: decision, recommendation, trade-off. | Options with a recommendation. |

**Deviation signals** — when any of these appears, ask an alignment question instead of silently following your own reading:

| Signal | Example |
|---|---|
| The user's word means something different in the code or spec | The user says "task" meaning a GitHub issue; the repository's task is `.trellis/tasks/`. |
| The user described a solution, not a problem | "Add a cache." |
| The user's example contradicts their generalization | "All platforms" but every example is Claude Code. |
| The stated goal and the requested change do not connect | The goal is fewer injections; the change adds another hook. |
| The repository already has what was asked for | Most likely you misread the request. Ask about the reading before answering "already exists". |
| Two sentences in the request conflict | "Don't touch the engine" and "change the task.json state machine". |

**Tell, then ask** — put three lines before every question:

1. What you found — a `file:line` or a fact, not an impression.
2. Your current reading of the request.
3. Why this is the most valuable thing to ask right now.

Only then ask the question. For a selection question, follow the three lines with the decision, your recommendation, and the trade-off.

**One decision point at a time** — "one question per message" means one decision point. A restatement plus one probe counts as one question. Do not stack unrelated decisions into a single message.

## Question Rules

These apply to selection questions; the other four kinds follow `## Question design`.

Ask only one question per message.

Each selection question must include:

- the decision needed
- why the answer matters
- your recommended answer
- the trade-off if the user chooses differently

Do not ask process questions such as whether to search, inspect files, or continue brainstorming. Do the evidence work directly. Ask the user only when the remaining issue is a product decision, preference, scope boundary, or risk tolerance choice.

Recommendations are not default selections. Never choose a recommended product decision on the user's behalf merely because the user asked for implementation.

Do not manufacture clarification questions when the request and repository evidence already resolve every decision. In that case, proceed directly to the final planning summary, which still requires a subsequent explicit approval.

The final review is a required phase-transition gate, not a prohibited process question. Task-creation consent, the initial implementation request, and approval given before the latest final summary do not satisfy this gate.

## Requirement Convergence Gate

Before final review, verify all of the following:

- the user outcome and product value are explicit
- in-scope and out-of-scope behavior are explicit
- acceptance criteria are observable outcomes of the request — never an invented threshold, metric, benchmark, or test count; if a number is genuinely needed, ask the user once
- user-owned product, scope, UX, compatibility, and risk decisions are resolved
- blocking open questions are empty
- technical unknowns are researched or explicitly deferred without changing MVP behavior

There is one task shape. A task needs `prd.md`, `design.md`, and `implement.md`; a change too small to justify those does not need a task at all.

The final planning summary must show Goal, In Scope, Out of Scope, Acceptance Criteria, Key Decisions, relevant Risks or Deferred Items, and artifact status.

## Artifact Rules

Body language: write task artifact bodies in Chinese. Keep file names, slugs, paths, frontmatter keys, commands, and code identifiers in English. Do not translate the terms task, spec, prd, design, implement, hook, breadcrumb, index, package, layer, slug, archive, workspace.

`prd.md` records requirements and acceptance:

- goal and user value
- confirmed facts
- requirements
- acceptance criteria
- out of scope
- open questions that still block planning

`design.md` records technical design:

- architecture and boundaries
- data flow and contracts
- compatibility and migration notes
- important trade-offs
- operational or rollback considerations

`implement.md` records execution planning:

- ordered implementation checklist
- validation commands
- risky files or rollback points
- follow-up checks before `task.py start`

There is one task shape. Do not invent intermediate shapes: a task needs `prd.md`, `design.md`, and `implement.md`, and a change too small to justify those does not need a task at all.

`implement.md` is not a replacement for `implement.jsonl`. `implement.jsonl` and `check.jsonl` are optional manifests that hand a sub-agent the spec and research files it needs; a main-session implementation does not need them at all, because specs reach the main session through path-based injection.

## Quality Bar

Before declaring planning ready:

- `prd.md`, `design.md`, and `implement.md` exist.
- Acceptance criteria are observable outcomes of the request; no invented thresholds or metrics.
- The reading of every key term in the request has been restated with concrete consequences and confirmed.
- Blocking open questions are empty.
- The latest final planning summary has been presented to the user.

Then stop. In a subsequent message, the user explicitly approves that summary before `task.py start` runs.

Do not start implementation merely because the user originally asked for implementation.
