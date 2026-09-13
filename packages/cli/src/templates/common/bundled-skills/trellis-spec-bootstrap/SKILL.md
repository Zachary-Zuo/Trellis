---
name: trellis-spec-bootstrap
description: "Bootstrap project-specific Trellis coding specs with a platform-neutral single-agent workflow. Use when creating or refreshing .trellis/spec guidelines, analyzing a codebase with GitNexus, ABCoder, or source inspection, decomposing package/layer spec work, and writing real codebase-backed spec docs without placeholder text."
---

# Trellis Spec Bootstrap

Use this skill to create or refresh `.trellis/spec/` guidelines from the real codebase. One capable agent owns the full loop: analyze the repository, choose the spec boundaries, write the docs, and verify the result. The workflow does not depend on a specific host, CLI, or agent brand.

## Workflow

1. Confirm Trellis is initialized and inspect the current `.trellis/spec/` tree.
2. Analyze the repository architecture with the best available tools: GitNexus, ABCoder, language tooling, and direct source reads.
3. Decompose the spec work by package and layer only when that reflects the actual codebase.
4. Delete the seed files that do not apply to this repository, then fill or reshape the remaining files with concrete patterns, file paths, examples, and anti-patterns from the project.
5. Verify that the final specs are internally consistent and contain no template placeholders.

## Shape: Fewer Files Is Better

Specs are injected by path, so a file that carries nothing project-specific is a permanent token tax on every session that touches the matching path. An absent file is correct; a padded one is not.

- Delete every seed file that does not apply instead of leaving it empty or filling it with generic advice.
- For an algorithm / research repository the right shape is one `conventions` file plus one `verification` file. A layer tree (`backend/`, `frontend/`, `api/`, `database/`) assumes a layered application — do not impose it on a solver, a notebook pipeline, or a collection of research scripts.
- Keep `index.md` as the map: the file table and when to read each entry. It is not a checklist.

## Before the First Write: Four Questions

The gate `trellis-update-spec` applies to every later write applies to initial writes too. Ask these about each entry you are considering, in order. Q1 is the strongest question.

| # | Question | Answer "yes" means |
|---|---|---|
| Q1 | Can this be read off the code in a minute? | Do not write it. At most leave one `file:line` pointer. |
| Q2 | Would violating it cause an error no test catches, or did it come from a real incident? | Keep it as one line of rule plus the consequence of breaking it. |
| Q3 | Is it a reason the code cannot express — a decision rationale, a rejected option, or a difference from the language / framework default? | Keep the reason, not the story behind it. |
| Q4 | Is it an operational how-to? | Turn it into a script or a command and leave one pointer. |

All four answers "no": do not write the entry. Code is the source of truth; a spec earns its place only by holding what code cannot express.

## Reference Routing

| Need | Read |
|------|------|
| Repository architecture analysis | [references/repository-analysis.md](references/repository-analysis.md) |
| Spec work decomposition and task planning | [references/spec-task-planning.md](references/spec-task-planning.md) |
| Writing high-signal Trellis spec files | [references/spec-writing.md](references/spec-writing.md) |
| GitNexus and ABCoder MCP setup | [references/mcp-setup.md](references/mcp-setup.md) |

## Operating Rules

- Treat templates as starting points, not contracts. Delete, rename, split, or add spec files when the repository calls for it; deleting is the default for a file that does not apply.
- Prefer source-backed rules over generic advice. Every important recommendation should point at a real file or repeated local pattern.
- Keep execution single-owner by default. Optional helper agents are an implementation detail, not a requirement or user-visible dependency.
- Do not write platform-specific instructions unless the target project already standardizes on that platform.
- Write the spec body in Chinese; file names, frontmatter keys, commands, paths, and code identifiers stay English. Do not translate technical terms such as task, spec, prd, design, implement, hook, index, package, layer, or slug.
- Do not leave placeholder text, empty headings, or copied boilerplate in `.trellis/spec/`.

## Done Criteria

- `.trellis/spec/` describes the project as it exists now.
- Each relevant package or layer has practical coding guidance with real examples.
- Non-applicable seed files are deleted, not filled with generic content.
- `index.md` files match the final spec file set.
- Any required setup or analysis assumptions are documented in the relevant spec or task notes.
