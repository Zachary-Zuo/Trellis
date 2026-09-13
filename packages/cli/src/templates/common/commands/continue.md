# Continue Current Task

Resume work on the current task — pick up at the right phase/step in `.trellis/workflow.md`.

---

## Step 1: Load Current Context

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py
```

Confirms: current task, git state, recent commits.

## Step 2: Load the Phase Index

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode phase
```

Shows the Phase Index (Plan / Execute / Finish) with routing + skill mapping.

## Step 3: Decide Where You Are

`get_context.py` shows the active task's `status` field. Route by `status` + artifact presence. This command replaces the user needing to remember the Trellis flow; it does not itself approve implementation.

- `status=planning` + no `prd.md` → **1.1** (load `trellis-brainstorm`)
- `status=planning` + artifacts incomplete → **1.1** until `prd.md`, `design.md`, and `implement.md` all exist
- `status=planning` + artifacts complete → **1.4** (present the planning summary; run `task.py start` only after the user approves it)
- `status=planning` + Phase 2 will dispatch sub-agents → **1.3** (optional `implement.jsonl` / `check.jsonl` manifests; a main-session implementation skips this)
- `status=in_progress` + implementation not started → **2.1**
- `status=in_progress` + implementation done, not yet verified → **2.2**
- `status=in_progress` + verification passed → **3.3** (optional spec note) → **3.4** (commit)
- `status=completed` (rare; usually archived immediately) → archive flow

Phase rules (full detail in `.trellis/workflow.md`):

1. Run steps **in order** within a phase — `[required]` steps must not be skipped
2. `[once]` steps are already done if the required output exists. A task needs `prd.md`, `design.md`, and `implement.md` before `task.py start`; a change too small to justify those does not need a task at all.
3. You may go back to an earlier phase if discoveries require it

## Step 4: Load the Specific Step

Once you know which step to resume at:

```bash
{{PYTHON_CMD}} ./.trellis/scripts/get_context.py --mode phase --step <X.X> --platform {{CLI_FLAG}}
```

Follow the loaded instructions. After each `[required]` step completes, move to the next.

---

## Reference

Full workflow and detailed phase steps live in `.trellis/workflow.md`. This command is only an entry point — the canonical guidance is there.
