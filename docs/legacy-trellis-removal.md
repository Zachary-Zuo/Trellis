# 拆除旧版 Trellis 工作流

适用于用旧版 Trellis（`@mindfoldhq/trellis` 或 0.7.x 及以前的 `@zachary/trellis`）`init` 过的项目。新版只保留 `trellis mem` 和手动 skill，旧的任务目录、spec 注入、hook、子代理都不再需要。参考实例：PhotoSenseAtlas 提交 `bebaa659f`。

## 0. 先决定要留下什么

- `.trellis/spec/` 里还有用的规则：先并入项目自己的文档（如 `docs/`、`AGENTS.md`），再删。代码能推出的不用搬。
- `.trellis/tasks/` 里进行中的工作：把仍要做的目标、已拍板决定和剩余步骤写进项目的跨会话计划；其余靠 Git 历史找回。
- 记下删除前的提交号，写进拆除提交的说明里，方便以后 `git show <提交>:<路径>` 查旧任务。

## 1. 可选：用旧 CLI 的 uninstall 预览

旧版 CLI 自带 `uninstall`，它只删除自己生成且未改过的文件，可以先看一遍清单：

```bash
npx @mindfoldhq/trellis@latest uninstall --dry-run
```

它不会处理你自己加进这些目录的文件，下面的手工步骤仍需逐项核对。

## 2. 删除旧工作流文件

按项目里实际存在的平台目录处理，删除前先 `ls` 看一眼，不是 Trellis 生成的文件不要动。

| 位置 | 删除 | 保留 |
| --- | --- | --- |
| `.trellis/` | 整个目录（workflow、spec、tasks、workspace、scripts、config） | — |
| `.claude/` | `hooks/`、`agents/trellis-*`、`commands/trellis/`、`skills/trellis-*`；`settings.json` 里调用 `.claude/hooks/*.py` 的 hook 条目 | 其他 skill、`settings.json` 的其余配置 |
| `.agents/skills/` | `trellis-*` | 其他 skill |
| `.codex/` | `hooks/`、`hooks.json`、`agents/`、`skills/` 中的 Trellis 项；`config.toml` 里 Trellis 写的注释与 hook 设置 | 你自己需要的 `config.toml` 项（如 `project_doc_fallback_filenames`） |
| `.cursor/` | `hooks/`、`hooks.json`、`agents/trellis-*`、`commands/trellis-*`、`skills/trellis-*` | 其他规则与 skill |
| `.dsh/` | `skills/trellis-*`、`DSH.md`、`hooks/` 中的 Trellis 脚本，以及 `hooks.json` 中调用这些脚本的条目；配置文件只含 Trellis 条目时可删除整个文件 | 其他配置、hook 与 skill |
| 其他平台目录（`.opencode/`、`.pi/`、`.omp/`、`.gemini/`、`.qoder/` 等） | Trellis 生成的 hooks、agents、commands、skills、extensions | 其他配置 |
| `AGENTS.md` | `<!-- TRELLIS:START -->` 到 `<!-- TRELLIS:END -->` 之间的块 | 块外内容 |
| `.gitattributes` | `.trellis/workspace/*/journal-*.md merge=union` | 其他规则 |
| `.gitignore` | `.trellis/` 相关条目 | 其他条目 |

曾启用 dsh hook 桥接的项目还要检查机器级配置：旧版 Trellis 会生成 `.dsh/hooks.json`，由 `$DSH_HOME/cordis.patch.yml` 中的 `@deepseek-ai/dsh-hooks-claude-code` 插件通过 `configPath` 加载。这个路径可能直接指向某个项目，也可能指向复制到 `$DSH_HOME/trellis-hooks.json` 的共享配置。

从实际加载的配置中移除调用 `.dsh/hooks/` 下 Trellis 脚本的条目，文件只含这些条目时再删除整个文件。如果该插件项只为 Trellis 服务，也移除对应的插件项，然后重启 `dsh web`。保留其他用途的插件与 hook；一份机器级配置可能被多个项目共用，清理前要确认其他项目也已退出旧工作流。新版 dsh 的 skill 安装和 `trellis mem` 不依赖这个桥接。

还要搜一遍项目里其他引用旧路径的地方：

```bash
git grep -n -e '\.trellis' -e 'trellis-' -e 'task\.py' -- ':!*.lock'
```

常见残留：README、CONTRIBUTING、`TESTING.md`、格式化或仓库清单脚本里对 `.trellis/` 的排除项、CI 里的 Python 检查。

## 3. 安装新版 skill

```bash
npm install -g @zachary/trellis
trellis init --claude --codex        # 按需加 --dsh、--cursor
```

如果项目以前从 PhotoSenseAtlas 一类项目手工复制过同名 skill（`kickoff`、`clarify` 等），`init` 会逐个显示与新版的 diff，由你决定保留还是覆盖。

## 4. 验证

- `git status` 里只有预期的删除与新增。
- 新开一个 agent 会话：不再出现 Trellis 的 SessionStart 注入或每轮提示，命令列表里能看到 5 个项目 skill。
- 在项目根目录运行 `trellis mem search "<最近讨论过的词>"`，能检索到删除前的会话。`mem` 不依赖项目文件，删除前后结果应一致。
