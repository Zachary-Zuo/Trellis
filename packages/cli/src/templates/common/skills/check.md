# Verification

Verify that the requirement was implemented correctly. Not that the code matches the spec — that the change does what was asked.

Verification runs **once** per task. Repeat it only when it fails and you had to change the code.

For a change made without a task, the input is the restatement the user confirmed.

---

## Step 1: Know what you are proving

Read the acceptance criteria in `prd.md`. Each one is an observable outcome of the request.

If a criterion is not observable, fix the criterion with the user before verifying against it. Never weaken a criterion to make it pass, and never invent a threshold, metric, benchmark or test count that the user did not ask for.

## Step 2: List the change

```bash
git diff --name-only HEAD
git status
```

## Step 3: Evidence per criterion

For each acceptance criterion, produce evidence:

- a command and its output,
- a `file:line`, or
- a short argument, when the criterion is about a decision rather than a behavior.

If you cannot evidence a criterion, mark it **unverified** and say so. Do not fabricate evidence, and do not substitute a proxy (a passing lint run is not evidence that a behavior works).

## Step 4: Run the checks related to the change

Lint, type-check, and the existing tests that cover the code you touched. If a check cannot run in this environment, say so; do not swap in a different check and present it as the same thing.

Do not add tests to reach a coverage number. Add one only when the requirement asks for it, when fixing a bug (one minimal reproduction), or when you changed behavior an existing test covers.

## Step 5: Scope self-check

- [ ] Any tidying of code the task did not require?
- [ ] Any abstraction, config or extension point added for a case that does not exist yet?
- [ ] Any speculative fallback for a state that cannot occur?
- [ ] Any file changed that the acceptance criteria do not mention?
- [ ] Any workaround added at the caller instead of a fix where the behavior actually lives?

Cross-layer or multi-package change? `guides/thinking-triggers.md` lists the triggers worth walking through — read it when the change crosses a layer or copies existing logic, not on every change.

## Step 6: Report, and fix only what is mechanical

Report every finding.

- **Mechanical and local** (a lint nit, a missing type, a wrong import, a dead branch, a failing assertion) → fix it in place, then re-run the checks from Step 4.
- **Design or judgment** (naming a shared concept, moving a module boundary, changing a public interface, deciding where behavior lives) → record the evidence and your recommendation, and stop. Do not rewrite it silently.

Reviewer constraint: flag only issues that affect correctness or the stated requirement. Everything else is an optional suggestion — list it, and do not act on it.

If a fix would touch files outside the current task's scope, say so and stop rather than widening the change.
