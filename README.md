# Trellis（@zachary/trellis）

基于 [mindfold-ai/Trellis](https://github.com/mindfold-ai/Trellis) 的个人 fork。只做两件事：

1. **`trellis mem`**：只读地检索本机各 AI agent 的历史会话（Claude Code、Codex、DeepSeek Harness、Devin CLI、Grok、OpenCode、Pi、ZCode）。
2. **`trellis init` / `trellis update`**：往当前项目安装几个只能手动调用的协作 skill。

不再提供任务目录、spec 注入、hook、子代理、channel 或 workflow 模板。旧版 Trellis 项目的拆除方法见 [docs/legacy-trellis-removal.md](docs/legacy-trellis-removal.md)。

## 安装

```bash
npm install -g @zachary/trellis
trellis --version
```

## 会话检索

```bash
trellis mem help
trellis mem projects                      # 本机有会话记录的项目
trellis mem search "关键词" --limit 20     # 默认只搜当前 cwd 的会话
trellis mem context <session-id> --grep "关键词" --turns 3 --around 2
trellis mem extract <session-id> --grep "关键词"
trellis mem list --global --since 2026-10-01
```

`mem` 只读各 agent 自己的本地存储，不依赖项目文件，不上传数据。

## 项目 skill

| skill | 用途 |
| --- | --- |
| `kickoff` | 新会话开场：从仓库、项目计划和历史会话找回进度，产出任务说明 |
| `clarify` | 把粗糙的意图澄清成需求单，或生成给新会话的自包含 prompt |
| `brainstorm` | 大功能动手前收敛需求、设计与验收，写回项目文档 |
| `docs-audit` | 检查文档与代码、文档彼此之间的漂移 |
| `session-history` | 用 `trellis mem` 找回过往决定，并用当前证据核实 |

skill 不假定项目的目录结构，运行时从 `CLAUDE.md`、`AGENTS.md`、`README` 和文档索引里发现项目约定。

```bash
trellis init --claude --codex      # 或不带参数，交互选择
trellis update                     # 用当前 CLI 版本刷新已安装的 skill
trellis update --dry-run           # 只看会改什么
```

| 平台 | 写入位置 | 只能手动调用的实现方式 |
| --- | --- | --- |
| Claude Code（`--claude`） | `.claude/skills/<name>/` | frontmatter `disable-model-invocation: true` |
| Codex（`--codex`） | `.agents/skills/<name>/` | `agents/openai.yaml` 的 `policy.allow_implicit_invocation: false` |
| DeepSeek Harness（`--dsh`） | `.agents/skills/<name>/` | 同上（dsh 原生读取 `.agents/skills/`） |
| Cursor（`--cursor`） | `.agents/skills/<name>/` | frontmatter `disable-model-invocation: true` |

Cursor 同时会读 `.claude/skills/`，所以同时装了 Claude 时，Cursor 会看到两份同名 skill。

项目里的 skill 文件与当前 CLI 自带版本不同时，`init` 和 `update` 会逐个显示 diff，让你选择保留还是覆盖；非交互环境下一律保留。`--force` 不询问直接覆盖。没有清单文件，判断只看内容是否相同。

## 开发

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm build
```

skill 正文在 `packages/cli/src/templates/skills/`，会话检索在 `packages/core/src/mem/`。

## License

AGPL-3.0-only。上游版权见 [COPYRIGHT](COPYRIGHT)。
