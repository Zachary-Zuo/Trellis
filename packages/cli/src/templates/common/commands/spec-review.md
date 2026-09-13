# Trellis Spec Review

Review, tighten and shrink an existing `.trellis/spec/` tree.

This is a **user-invoked** maintenance command. It is not a workflow step, it has no hook, and it never runs as part of a task. Run it when specs have drifted from the code, when path-based injection keeps surfacing noise, or on a routine cadence.

Division of labour:

- `spec_lint.py` computes facts and makes no judgement.
- You make the judgement and write a proposal.
- Nothing is written to a spec file until the user approves the proposal.

The same four questions used here are used by `trellis-update-spec` when writing and by `trellis-spec-bootstrap` when seeding, so the tree is not written on one standard and pruned on another.

---

## Step 0: Mechanical facts

```bash
{{PYTHON_CMD}} ./.trellis/scripts/spec_lint.py
```

Add `--json` if you want to process the data yourself, or `--root DIR` to point at another checkout.

It reports, per spec file: path, lines, bytes, heading count and headings, last-modified date, whether it declares `paths:`, whether an index links to it, and how many other specs name it — with every file listed largest first, as a fact rather than a target. Plus: duplicate paragraphs, dead references (file paths, `path:symbol` anchors, CLI flags and identifiers that do not appear anywhere in the code), narrative signals (dates, issue numbers, version numbers, incident stories), and index/file inconsistencies in both directions.

It excludes `.trellis/spec/.review/` and `REVIEW-LOG.md` from the scan, and does not report paths that describe a user project's generated layout (`.opencode/…`, `.github/copilot/…`).

**There is no size budget, and size is not a criterion.** Length is a symptom: a spec file that keeps growing is usually one whose entries were never retired. The reason to cut an entry is that it fails the four questions — never that the file is long. Never trim a rule, a constraint or a decision to reach a number; if a file is large and every entry still answers a question, leave it alone and say so in the proposal.

Do not treat a finding as a verdict. A "dead" path may be an illustrative example in prose; a "dead flag" may be documented deliberately before it ships. Check before you cut, and say in the proposal which findings you rejected and why.

## Step 1: Classify every entry

Split each spec file into entries at the H2/H3 level, then ask the four questions:

| # | Question | If yes |
|---|---|---|
| Q1 | Can you get the same information by reading the code for a minute? | Do not keep it. At most leave a pointer: "see `path/file.py`". |
| Q2 | Does violating it cause a failure no test would catch, or does it come from a real incident? | Keep, as one line of rule plus the consequence. Drop narrative, dates, issue numbers. |
| Q3 | Is it a reason the code cannot express — a decision, a rejected alternative, a departure from the language/framework default? | Keep the reason, not the story behind it. |
| Q4 | Is it a how-to? | Turn it into a script or command; the spec keeps one line pointing at it. |

Q1 is the strongest question — ask it first. An entry that answers "no" to all four is deleted.

Label each entry, with one line of reasoning:

| Label | Meaning | Disposition |
|---|---|---|
| KEEP | answers a question and is already short | leave |
| TIGHTEN | answers a question but is long or carries narrative | compress to rule + consequence |
| MERGE→X | overlaps entry X | merge into X |
| DERIVABLE | Q1 is yes | delete, or leave a pointer |
| STALE | contradicts the code (decided in Step 2) | rewrite to current state, or delete |
| NARRATIVE | history, retrospective, issue reference | compress to one line of rule, or delete |
| PLACEHOLDER | template residue, "To be filled", empty heading | delete |
| ASK | uncertain — for example, a guardrail that may be deliberate | put it to the user |

Eight labels are a diagnostic vocabulary; they collapse into four actions: KEEP → keep; TIGHTEN and MERGE → compress; STALE → rewrite to the current state (delete it only when the entry should not exist at all); DERIVABLE, NARRATIVE, PLACEHOLDER → delete; ASK → ask. Write the proposal in terms of the four actions, and list rewrites and deletions separately so a rewrite is never approved as a deletion.

## Step 2: Check against the code

For KEEP and TIGHTEN entries that assert something about the code, verify it: grep, read the file, look at the tests. Mark each VERIFIED, CONTRADICTED or UNVERIFIABLE. CONTRADICTED becomes STALE; UNVERIFIABLE becomes ASK.

A claim that is false as written but true under a stated precondition counts as CONTRADICTED — narrow it to the precondition and label it STALE. Do not file it under VERIFIED because it works in the common case.

Anchor every verification at a `file:line`. A spec this size reliably contains a few claims that were true when written and are not any more.

## Step 3: Proposal — stop here for approval

Write `.trellis/spec/.review/<date>.md` (create the directory if it does not exist) and then stop. Do not edit a spec file in this step.

- Per-file disposition table: entry → label → reason → estimated line change.
- The merge list, the delete list, the rewrite list — kept separate.
- The ASK list: one line each, "I judge X, but it could be Y — please confirm".
- Totals before and after: files, lines, and bytes — reported for context, not as a target. If you kept a large file large, say why.
- Files that would benefit from a `paths:` frontmatter so injection can match them — and whether the paths already declared actually cover the files the body cites.

## Step 4: Execute (after approval)

Apply only what was approved:

- Write rewritten entries in Chinese, the language of spec bodies. Do not translate entries you are keeping just to change their language.
- Update the index to match; add `paths:` where the proposal said to.
- Delete the files that were approved for deletion — an unlinked seed file that does not apply is delete-on-sight, not a thing to fill in.
- Append one line to `.trellis/spec/REVIEW-LOG.md` (create it on first use): date, file count, lines before and after, main actions, and the path of the proposal file.

## Step 5: Wrap up

Re-run Step 0 and confirm the findings you targeted are gone. Report the before/after totals. Commit the spec changes as one commit — the proposal was approved in Step 3, so no second confirmation is needed.

---

## Protections

- **Pinned entries.** An entry may carry `<!-- pinned: <reason> -->`. A pinned entry may be TIGHTENed but never deleted or merged.
- **ASK means stop.** Anything on the ASK list that the user has not answered stays untouched.
- **Git is the safety net.** Deleted content stays in history; `REVIEW-LOG.md` records the commit range so it can be found again. There is no numeric deletion cap — if a review proposes deleting something you are unsure about, split the proposal so you can approve it in stages.

## When to run this

- When the count of archived tasks since the last review reaches about ten.
- Before a large feature, so stale specs do not supply wrong constraints.
- When path-based injection surfaces a spec that contradicts the code.
- When Step 0 reports dead references, duplicate paragraphs, or a file that has grown past the point where anyone reads it.
- Routinely: once a quarter.

---

## Reference

- What belongs in a spec at all: `trellis-update-spec`.
- Seeding a spec tree from scratch: `trellis-spec-bootstrap`.
