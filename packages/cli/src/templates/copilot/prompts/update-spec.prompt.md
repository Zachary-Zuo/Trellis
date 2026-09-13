---
description: "Trellis Copilot prompt: Update Spec - Record What Code Cannot Express"
---

# Update Spec - Record What Code Cannot Express

Specs record the current state of what the code cannot express. They are not a log of what you learned, and they never mirror the code. Use this prompt after a change when one of the three write conditions below holds.

## Write in Only Three Cases

1. You hit a non-obvious pitfall that cost real time and would cost it again.
2. You made a decision a future session must know — a choice whose reason is not visible in the code.
3. A convention differs from the language or framework default.

If none of them holds, write nothing. "Nothing to write" is a normal outcome, not a failure.

## Ask the Four Questions First

Ask these about the fact you are considering, in order. Q1 is the strongest question.

| # | Question | Answer "yes" means |
|---|---|---|
| Q1 | Can this be read off the code in a minute? | Do not write it. At most leave one `file:line` pointer. |
| Q2 | Would violating it cause an error no test catches, or did it come from a real incident? | Keep it as one line of rule plus the consequence of breaking it. Drop the story, dates, and issue numbers. |
| Q3 | Is it a reason the code cannot express — a decision rationale, a rejected option, or a difference from the language / framework default? | Keep the reason, not the story behind it. |
| Q4 | Is it an operational how-to? | Turn it into a script or a command, and leave one pointer to it. |

All four answers "no": do not write the entry, and delete it if it already exists.

## Three Actions: Add, Modify, Remove

Every write names the existing entry it replaces or retires, and you then modify or remove that entry in the same pass. A spec records current state, not history: an entry that no longer holds is removed, not kept with a note that it is superseded.

## Size

There is no line or byte budget, and you must never trim a rule, a constraint or a decision to reach one. Length is a symptom: a spec file that keeps growing is usually one whose entries were never retired. The only shrinking rule is the one above — every write names the entry it replaces or retires, and that entry goes. If a file is long and every entry still answers a question, leave it long.

## Templates

Keep each entry this short. One concept per entry.

```markdown
### Convention: <name>
**Do**: <the rule, one line>
**Why**: <the reason the code cannot express>
See `path/file.ts:42`.
```

```markdown
### Don't: <the forbidden pattern>
**Instead**: <what to do>
**Why**: <the failure it prevents>
```

```markdown
### Common Mistake: <symptom>
**Cause**: <why it happens>
**Fix**: <how to correct it>
```

```markdown
### Design Decision: <name>
**Decision**: <what we do>
**Alternatives**: <what we rejected, one line each>
**Why**: <the reason that is not in the code>
```

## Language

This prompt is written in English. When you write into a project's `.trellis/spec/`, the spec BODY is Chinese, while file names, frontmatter keys, commands, paths, and code identifiers stay English. Do not translate technical terms such as task, spec, prd, design, implement, hook, index, package, layer, or slug.

## Checks Before Finishing

Five checks, in this order. The first two are subtractions; they come before the three additions of information.

1. **Derivable?** Could a reader get this from the code in a minute? Then do not write it; leave a `file:line` pointer at most.
2. **Already there?** Is there an equivalent entry in this file or a neighbouring one? Merge into it instead of adding a near-duplicate.
3. **Replaces or retires what?** Which existing entry does this write replace or retire, and did you actually modify or remove that entry?
4. **Stale?** Does the entry still describe what the code does now? Verify it rather than assuming — and if you cannot verify it, say so instead of writing it as fact.
5. **Evidence?** Does the entry carry a `file:line`, a command, or a concrete symbol, instead of abstract advice?

## Related

- `trellis-break-loop` - deep analysis of a bug fixed more than once; a common source of a Q2 entry.
- `trellis-finish-work` - end-of-session wrap-up; the spec note itself is optional (Phase 3.3).
