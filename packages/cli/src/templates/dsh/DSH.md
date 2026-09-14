# Trellis on DeepSeek Harness (dsh)

dsh is a **class-2 pull-based** Trellis host. It discovers Trellis skills from
the project, uses native continuable sub-agents for isolated implementation and
review roles, and exposes a stable `DSH_SESSION_ID` to every managed shell.

| Capability | Without companion plugin | With `dsh-trellis` |
| --- | --- | --- |
| Shared and entry skills | Works | Works |
| Session-scoped active task | Works through verified `DSH_SHELL=1` + `DSH_SESSION_ID`, including nested launches | Managed per-execution identity can forward a distinct child session |
| Implement/check/research roles | Foreground native sub-agent | Background native sub-agent |
| Per-turn workflow breadcrumb | Not available | Injected from `workflow.md` |
| Event-driven child wait | Not available | `trellis_wait` |
| Utility commands | Not available | `/trellis-status`, `/trellis-finish` |

## Quick start

```bash
trellis init --dsh -u your-name
dsh web        # or: dsh --profile headless "start a Trellis task for ..."
```

In dsh:

1. Describe the work in natural language and load `trellis-start` when a
   session needs explicit Trellis bootstrap.
2. The main session dispatches `trellis-agent-research`,
   `trellis-agent-implement`, and `trellis-agent-check` through DSH's native
   `subagent` tool. Each child loads exactly one matching role skill.
3. Finish through `trellis-finish-work`, which preserves the required order:
   commit, archive, then journal.

Everything above works with no configuration. To additionally get the automatic
per-turn workflow breadcrumb, SessionStart context, and path-scoped spec
injection, mount the hook bridge once — see [Hooks: mount the bridge
once](#hooks-mount-the-bridge-once) below. That step is manual by necessity: it
edits a machine-level DSH profile, not anything inside this project.

## Companion plugin fallback contract

The Trellis adapter does not install a DSH profile plugin. Before dispatching a
role, check whether the `trellis_wait` tool is available:

- If available, use DSH's default continuable background mode, continue
  independent work, then call `trellis_wait` once per dependent child id and
  consume each native settlement notice before entering the dependent gate.
- If unavailable, dispatch every child with `run_in_background: false` from the outset
  so the dependent workflow gate cannot overtake it.

Never replace either path with shell sleep, polling loops, `job_output`, or
repeated agent-list polling.

## Hooks: mount the bridge once

DSH has no hook system of its own, so Trellis cannot make these hooks fire by
writing files into the project. It writes `.dsh/hooks.json` and the scripts
under `.dsh/hooks/`; you mount the bridge that reads them.

Add this to `$DSH_HOME/cordis.patch.yml` (create the file as a top-level YAML
array if it does not exist), then restart `dsh web`:

```yaml
- insert:
    - id: hooks-claude-code
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        # Absolute: a relative path resolves against the directory that
        # launched the server, not the project.
        configPath: <absolute path to this project>/.dsh/hooks.json
        projectDir: <absolute path to this project>
        defaultTimeoutMs: 30000
```

The bridge is one config per process, so a second DSH project needs its own
`configPath` — and replacing this row is a restart, because the config is read
once at plugin load. An unmounted or unreadable `configPath` is not an error:
the bridge logs a warning and runs no hooks.

### What is mounted, and what is not

| Event | Script | Delivers |
|---|---|---|
| `SessionStart` | `session-start.py` | workflow overview in the session |
| `UserPromptSubmit` | `inject-workflow-state.py` | per-turn workflow-state breadcrumb |
| `PostToolUse` | `inject-spec-context.py` | path-scoped spec injection |
| `SubagentStart` | `inject-subagent-context.py` | child task context |

Three limitations are structural, not configuration mistakes:

- **`PreToolUse` cannot rewrite tool input.** The bridge logs and ignores
  `updatedInput`, so `inject-subagent-context.py` contributes only through
  `SubagentStart`.
- **Paths are the post-tool kind.** The `PostToolUse` matcher lists DSH's
  lowercase tool names (`read`, `write`, `edit`, `glob`, `grep`). Claude-spelled
  names would never match.
- **Spec injection needs `paths:` frontmatter.** `inject-spec-context.py` only
  matches spec files whose frontmatter declares a non-empty `paths:` list. A
  spec tree without it stays inert no matter how the hooks are mounted.

### Windows: pin the interpreter

`run-python-hook.cjs` probes for a working Python 3 by running each candidate
with captured output. Where that probe cannot run, every candidate looks
unusable and the hook exits 127. Set `TRELLIS_PYTHON` to a known interpreter to
remove the guesswork — on this repository that is the Conda `VR` environment:

```powershell
$env:TRELLIS_PYTHON = (conda env list --json | ConvertFrom-Json).envs |
  Where-Object { (Split-Path -Leaf $_) -eq 'VR' } |
  ForEach-Object { Join-Path $_ 'python.exe' }
```

## Nested host sessions

DSH inherits ordinary environment variables from the process that launches it.
If that outer process is already an active Trellis session,
`TRELLIS_CONTEXT_ID` would otherwise override the inner `DSH_SESSION_ID`.
DSH rebuilds its complete `DSH_*` namespace for each managed shell, so the beta
adapter treats `DSH_SHELL=1` together with `DSH_SESSION_ID` as the current DSH
identity and resolves it before an inherited generic override, even without the
plugin. The optional plugin additionally contributes a trusted
`DSH_TRELLIS_CONTEXT_ID` when it must forward a child identity that differs
from the shell's own session id.

## File map

- `.agents/skills/` — shared workflow and bundled skills, byte-identical to
  the other Agent Skills writers.
- `.dsh/skills/trellis-{start,continue,finish-work}/` — DSH-private entry
  skills.
- `.dsh/skills/trellis-agent-{research,implement,check}/` — child-only role
  skills; implement/check include the pull-based task context prelude.
- `.dsh/hooks/` + `.dsh/hooks.json` — shared hook scripts and the bridge config
  the operator mounts (see above).
- `.dsh/DSH.md` — this operator guide.
- `.trellis/` — workflow, specs, tasks, workspace journal, and shared scripts.

## Notes

- Generated Python commands use `python3` in source templates and are rendered
  to the detected Windows launcher during `trellis init` / `trellis update`.
- Role dispatch prompts start with `Active task: <task path>`. This exact task
  path is the child's primary context source; children must not guess globally.
- Each `dsh --profile headless` invocation creates a fresh DSH session. Do not
  expect an active-task pointer to persist across separate headless calls; keep
  the workflow in one session or explicitly resume its returned session id.
- The optional companion plugin is maintained separately at
  <https://github.com/SajoLuo/dsh-trellis>.
