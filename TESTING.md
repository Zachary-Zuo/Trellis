# TESTING — mem + 手动 skill 精简版

本次改动：CLI 只保留 `mem`、`upgrade`，`init` / `update` 改为安装 5 个手动 skill；core 只保留 `mem`；删除 task、spec、hook、channel、workflow 与各平台 configurator；清理本仓库自己的旧 Trellis 配置。

## Setup

```bash
pnpm install
pnpm build
```

## Commands

```bash
pnpm typecheck
pnpm lint
pnpm test                        # core mem 测试 + cli 的 mem / upgrade / skills 测试
pnpm --filter @zachary/trellis exec vitest run test/commands/skills.test.ts
```

手工冒烟（在一个临时 Git 仓库里）：

```bash
node /path/to/Trellis/packages/cli/bin/trellis.js init --claude --codex
ls .claude/skills .agents/skills            # 各 5 个目录；.agents 下每个含 agents/openai.yaml
echo "local" >> .claude/skills/kickoff/SKILL.md
node /path/to/Trellis/packages/cli/bin/trellis.js update     # 显示 diff 并询问
node /path/to/Trellis/packages/cli/bin/trellis.js update --dry-run
node /path/to/Trellis/packages/cli/bin/trellis.js mem projects
```

## Expected outcomes

- 三项检查退出码 0。
- `init` 首次输出 "N file(s) created"；再跑一次输出 "All skill files are up to date."。
- 改过的文件在交互终端里显示彩色 diff 和四个选项；管道 / CI 下列为 "kept (differs from template)"，内容不变。
- `trellis --help` 只列出 `init`、`update`、`upgrade`、`mem`。

## Edge cases to verify（静态分析覆盖不到）

1. **各客户端能发现 skill 并且只能手动调用**：
   - Claude Code：命令列表出现 5 个 project skill；模型不会自动触发。
   - Codex：`$kickoff` 可用；不会隐式调用（`agents/openai.yaml` 生效）。**`.agents/skills` 副本里保留了 `disable-model-invocation: true` 这一行，需确认 Codex 不因未知 frontmatter 键拒绝加载。**
   - DeepSeek Harness：能从 `.agents/skills/` 发现 skill；**dsh 是否认 `openai.yaml` 或 `disable-model-invocation` 未验证**，确认它会不会自动触发。
   - Cursor：能从 `.agents/skills/` 发现 skill，`/kickoff` 手动调用可用。同时装了 Claude 时 Cursor 还会读 `.claude/skills/`，确认同名 skill 的表现（去重还是出现两份）。
2. **Windows**：在 Windows 原生 Node 下跑 `trellis init`，检查路径与 CRLF 检出不会被误判为改动。
3. **全局安装包**：`pnpm build` 后 `npm pack`，确认 tarball 里有 `dist/templates/skills/**`。
4. **mem 回归**：`trellis mem search` 在删除旧代码前后结果一致（mem 代码未改）。

## Known static-analysis gaps

- 本机没有运行端到端的 `init` / `update` 交互流程（inquirer 提示）；只由单测覆盖 `syncSkills` 的决策逻辑。
