# Trellis 轻量化改造方案（v4 讨论稿）

> 状态：讨论稿，未实施。基于 2026-09-13 的四份审计（运行时注入、源码分层、spec 增长、外部方案）。
> v1 相对 v0：每个删除项补齐"现在做什么 / 为什么删 / 替代 / 损失"；spec 审查从占位改为完整设计（§4）；新增原则 P7。
> v2 相对 v1：撤回平台面裁剪（§3.6）。未安装的平台对项目零影响，裁剪只减少 fork 维护量，却带来大量测试改动与上游同步成本。改为只处理"不论装哪个平台都会漏进项目"的几处文本。
> v3 相对 v2：对齐 2026-09-13 的两个提交——13351418（独立发行线 `@zachary/trellis`、dsh mem adapter）与 aee145b3（中文 PRD 骨架、hook 经 Node launcher 启动）。新增 §0.4 语言规则：spec 与 task 正文中文、术语不翻译，workflow / 技能 / agent 保持英文。新增 §5.0 改动形态：第一版只改 markdown、config.yaml 与代码里的字符串，可选小段代码与 `generic` 类型、`spec_lint.py` 推到第二版；撤回"三件套"新门禁（违反 P1）。提交规则改为：两档都在检查通过后直接提交本次改动，归档才等用户说；`session_auto_commit` 因此不必改。修正 §3.3.6、§3.4、§3.5 里与模板现状不符的引用，清掉 v1 残留的"裁平台"措辞。
> v4 相对 v3：§3.3.1 brainstorm 新增"提问方式"——问题分五类按序走、选型题排最后；偏差信号触发对齐题；先告知再问；"一次一个问题"改为"一次一个决策点"。§2.2 档 A 第 1 步加同一对齐动作的轻量版。
> 改动落点全部在 fork 的模板层与少量 TS，不改各项目里已生成的 `.trellis/`。
> "模板层"指 `packages/cli/src/templates/`，"引擎"指 `templates/trellis/scripts/`。

---

## 0. 目标、边界、原则

### 0.1 目标

把 Trellis 从"面向 22 个平台、每步都是门禁的团队流程"改成"面向个人、规则是建议、成本随改动规模伸缩、验证只证明需求被正确实现"的工作流。保留 Claude Code、Codex、DeepSeek Harness（dsh）三个平台，改动保持平台中立。

### 0.2 不做什么

- 不重写 Python 引擎结构：task 目录布局、task.json 状态机、三个解析器的输入格式不变。
- 不改 `trellis mem` 实现，不删 adapter，只修文档漂移。
- 不做"自动判档"：是否建任务由用户的话决定。

### 0.3 原则

| # | 原则 | 出处 |
|---|---|---|
| P1 | 规则是建议不是门禁。MUST / NEVER / Non-Negotiable 改为普通描述；只保留会造成真实损失的硬约束（不 amend、不 push、不静默提交他人改动）。 | Polygon fork；Anthropic best practices |
| P2 | 成本随规模伸缩，确认不随规模伸缩。小改动也确认一句，但产物为零。 | superpowers |
| P3 | 只保留平台做不到的：spec 按路径注入、跨会话记忆、任务持久化。其余交给平台原生能力。 | Agent OS v3 |
| P4 | 每一行注入都是税。SessionStart、breadcrumb、spec 注入都设硬预算。 | Cherny 消融法 |
| P5 | spec 记录当前状态，不记录历史。写入前必答"替代或废止了哪条"。 | OpenSpec |
| P6 | 验证只证明需求被正确实现。不自造指标，不为覆盖率写测试。 | 用户要求 |
| P7 | 代码是真源。凡是读代码一分钟内能得到的信息不进 spec；spec 只放代码推不出的约束、决策理由和事故教训。验证以代码和验收标准为准，不以 spec 为准。 | 用户要求；Kiro Sync Files、spec-kit converge |

P7 同时约束三端：写入端（update-spec）、清理端（spec-review，§4）、初建端（spec-bootstrap）用同一套判据（§4.2 的六问）。

### 0.4 语言规则（2026-09-13 定）

- 中文的：安装到项目里的 spec（`.trellis/spec/`）与 task 产物（`prd.md`、`design.md`、`implement.md`、bootstrap 任务）的正文。种子模板因此也是中文：`templates/markdown/` 下的 spec 种子、`workspace-index.md`、`task_store.py` 里的三件套骨架、`init.ts` 里的 bootstrap 任务描述。
- 英文的：workflow.md 正文、三个 breadcrumb、技能 / 命令 / agent 定义、`agents.md` 注入块。这些是给 agent 的指令，用户很少读；解析器与测试都按英文写；上游对技能的修正 cherry-pick 时冲突更少。
- 中文正文里不翻译的：术语 task、spec、prd、design、implement、hook、breadcrumb、index、package、layer、slug、archive、workspace；文件名、目录名、frontmatter 键、命令、路径、代码标识符。
- 这条规则 aee145b3 已写了一半：PRD 骨架"说明"段与 `cmd_create` 提示里有"title / slug / 路径英文，正文中文"。写 spec 的三个入口（spec-bootstrap、update-spec、spec-review）与写 task 的 brainstorm 各加一句同样的话，让产物语言不依赖当次会话的语言。

---

## 1. 现状诊断摘要

| 症状 | 实测根因 | 数字 |
|---|---|---|
| 每轮问"要不要建任务" | 同一规则写在 `workflow.md` 三处、`session-start.py` 一处、fork invariant 一处；`no_task` breadcrumb 每轮推送 | 472 B/轮 |
| 轻量任务也很长 | 第一句到归档 18 个强制步骤、11 道独立验证、3 次阻塞确认、至少 3 个 commit；jsonl 门禁不豁免 | lint/typecheck 至少 3 次 |
| 加重过度防御 | check 24 个复选框；check agent 被要求"自己修不要只报告"；3.3 要求"结论为无也要走一遍" | Anthropic 原话：被要求找问题的 reviewer 总会报出问题 |
| 验证指标被自造 | 6 处模板文字要求"可测试验收标准"或测试数量 | 见 §3.7 |
| 下游 spec 长歪 | init 把 Python 仓库判为 backend，种 web 模板；update-spec 的 7 段强制模板逐任务追加，零处删除指令 | 本仓库自身 spec 8 个月净增 19,663 行，主动收缩 2 次 |
| 平台噪音 | 只有 `workflow.md` 一个文件会把 19 个平台的文本漏进每个项目：20% 是 marker 与厂商段落，`in_progress` breadcrumb 里 665 B 是 dsh 协议。其余平台专属代码只在 `trellis init` 选中该平台时才写入项目 | 模板层 39% 平台专属，但对项目侧无影响 |
| token | SessionStart 8.7 KB（76% 是 Phase Index 全文）；进行中每轮 1.7 KB；读一次匹配文件塞 9.4 KB spec 片段 | |

---

## 2. 目标工作流

### 2.1 两档分流

| 档 | 进入条件 | 产物 | 结束 |
|---|---|---|---|
| A. 不建任务（默认） | 用户没有明确说"建任务" | 无 | 检查通过后直接提交；报告改了什么、怎么验证的、commit 是哪个 |
| B. 任务 | 用户明确说"建任务" / "create a task" / "走流程" | `prd.md` + `design.md` + `implement.md` 三件套齐全 | 一次验证；通过后直接提交本任务改动；归档由用户说 |

档 A 里改动越做越大时，agent 可以建议一次"要不要建任务"，用户不答就继续按档 A。

### 2.2 档 A 流程

1. 对齐需求：三段话——我理解的需求、我会改什么（文件与行为）、我不会做什么。表述有歧义时点出两种读法及各自会改什么，不默默选一种（§3.3.1 对齐题的轻量版）。停下等确认。
2. 用户确认后改动。范围以复述为准。
3. 只跑与改动直接相关的检查：lint、类型检查、已经存在且覆盖该改动的测试。没有对应检查就说"没有可跑的检查"，不补写。
4. 检查通过后直接提交，只含本次改动的文件，一次改动一个 commit。用户开头说"先别提交"就攒着不提交。
5. 报告：改了哪些文件、每处为什么、跑了什么检查、结果、commit。
6. 不写 prd，不派 check 子代理，不走 update-spec，不归档。

### 2.3 档 B 流程

**Phase 1 Plan**

| 步骤 | 定义 | 变化 |
|---|---|---|
| 1.0 建任务 | `task.py create`，同时种三件套模板 | 仅在用户明确要求时；模板见 §3.4 |
| 1.1 需求探索 | 加载 `trellis-brainstorm`，迭代三件套；最终计划摘要后等批准 | brainstorm 按 §3.3.1 完善 |
| 1.2 研究 | 可选，写入 `research/` | 不变 |
| 1.3 上下文清单 | jsonl 允许为空；有则由 design.md 引用的 spec 路径生成 | required → optional，删启动门禁 |
| 1.4 启动 | 用户批准后 `task.py start` | 不加新门禁（P1）；三件套齐全由 brainstorm 的最终摘要保证；现有 jsonl 门禁的处理见 §3.4 |

**Phase 2 Execute**

| 步骤 | 定义 | 变化 |
|---|---|---|
| 2.1 实现 | 默认主会话实现；派子代理是可选项，按平台小节操作 | 三平台统一；dsh 协议只在 dsh marker 块内 |
| 2.2 验证 | 逐条对照 `prd.md` 验收标准给证据；附带跑相关 lint / 类型 / 已有测试；scope discipline 自查 | 只做一次，失败才重做 |
| 2.3 回滚 | 不变 | |

**Phase 3 Finish**

| 步骤 | 定义 | 变化 |
|---|---|---|
| 3.1 spec 备注 | 只在踩到非显而易见的坑、做了未来会话必须知道的决策时写；先过 §4.2 六问 | required → optional |
| 3.2 提交 | 2.2 通过后直接提交：只含本任务改动的文件，按逻辑分批；未识别的脏文件不动，在报告里列出；用户看完结果要改的以新 commit 追加；不 amend、不 push | 不等用户确认；边界是只提交自己改的文件 |
| 3.3 归档 | 用户说"收尾"后 `/trellis:finish-work`：归档 + 记录会话，两个脚本各自的 auto-commit 照旧 | 用户调用即同意，不二次确认；`session_auto_commit` 默认值不动 |

### 2.4 验证原则与反过度工程条款（新增到 workflow.md Core Principles）

```
## Verification Principles

- Verification proves the requirement was implemented correctly. Its input is the
  acceptance criteria in prd.md (task mode) or the confirmed restatement (no-task mode).
  Its output is evidence per criterion: a command output, a file:line, or a short argument.
- Acceptance criteria are observable outcomes of what the user asked for. Never invent
  quantitative thresholds, metrics, or benchmarks the user did not state. If a threshold
  is needed, ask once.
- Do not write tests to reach a coverage number. Add a test only when the requirement
  asks for it, when fixing a bug (one minimal reproduction), or when you changed behavior
  that an existing test covers.
- Run only checks related to the change: lint, type-check, existing tests that cover the
  touched code. If a check cannot run, say so; do not substitute a different check.
- Verify against the code and the acceptance criteria, not against the spec. Specs only
  supply conventions the code cannot express.
- When reviewing, flag only issues that affect correctness or the stated requirement.
  List everything else as optional suggestions and do not act on them.

## Avoid Over-engineering

- Only make changes that are directly requested or clearly necessary. A bug fix does not
  need surrounding code cleaned up.
- Do not add error handling, fallbacks, or validation for scenarios that cannot happen.
  Trust internal code and framework guarantees. Validate at system boundaries only
  (user input, external APIs, files from outside the repo).
- Do not create helpers, abstractions, or configuration for one-time operations or
  hypothetical future requirements. The right amount of complexity is the minimum needed
  for the current task.
- Do not add docstrings, comments, or type annotations to code you did not change.
```

第二段取自 Anthropic 官方 prompting 文档的 Overeagerness 样例。放在 workflow.md 最前面，利用指令 primacy 效应。

### 2.5 新的 breadcrumb 文案（每轮注入，三平台共用，每块 ≤ 400 字符）

```
[workflow-state:no_task]
No active task. Default: do not create a task.
Before editing: restate (1) the requirement as you understand it, (2) what you will change,
(3) what you will not do. Stop and wait for confirmation.
Create a task only when the user explicitly asks; then load `trellis-brainstorm`.
After changes: run only checks related to the change, commit them unless the user said not
to, and report what changed, how it was verified, and the commit.
[/workflow-state:no_task]

[workflow-state:planning]
Task in planning. Iterate `prd.md`, `design.md`, `implement.md` with `trellis-brainstorm`.
Acceptance criteria = observable outcomes of the request; no invented metrics.
Present the final planning summary and wait for approval before `task.py start`.
[/workflow-state:planning]

[workflow-state:in_progress]
Task in progress. Implement in the main session by default (sub-agents optional, see
workflow.md 2.1 for your platform). Then verify once against prd.md acceptance criteria
plus related lint / type-check / existing tests (2.2). When checks pass, commit this
task's changes (3.2). Archive only when the user says so (3.3).
[/workflow-state:in_progress]
```

语言：保持英文（§0.4）。

Codex 在 `dispatch_mode=inline` 时读 `planning-inline` / `in_progress-inline` 块。已核实 `inject-workflow-state.py` 对缺失 tag 输出"状态损坏"提示，不回退主块（`load_breadcrumbs` 注释，行 232-241；选块逻辑行 376-381）。两种处理：(a) 零代码——保留 `-inline` 两个块，内容与主块逐字相同；(b) 改 `_status_tag` 三行让缺失时回退主块，然后删变体块。建议先 (a)，第一版不碰脚本；两份相同文本的漂移风险靠一条测试 invariant（inline 块与主块相同）兜住。

---

## 3. 逐模块修改清单

每个小节先列改动，再列"删除项与理由"表。表列含义：现在做什么 / 为什么删 / 替代 / 损失。

### 3.1 `templates/trellis/workflow.md`（726 行 → 目标 ≤ 250 行）

**保留并修改**

| 小节 | 改为 |
|---|---|
| Core Principles | 加 §2.4 两段；其余压缩 |
| Trellis System | 保留开发者身份、spec、task、workspace、context script，各 ≤ 5 行 |
| Phase Index | 3 行 ASCII 摘要 + §2.1 两档 + 3 个 breadcrumb 块 |
| Parent / Child Task Trees | 保留 1 段，移到 1.0 详情 |
| 1.0 / 1.1 / 1.2 / 1.4 | 按 §2.3 |
| 2.1 | 3 组平台 marker：Claude Code（hook 注入）、Codex（SubagentStart 注入或 inline）、dsh（pull 式 + `trellis_wait`）；开头一句"默认主会话实现" |
| 2.2 | 按 §2.3 重写；check 作为技能或子代理都可 |
| 3.1 / 3.2 / 3.3 | 按 §2.3 |
| Customizing Trellis (for forks) | invariant 改为：(1) 无任务时默认不建任务并先复述需求；(2) 任务档三件套齐全；(3) 检查通过后直接提交，只含本次改动的文件；归档只在用户要求时 |

**删除项与理由**

| 项 | 现在做什么 | 为什么删 | 替代 | 损失 |
|---|---|---|---|---|
| Request Triage 的"轻量 / 复杂"二分 + 每轮征求建任务同意 | 要求 agent 每轮先分类再问用户 | 分类本身就是一次判断开销；问句每轮出现；用户已决定"由我说" | §2.1 两档 | 无 |
| "Lightweight tasks may be PRD-only" | 允许只有 prd 的任务 | 用户要求任务档三件套齐全；两种任务形态让 start 门禁、continue 路由、brainstorm 都要分支 | 单一任务形态 | 小任务建任务时要多写两个短文件，模板已种好 |
| 1.3 Configure context 的 required 标记与 17 个平台名 | 要求在 start 前手工填 implement.jsonl / check.jsonl | 只在派子代理时有用；主会话默认下是死重；hook 注入本来就会内联三件套；本仓库 32% 的 jsonl 从未有真实条目 | optional，可由 design.md 引用的 spec 路径生成 | 派子代理时若 jsonl 为空，子代理只拿到三件套，需自己读 spec |
| 1.5 Completion criteria 表 | 4 行条件表 | 与 1.4 内容重复 | 并入 1.4 | 无 |
| 2.2 "Final pass 必须 full-scope、逐包加载 Quality Check" | 最后一轮 check 要列出所有包并读每个 index 的 Quality Check 段 | 这是 11 道验证里最重的一道：N 个包就 N 次加载；它验证的是"符合 spec"，与 P6/P7 冲突 | 2.2 一次对照验收标准 | 跨包一致性问题靠验收标准与已有测试捕获 |
| 2.2 "A required check that cannot run, is skipped, or exits non-zero is blocked/failed" | 跑不了的检查一律算失败 | 迫使 agent 补造检查或改环境；用户主机才跑测试的场景下这条永远触发 | "跑不了就如实说明" | 无 |
| 块外的 Sub-agent dispatch protocol 段（1467 B） | 列 Codex、Grok、Kimi、dsh 的派发协议 | 平台无关位置放平台专属协议，所有平台每会话都读 | 各协议进各自 marker 块 | 无 |
| Active Task Routing 的两套并列表 | sub-agent 组一表、inline 组一表 | SessionStart 会把两表并排注入，指令互相矛盾 | 一张表 | 无 |
| Guardrails 3 条 | 重申"建任务同意≠实现同意"等 | 与 breadcrumb、brainstorm 重复第三遍 | P1 + breadcrumb | 无 |
| 3.2 Debug retrospective 作为编号步骤 | 每任务提示"若反复调试则加载 break-loop" | 是按需技能，不该占步骤号让 continue 路由判断 | break-loop 保留为技能 | 无 |
| 3.3 Spec update 的 required 与"结论为无也要走一遍判断" | 每任务必经 | 强制仪式；与 update-spec 的 7 段模板叠加成 spec 增长引擎 | 3.1 optional + §4.2 六问 | 无 |
| 3.4 的 Spec-sync preamble | 提交前再问一次"要不要更新 spec" | 同一问题问两次 | 删 | 无 |
| 3.5 Wrap-up reminder | 提醒用户跑 finish-work | finish-work 由用户调用；提醒每任务出现一次 | 删 | 无 |
| `[workflow-state:completed]` 块 | 归档后 breadcrumb | workflow.md 自己在行 131、264、684 三处注明"currently DEAD"，archive 时指针已丢 | 删 | 无 |
| Customizing 小节里的 `[workflow-state:my-status]` 示例 | 文档示例 | 解析器不识别代码围栏，把示例当成了真实状态 | 示例改用非 tag 语法 | 无 |
| 19 个平台名的 marker 行与每组一套派发说明 | 每个平台组各写一遍 2.1 / 2.2 | 块外写平台中立的默认文本，marker 块只放三平台各自的特殊协议（Claude hook 注入、Codex SubagentStart / inline、dsh pull + `trellis_wait`）；其余平台自动落到默认文本 | 3 组 marker | 其余平台失去专属派发说明，仍可用 |

解析器约束必须保留：`## Phase Index` 标题、`#### X.Y` 步骤标题、`[workflow-state:STATUS]` 成对 tag、marker 行格式。测试 invariant"每个 `[required · once]` 步骤必须在所属 phase 的 breadcrumb 里有对应行"同步更新。

### 3.2 注入层 `templates/shared-hooks/`（三平台共享的 hook）

**保留并修改**

| 文件 | 改为 |
|---|---|
| `session-start.py` | 脚本按 `## Phase Index` 到 `Phase 1: Plan` 抽取 workflow.md 原文注入（行 836），所以 §3.1 把 Phase Index 段缩到 3 行摘要 + 两档表 + breadcrumb 后，注入量自动降到目标 ≤ 1.5 KB，脚本不必改。可选的脚本改动只剩两处：删 `<first-reply-notice>` 段、去掉载荷双发 |
| `inject-workflow-state.py` | 第一版不改（§2.5 方案 a）；可选：`_status_tag` 加回退、忽略代码围栏内的 tag |
| `inject-spec-context.py` | 脚本不改；`templates/trellis/config.yaml` 默认 `spec_injection.tools: [Edit, Write]` |
| `inject-subagent-context.py` | 不改；jsonl 为空时只内联三件套 |
| 关闭开关 | `no-trellis`、`TRELLIS_HOOKS=0` 保留 |

Codex 的 `SubagentStart` 注入与 dsh 的 pull 式加载沿用现有实现。

**删除项与理由**

| 项 | 现在做什么 | 为什么删 | 替代 | 损失 |
|---|---|---|---|---|
| `<trellis-workflow>` 的 Phase Index 全文（6.7 KB/会话） | 把 workflow.md 行 144-307 搬进每个会话开头 | 档 A 用不到任何 phase 细节；档 B 每步都能按需拉；这是最大的单项 token 税 | 3 行摘要 + 按需拉取 | 首次进入档 B 时多一次 `get_context.py` 调用 |
| `<first-reply-notice>` 的致谢要求（781 B） | 强制首句说"Trellis SessionStart 已加载"并选语言 | 纯仪式，每会话一次；语言选择逻辑 3 条规则只为一句话 | 只留一行更新提示 | 无 |
| 载荷双发（`additionalContext` + 顶层 `additional_context`） | 同一文本发两遍 | 平台只读前者 | 单发 | 无 |
| spec 注入的 Read 触发 | 读任何匹配文件就注入 | 读文件是最频繁的动作；档 A 里读 3 个文件可能塞 28 KB spec | 只 Edit/Write 触发 | 读代码时不再自动看到相关 spec；需要时手动 cat |

### 3.3 技能、命令、agent（`templates/common/`、`templates/{claude,codex,dsh}/`）

#### 3.3.1 `brainstorm.md`（195 行）保留并完善

**保留**：一次一个问题（定义改为"一次一个决策点"，见下）；先查代码库再问；每次回答后更新 prd；First Principles 框架；最终计划摘要后停下等批准；"不要发明项目没有的 spec 层级"。

**新增：提问方式**

现状：问题只有一种形态——决策点、原因、推荐、trade-off，即选型题。选型题默认 AI 已经把问题读对了，只差用户拍板；它站在理解的下游。用户表述里的歧义、AI 与用户之间的理解偏差，在这个形态下没有出口，会被 AI 默默选一种读法带进 prd。First Principles 的 Step 1 "Restate the Problem" 本来就是对齐动作，但现在是 AI 的内心活动，没有说出来核对。

改法一：问题分五类，按序走，前四类清空后才问选型题。

| 类型 | 目的 | 典型问法 |
|---|---|---|
| 情境题 | 摸现状，要事实不要观点 | 现在发生了什么；上一次碰到是什么场景；举一个具体例子 |
| 目标题 | 找关键线索，识别 XY 问题（用户说的是想到的解法，不是问题） | 做完后什么会不一样；不做会怎样；为什么是现在 |
| 对齐题 | 校验理解 | 我把你这句话读成 A，也可能是 B；A 会改 X，B 会改 Y；你是哪个 |
| 边界题 | 拆开问题 | 哪些看着像但不该动；请求里哪部分是关键、哪部分顺带；两个诉求冲突时先哪个 |
| 选型题 | 现有形态 | 决策点、推荐、trade-off |

改法二：偏差信号。出现任一条就必须问对齐题，不能默默按自己的读法走。

| 信号 | 例 |
|---|---|
| 用户的用词与代码库或 spec 里同一个词含义不同 | 用户说的 "task" 是 GitHub issue，仓库里的 task 是 `.trellis/tasks/` 目录 |
| 用户描述的是解法不是问题 | "加个缓存" |
| 用户举的例子与其概括对不上 | 概括说"所有平台"，例子只有 Claude Code |
| 请求的目标与请求的改动之间连不上 | 目标是减少注入，改动是再加一个 hook |
| 用户要的东西仓库里已经有了 | 大概率是 AI 读错了，不是用户不知道；先问读法，再答"已有" |
| 请求里两句话互相冲突 | "不改引擎"与"改 task.json 状态机" |

改法三：先告知再问。每个问题前固定三行：我查到了什么（file:line 或事实）；我目前的读法；为什么这个问题是现在最值得问的。第三行替代现有 Question Rules 里的 "why the answer matters"；选型题在三行之后再给决策点、推荐、trade-off。

改法四："一次一个问题"的定义改为"一次一个决策点"：一段复述加一个探针算一个问题。

改法五：Evidence Rule 保留，补一句：情境题与目标题问的是用户的经历和意图，不是仓库能回答的事实，不受"仓库能答就不问"约束。

**修改**

| 处 | 改为 |
|---|---|
| Question Rules 的四要素（决策点、原因、推荐、trade-off） | 只约束选型题；其余四类按"新增：提问方式" |
| Requirement Convergence Gate 里 "acceptance criteria describe observable outcomes" 与 Quality Bar 里 "testable acceptance criteria" | §2.4 定义 + "量化阈值必须来自用户" |
| Artifact Rules | 三件套齐全，附 §3.4 短模板；加一句 §0.4 语言规则（正文中文，slug / 路径英文） |
| Quality Bar 8 项 | 5 项：三件套存在；验收标准是需求的可观察结果；关键术语的读法已用具体落点复述并得到确认；阻塞问题清空；最终摘要已呈现 |
| Preconditions 里的"只在建任务同意后使用" | "用户明确要求建任务后使用" |

**删除项与理由**

| 项 | 现在做什么 | 为什么删 | 替代 | 损失 |
|---|---|---|---|---|
| 两个 "Non-Negotiable" 标题及措辞 | 用最强语气重申计划契约与证据规则 | 对抗性措辞在指令冲突时放大模型防御姿态（Instruction Stacking 研究：失效由成对冲突驱动）；内容本身保留 | 普通标题"Planning contract"、"Evidence first" | 无 |
| "the user must respond at least once after the initial request before implementation begins" | 强制至少一轮往返 | 与"最终摘要后等批准"重复；单独成条会让明确的请求也多一轮 | 最终摘要等批准这一条 | 无 |
| PRD Convergence Pass 整节（无损重写、逐条核对不重复） | 启动前对 prd 做一次结构化重写 | 机械步骤，每任务一次，产出与输入几乎相同；"lossless" 要求让 agent 花大量 token 自证 | 一句"启动前整理一次 prd：去重、删已解决的 open questions" | 无 |
| implement.jsonl / check.jsonl "至少一条真实条目"门禁 | 启动前必须手填清单 | 见 §3.1 的 1.3 条 | optional | 同 §3.1 |
| "Lightweight tasks may omit design.md and implement.md" | 两种任务形态 | 用户要求三件套齐全 | 单一形态 | 无 |

#### 3.3.2 `check.md`（106 行）重写为"对照验收标准"

**新结构**

1. 读 `prd.md` 验收标准（档 A 读对话里确认过的复述）。
2. `git diff --name-only` 列改动文件。
3. 逐条验收标准给证据：命令输出、file:line、或一段简短论证。给不出证据的标"未验证"，不补造。
4. 跑与改动相关的 lint / 类型 / 已有测试；机械问题就地修，判断类问题报告并停。
5. Scope discipline 自查（现有 5 项原样保留）。
6. 报告。附一句 reviewer 约束："只标影响正确性或需求的问题，其余列为可选建议。"

**删除项与理由**

| 项 | 现在做什么 | 为什么删 | 替代 | 损失 |
|---|---|---|---|---|
| Step 2 "读每个包的 index.md 并跟随 Quality Check 段" | 每次 check 先读全部相关 spec index 与其引用文件 | 验证对象变成 spec 而非需求（违反 P7）；包越多读越多 | 验收标准 + 代码 | 违反 spec 约定的改动不再被 check 主动抓；靠 Edit/Write 时的 spec 注入提醒 |
| Test Coverage 三项（新函数→单测、修 bug→回归、改行为→更新测试） | 按改动类型强制加测试 | 这是"为了测试而测试"的直接来源；对算法代码，"新函数就要单测"生成的是对实现细节的断言，不证明需求 | §2.4 第三条 | 无 |
| Spec Sync 复选框 | 每次 check 问"要不要更新 spec" | 与 3.1 重复，且在 check 里问会把 spec 更新混进验证 | 3.1 | 无 |
| Cross-Layer Dimensions 四节（Data Flow / Code Reuse / Import / Same-Layer） | 按 Storage→Service→API→UI 分层追数据流 | 假设 web 分层架构；对算法、CLI、研究代码不适用；4 个子清单共 12 项，每次都要判断"是否适用" | 一句"跨层改动可参考 `guides/thinking-triggers.md`" | web 项目里跨层遗漏靠已有测试与验收标准 |

同名 agent（`templates/claude/agents/trellis-check.md` 及 codex、dsh 对应文件）里 "Fix issues yourself, don't just report them" 改为与技能一致："机械问题修，判断问题报告"。理由：同名制品指示相反，会让子代理在改与不改之间摇摆。

#### 3.3.3 `update-spec.md`（351 行）重写为 delta 语义（目标 ≤ 120 行）

**新内容**

- 写入条件：只有三种——踩到非显而易见的坑；做了未来会话必须知道的决策；约定与语言/框架默认不同。写入前过 §4.2 六问。
- 写入语言：正文中文（§0.4）。
- 三种动作：add / modify / remove。每次写入先回答"这条替代或废止了现有哪条"，并执行对应的 modify / remove。
- 单文件预算 200 行 / 12 KB，超了先删再加。
- 保留的短模板：Convention、Don't、Common Mistake、Design Decision，各 ≤ 8 行。
- 新 checklist 5 项：是否可从代码直接推出（是则不写）；是否已有等价条目；是否替代了旧条目；是否超预算；是否含 file:line 证据。

**删除项与理由**

| 项 | 现在做什么 | 为什么删 | 替代 | 损失 |
|---|---|---|---|---|
| "Code-Spec First Rule (CRITICAL)"：spec 必须是可执行契约（签名、字段、env、错误行为） | 把 spec 定义为代码契约的镜像 | 直接违反 P7：签名、字段、错误码都能从代码读到，镜像一份就会漂移；这是本仓库 spec 里 `platform-integration.md` 长到 197 KB 的根因 | P7 + 六问 | 无 |
| Mandatory Triggers（新签名 / 跨层契约 / schema / infra 就触发） | 大部分改动都命中 | 触发面太宽，等于"每任务必写" | 三种写入条件 | 无 |
| Mandatory Output 7 段模板（Scope / Signatures / Contracts / Validation & Error Matrix / Good-Base-Bad / Tests Required / Wrong vs Correct） | 每次触发追加整套 7 段 | 7 段里 5 段是代码镜像；"Tests Required with assertion points" 是自造测试要求的来源之一；本仓库 35 处 Tests Required 段全是这样堆出来的 | 4 个短模板 | 无 |
| Quality Checklist 里 7 条"你有没有加 X" | 检查是否包含签名、矩阵、案例、测试 | 全是加法，唯一减法项被淹没 | 5 项新 checklist（2 项减法） | 无 |
| Core Philosophy "每个 aha 都是机会，目标是 institutional memory" | 鼓励无限累积 | 与 P5 冲突 | 删 | 无 |

#### 3.3.4 `before-dev.md`（46 行）保留并微调

保留全部 8 步的主干，尤其第 7 步"陈述改动边界"，它就是档 A 复述需求的技术版。

| 项 | 改为 | 理由 |
|---|---|---|
| 第 4 步"跟随 index 的 Pre-Development Checklist" | "读 index 的文件表，挑与本次改动相关的" | index 模板不再有 Checklist 段（§3.5） |
| 第 6 步 "Always read shared guides" | 并入第 5 步，改为"跨层或复用改动时读 `guides/thinking-triggers.md`" | guides 合并为一份；"always" 对单文件改动是浪费 |
| 末句 "This step is mandatory before writing any code" | 删 | P1；档 A 里 spec 已按路径注入，不需要每次跑完整 8 步 |

#### 3.3.5 `break-loop.md` 保留为按需技能

不改内容。只从 workflow 步骤表移除（§3.1）。它的 5 维分析对"同一 bug 反复修"确实有用，但每任务提示一次是浪费；用户或 agent 觉得在循环时再调用。

#### 3.3.6 `trellis-session-insight`（保留，修 3 处漂移）

| 处 | 现状 | 改为 |
|---|---|---|
| `references/triggering-patterns.md` 行 44、83 用了 `mem list --task <task-dir>` | CLI 没有这个旗标，被静默忽略 | 删，改为 `--cwd` 或 `--grep` |
| `references/cli-quick-reference.md` 行 58 称 OpenCode adapter 是 stub | 实为 490 行完整实现 | 删这句 |
| 未提及 dsh | 13351418 已加 dsh adapter（`packages/core/src/mem/adapters/dsh.ts`） | 补 dsh 会话路径 |

不删的理由：它是整套里唯一自述"是工具不是仪式"的组件，无固定输出、无回写步骤、`--max-chars` 默认 6000，符合 P3。

#### 3.3.7 `trellis-spec-bootstrap`（保留，加两段）

加"文件越少越好、不适用的种子文件直接删"与"算法 / 研究型仓库的 spec 形态：一个 conventions + 一个 verification 即可"。初建时同样过 §4.2 六问。Operating Rules 加一条 §0.4 语言规则：spec 正文中文，文件名英文。

#### 3.3.8 `trellis-meta`（保留，随 workflow 改写更新 references）

`references/customize-local/change-workflow.md` 与 `local-architecture/workflow.md` 里的 route table 与示例按新步骤号更新。`local-architecture/spec-system.md`（行 42）与 `customize-local/change-spec-structure.md`（行 44-45）里"index 应列 Pre-Development Checklist 与 Quality Check"删（见 §3.5）。

#### 3.3.9 `trellis-channel` 技能与 channel 运行时（保留，不改）

v1 曾提议整体删除，v2 撤回。channel 是 CLI 侧运行时，与 task 零耦合，`native` workflow 从不调用它；项目侧只有三处痕迹：config.yaml 的 `channel:` 块（改为注释）、`.trellis/agents/` 两个文件、bundled skill 一行描述。删除它只减少 fork 维护量，却连带 8 处代码与 12 个测试。不值得。

#### 3.3.10 命令 `templates/common/commands/`

| 命令 | 处理 | 理由 |
|---|---|---|
| `continue.md` | 保留；route table 按新步骤号更新；删"轻量 / 复杂"分支 | 单一任务形态 |
| `finish-work.md` | 保留；用户调用即视为同意归档，归档与 journal 的 auto-commit 照旧，不再二次确认；Step 2 里"回到 3.4 提交"的措辞改为"先提交本任务改动再归档" | 归档由用户触发；不合并两个 bookkeeping commit，合并要改脚本 |
| `start.md` | 保留；改为"用户明确要求建任务时的入口"，删每轮征求同意的措辞 | §2.1 |

本仓库根目录 `.claude/commands/trellis/` 下的 `create-manifest`、`improve-ut`、`publish-skill` 是仓库维护者命令，不在模板里，不会种到下游，不动。

#### 3.3.11 agent 定义（implement / check / research，三平台各一份）

| 项 | 改为 | 理由 |
|---|---|---|
| implement 的 "finish by running project lint and type-check" | "run checks related to the change" | 与 §2.4 一致 |
| check 的 "Fix issues yourself" | 见 §3.3.2 | 与技能一致 |
| research 的 "Returning findings only through the chat reply is a failure" | 保留 | 这条是对的：研究结果不落盘就会随 compaction 丢失 |
| `inject-subagent-context.py` 的 implement prompt 模板里 "Self-check against check specs" | 删 | 子代理不再以 spec 为验证对象（P7） |

### 3.4 引擎脚本 `templates/trellis/scripts/`

| 文件 | 改动 | 理由 |
|---|---|---|
| `common/task_store.py` `_default_prd_content`（行 301，aee145b3 已改为中文 7 段骨架） | 在已提交骨架上只改两处：验收标准段加注释；"说明"段删"轻量任务可以只保留 PRD"一行。行 726-748 的 `cmd_create` 提示同样删"轻量任务可以只保留 PRD" | 字符串改动，不是逻辑改动 |
| design.md / implement.md 种子 | 建议放 `cmd_create`，紧挨 `_default_prd_content` 加两个同形函数，十几行；零代码的替代是模板放进 brainstorm.md，由 agent 建文件 | task 目录布局是引擎的事，放引擎更稳；但两种都可 |
| `task.py start` 行 197-218 的 jsonl 门禁 | 不加任何新门禁（P1）。现有门禁只在 create 种了 jsonl 时触发，且已有 `--allow-empty-context` 旗标。两种处理：(a) 零代码——workflow.md 1.4 写明 jsonl 为空时带该旗标；(b) `cmd_create` 行 628-634 不再种 jsonl，门禁自然不触发。建议 (b)，几行，比让 agent 每次记旗标干净 | 见 §3.1 |
| `task.py validate` 与 archive 前校验 | 不动 | |
| `common/workflow_phase.py` `_PLATFORM_MARKER_LABELS` | 不动 | 平台不裁剪，映射表保持完整 |
| `common/cli_adapter.py`（982 行，411 行平台分支） | 不动 | 见 §3.6 |
| `add_session.py` / `task.py archive` 自动提交 | 不动 | 两者只被用户调用的 finish-work 触发，没有 hook 自动调；用户调用即同意，auto-commit 不需要二次确认 |
| `templates/trellis/config.yaml` 的 `channel:` 块（行 117） | 注释掉 | 出厂唯一未注释的可选块；单人用不到 |

PRD 骨架（aee145b3 已提交的中文版，本稿只改标 ★ 的两处）：

```markdown
# {title}

## 目标

{description}

## 背景

- 待补充。

## 需求

- 待补充。

## 约束

- 待补充。

## 验收标准

<!-- ★ 需求的可观察结果。不自造阈值、指标或基准；需要数字时由用户给出。 -->
- [ ] 待补充。

## 未决问题

- 暂无。

## 说明

- Trellis task 的 title、slug 和目录名使用英文；本文件正文使用中文。
- `prd.md` 只写目标、背景、需求、约束、验收标准和未决问题，不写技术实现清单。
（★ 删第三行"轻量任务可以只保留 PRD；复杂任务在 task.py start 前必须补 design.md 和 implement.md"）
```

新 design.md 模板：

```markdown
# 设计：{title}

## 方案

<!-- 满足需求的最小机制。 -->

## 涉及范围

<!-- 文件 / 模块：改什么、为什么。 -->

## 取舍与决策

## 兼容与回滚
```

新 implement.md 模板：

```markdown
# 实施计划：{title}

## 步骤

1. 

## 验证方式

<!-- 每项检查对应哪条验收标准；优先用已有检查。 -->
```

可选：把 PRD 的"说明"段整个移出文件，规则只留在 `cmd_create` 提示与 brainstorm 里。理由：这段是给 agent 看的元说明，会随 prd.md 被注入每个子代理，且没人会去删它。留不留由用户定。

### 3.5 下游项目的 spec 种子（`templates/markdown/`、`commands/init.ts`、`utils/project-detector.ts`）

**保留并修改**

| 项 | 改为 | 理由 |
|---|---|---|
| 项目类型 | 第二版再做：增加 `generic`，unknown 与"Python 但无 web 框架依赖"归此类。这是 TS 改动（`project-detector.ts`、`init.ts`、`markdown/index.ts` 三处加测试），第一版先靠 bootstrap 描述里"不适用的种子文件删除"顶住 | 现在 Python 一律判 backend；更糟的是 `init.ts` 行 547、1467 把 `unknown` 映射为 `fullstack`，没有任何指示文件的仓库会同时种 backend 与 frontend 两套 |
| `generic` 种子 | 随上一行第二版；形态是 `spec/<pkg>/index.md` + `conventions.md` + `verification.md`（检查命令、什么算验证通过），中文 | 三个文件够覆盖 P7 允许留在 spec 里的东西 |
| web 类型种子（backend / frontend 共 12 个文件） | 正文改中文；删三处 "All documentation should be written in English"（`spec/backend/index.md.txt` 行 38、`spec/frontend/index.md.txt` 行 39、`workspace-index.md` 行 125） | §0.4 |
| `guides/` 合并后的 `thinking-triggers.md` | 中文 | §0.4 |
| bootstrap 任务描述（init.ts 行 397-543） | 中文；"只写代码库能证明的约定；不适用的文件删除；每文件 ≤ 200 行；写入前过六问"；删"每个任务都派两个子代理、hook 自动注入 jsonl"那段运行时说明 | 现文英文；"空 spec 等于子代理写通用代码"驱动填满；主会话默认后子代理说法失真 |
| index.md 模板 | 中文；文件表加一列"何时读"；删 How to Fill 里"加代码示例、列团队常见错误"两条 | 那两条是填满驱动；index 只需是地图 |
| 单文件预算 | 200 行 / 12 KB，由 spec-review 报告 | P4 |

**删除项与理由**

| 项 | 现在做什么 | 为什么删 | 替代 | 损失 |
|---|---|---|---|---|
| `guides/cross-platform-thinking-guide.md`（633 行） | 讲多平台配置器怎么写、marker 怎么裁 | 这是 Trellis 自己开发多平台适配的经验，种到每个下游项目里毫无关系；是种子里最大的单文件 | 不种 | 无 |
| `guides/code-reuse-thinking-guide.md`（223 行）与 `cross-layer-thinking-guide.md`（327 行）作为独立文件 | 通用的"想想有没有重复 / 想想跨层"建议 | 550 行通用建议里有价值的是 `guides/index.md` 里那 20 行触发清单；正文是任何模型都已知的常识 | 合并为 ≤ 80 行的 `thinking-triggers.md`，只留触发清单与一句话理由 | 无 |
| 对 index.md "Pre-Development Checklist" 与 "Quality Check" 两段的引用 | 种子 index 里本来没有这两段（现文只有 Overview / Guidelines Index / How to Fill）；是 before-dev 第 4 步、check 第 2 步、workflow.md 行 31 与 573、trellis-meta 两份 reference 假定它们存在，bootstrap 时 agent 就会往 index 里补 | 这些引用让 index 长成"必读清单"，每次开发/验证都要读完；spec 按路径注入后 index 只需是地图 | 删引用（§3.1、§3.3.2、§3.3.4、§3.3.8）；种子保持文件表 + "何时读" | 无 |
| backend 种子里的 database / logging / error-handling 对 generic 项目 | 种下 "To be filled" 占位 | 算法仓库没有 ORM、没有结构化日志规范；占位文件会被 bootstrap 任务填上发明的内容 | generic 只种三文件 | 无 |

### 3.6 平台面：不裁剪

**结论**：不删任何平台的配置器、模板目录、scrubber、mem adapter，也不删 channel。理由：

- `trellis init` 只写入被选中平台的目录。未选中的 18 个平台的代码在项目侧不存在，不被注入，不占 token。
- 裁剪的收益只有 fork 维护量下降；代价是 `packages/cli/test/`（5.5 万行）里平台矩阵、registry-invariants、regression、template 测试的大面积改动，加上之后无法从上游 cherry-pick 引擎修复。
- 用户本人可能换平台或加平台；保留矩阵零成本。

**不论装哪个平台都会漏进项目的东西**，这些才需要处理，且都是文本级改动，已分别列在别的小节：

| 漏入点 | 项目侧表现 | 处理 | 所在小节 |
|---|---|---|---|
| `workflow.md` 的平台 marker 组与块外厂商段落 | 19 个平台名进 SessionStart；块外 1467 B 协议段每会话读；`in_progress` breadcrumb 665 B dsh 段每轮读 | 重写时把三平台的特殊协议放进各自 marker 块；块外只写平台中立文本；其余平台走块外默认文本，不再逐个列名 | §3.1 |
| `templates/trellis/config.yaml` 的 `channel:` 块 | 出厂唯一未注释的可选块，30 行 | 注释掉；不影响功能 | §3.4 |
| `.trellis/agents/{implement,check}.md` | 每次 init 写入 141 行，只被 `channel spawn --agent` 消费 | 不动；不注入、不占 token | 无 |
| `trellis-channel` bundled skill | 装进每个项目的 skills 目录，1,410 行 | 不动；系统提示里只占一行描述，正文按需加载 | 无 |
| 引擎脚本里的平台分支（`cli_adapter.py` 411 行、`_SUBAGENT_CONFIG_DIRS` 探测 16 个目录） | 安装到每个项目，但未装平台的分支不执行 | 不动 | 无 |
| `session-start.py` / `inject-workflow-state.py` 里的平台分支 | 同上 | 不动；只改注入文本（§3.2） | §3.2 |
| `scripts/run-python-hook.cjs`（aee145b3 新增，已进 `getAllScripts()`） | 每个项目都装；Claude Code 与 Codex 的 hook 命令经它启动 | 不动；三平台自己要用 | 无 |
| mem 的 8 个 adapter | 项目侧无痕；`mem list` 会扫其他平台的会话目录，不存在时跳过 | 不动；只修 session-insight 的 3 处文档漂移 | §3.3.6 |

关于 workflow.md 的 marker 组：改为"块外文本对所有平台成立，marker 块只放三平台各自的特殊协议"。这样其余平台 `trellis init` 后仍能拿到一份可用的 workflow.md，只是没有专属派发说明。这比 v1 的"只留三组 marker、其余平台无 2.1 内容"更符合"改动保持通用"。

`packages/cli/test/` 仍需改，但只因模板文本变化，不因平台矩阵变化。

### 3.7 "自造验证指标"的 6 处修改对照

| 出处 | 现文 | 改为 |
|---|---|---|
| PRD 种子 | `## 验收标准` 空段（aee145b3 中文骨架） | 加中文注释：需求的可观察结果，不自造阈值 |
| brainstorm 收敛门 | "testable acceptance criteria" | "observable outcomes of the request; thresholds come from the user" |
| implement.md 规则 | "validation commands" | "which acceptance criterion each check proves; existing checks first" |
| check Test Coverage | 新函数单测 / 修 bug 回归 / 改行为更新 | 删；由 §2.4 第三条替代 |
| update-spec | "Tests Required with assertion points"、"Validation & Error Matrix" | 删 |
| workflow 2.2 | "无法运行即失败，不得弱化验收标准" | "跑不了就说明；验收标准由用户改，不由 agent 改" |

---

## 4. spec 审查技能设计：`trellis-spec-review`

### 4.1 定位

- 由用户调用，不是任务步骤，不挂 hook，不自动跑。入口：技能 `trellis-spec-review` + 命令 `/trellis:spec-review`（三平台各一份薄包装）。
- 目的：审查、整理、清理已有 spec；保留代码推不出的项目约束；消除与代码的漂移；把 spec 总量压回预算。
- 分工：脚本只算事实，不做判断；技能做判断并写提案；执行前必经用户批准。
- 与写入端共用判据：update-spec 写入时、spec-bootstrap 初建时、spec-review 清理时都用 §4.2 六问，避免一边写一边删。

### 4.2 判据：什么该留在 spec（六问）

对 spec 里的每一条（按 H2/H3 切分）依次问：

| # | 问题 | 答"是"时 | 例 |
|---|---|---|---|
| Q1 | 读相关代码一分钟内能得到同样信息吗？ | 不留。最多留一行指针"见 `path/file.py`" | 函数签名、参数表、目录结构、错误码表、配置键清单 |
| Q2 | 违反它会造成测试抓不到的错误吗？ | 留，写成一行规则 + 违反后果 | 两个模块必须同步改；时间戳单位；某文件不能 import 某包 |
| Q3 | 它是一个"为什么"（决策理由、被否决的方案）吗？ | 留，≤ 3 行 | "用 X 而不用 Y，因为 Z" |
| Q4 | 它与语言 / 框架的默认做法不同吗？ | 留一行 + 原因 | "本仓库不用 dataclass，用 attrs，因为…" |
| Q5 | 它来自一次真实事故吗？ | 留一行禁令 + 失败模式；删叙事、日期、issue 号 | "不要在 X 里调 Y：会死锁" |
| Q6 | 它是操作步骤（how-to）吗？ | 变成脚本或命令，spec 只留一行指向 | "发布前跑这 5 条命令" |

六问全否的条目删除。Q1 是最强的一问，先问它。

### 4.3 调用时机（建议，由用户判断）

- 归档任务累计到一定数量（例如 10 个）后。
- 开始一个大功能前，确保 spec 不给错误约束。
- 发现按路径注入的 spec 与代码不符，或注入内容明显是噪音时。
- Step 0 的事实表出现超预算或死引用时。
- 例行：每季度一次。

### 4.4 流程

**Step 0 机械事实（只读）**

第一版不写脚本：技能里列出要算的事实与对应的 shell 命令（`wc -l`、`grep -rn`、`git log -1 --format=%cd`），agent 手算并列成表。用过几次、事实清单稳定后再固化成 `templates/trellis/scripts/spec_lint.py`（第二版）。要算的事实：

| 检查 | 内容 |
|---|---|
| 清单 | 每个 spec 文件：路径、行数、字节、最后修改日期、是否有 `paths:`、是否被 index 引用、被其他 spec 引用次数 |
| 死引用 | spec 正文里出现的仓库路径、函数名、类名、CLI 旗标，在代码里不存在的 |
| 重复 | 规范化后相同的段落（跨文件与文件内） |
| 超预算 | 超过 200 行 / 12 KB 的文件 |
| 陈旧 | 超过 N 个月未改的文件（N 默认 3） |
| 叙事信号 | 含日期、issue 号、版本号、"cautionary tale"、"scenario" 的段落数 |
| 索引一致性 | index.md 条目与实际文件双向核对 |

**Step 1 逐条分类（技能，agent 判断）**

把每个 spec 按 H2/H3 切成条目，逐条过六问，打一个标签并附一句理由：

| 标签 | 含义 | 后续 |
|---|---|---|
| KEEP | 六问有"是"，且已足够短 | 不动 |
| TIGHTEN | 六问有"是"，但太长或含叙事 | 压缩到规则 + 后果 |
| MERGE→X | 与条目 X 重叠 | 合并进 X |
| DERIVABLE | Q1 为是 | 删，或留一行指针 |
| STALE | 与代码不符（Step 2 判定） | 改写为当前状态，或删 |
| NARRATIVE | 历史叙述、复盘、issue 引用 | 压成一行规则或删 |
| PLACEHOLDER | 模板残留、"To be filled"、空标题 | 删 |
| ASK | 拿不准（例如疑似有意的护栏） | 列给用户裁决 |

**Step 2 对照代码核验**

对 KEEP / TIGHTEN 里含代码事实的条目，去代码里验证（grep、读文件、看测试），标 VERIFIED / CONTRADICTED / UNVERIFIABLE。CONTRADICTED 转 STALE；UNVERIFIABLE 转 ASK。

**Step 3 提案（停下等用户批准）**

写 `.trellis/spec/.review/<date>.md`：

- 每个文件的处置表：条目 → 标签 → 理由 → 预计行数变化。
- 合并清单、删除清单、改写清单。
- ASK 清单：每条一句"我判断 X，但可能是 Y，请确认"。
- 总量对比：审查前 / 审查后行数与文件数。
- 建议补 `paths:` 的文件（值得按路径注入的）。

**Step 4 执行（用户批准后）**

按批准的提案改 spec、更新 index、补 `paths:`、删文件。改写出来的条目用中文（§0.4）；KEEP 的英文条目不为翻译而动。追加一行到 `.trellis/spec/REVIEW-LOG.md`：日期、文件数、行数前后、主要动作、提案文件路径。

**Step 5 收尾**

重算 Step 0，确认无死引用、无超预算、索引一致。输出摘要，spec 改动作为一个 commit 直接提交（提案已在 Step 3 获批）。

### 4.5 保护机制

- 条目可加 `<!-- pinned: <reason> -->` 注释；review 只能 TIGHTEN 不能删或合并。
- 单次 review 删除量上限（默认 40% 行数）；超过分两次做，减少一次误删。
- 删除内容留在 git 历史；REVIEW-LOG 记录 commit 范围，便于回找。
- ASK 条目未获答复的一律不动。

### 4.6 与其他部分的关系

- 写入端（3.1 步、update-spec）用同一六问，写入时就不产生 DERIVABLE 条目。
- 验证端（check）以代码与验收标准为准，不读 spec 做验证；spec 只在 Edit/Write 时按路径注入作提醒。spec 越小，注入越准。
- 初建端（spec-bootstrap）按六问写，`generic` 项目从三文件开始。
- 本仓库自己的 42 个 spec 可作为第一个审查对象验证这套流程：预期 `platform-integration.md`（197 KB）与 `script-conventions.md`（132 KB）大部分条目落在 DERIVABLE 与 NARRATIVE。

---

## 5. 实施顺序与验证

### 5.0 改动形态

这套方案本质是 prompt 改动。逐项分类后，第一版可以做到"只改 markdown 与一个 yaml，外加同步测试期望值"：

| 类别 | 内容 | 形态 |
|---|---|---|
| markdown | workflow.md、breadcrumb 块、5 个技能、3 个命令、3 组 agent 定义、bundled skills 文档、spec 种子、workspace-index、新技能 spec-review | 纯文本，第一版主体 |
| yaml | `config.yaml`：`spec_injection.tools: [Edit, Write]`、`channel:` 注释掉 | 配置文本 |
| 代码里的字符串 | `task_store.py` PRD 骨架与 `cmd_create` 提示、`init.ts` bootstrap 描述、`inject-subagent-context.py` 的 implement prompt | 改的是字符串字面量，不改逻辑 |
| 小段代码（可选） | `cmd_create` 种 design.md / implement.md（十几行）；`cmd_create` 不再种 jsonl（几行）；`_status_tag` 回退（三行） | 每处都有零代码替代（§3.4、§2.5），第一版可全跳过 |
| 推迟到第二版 | `generic` 项目类型（TS 三文件）；`spec_lint.py`（新脚本） | 有 prompt 层的临时替代 |
| 绕不开 | `packages/cli/test/` 里断言模板文本的用例改期望值 | 模板一动就挂，只是改期望 |

### 5.1 阶段

| 阶段 | 内容 | 验证 |
|---|---|---|
| A 文本（1 天） | §3.1 workflow.md、§2.5 breadcrumb、§3.3 技能 / 命令 / agent 文本、§3.4 PRD 骨架字符串与 config.yaml、§3.5 中文 spec 种子与 bootstrap 描述、§4 spec-review 技能与命令（无脚本版） | 样例项目 `trellis init` 后：SessionStart ≤ 1.5 KB；breadcrumb ≤ 400 B；走一次档 A 与一次档 B，数阻塞确认次数（档 A 1 次：复述后；档 B 1 次：start 前）；记录 token 对比；`task.py create` 产出的三件套与种子 spec 正文无英文占位；在本仓库 spec 上跑一次 spec-review 到 Step 3 |
| B 测试同步 | 因模板文本变化而失败的 `packages/cli/test/` 用例，含断言英文骨架 / 种子文本的用例（aee145b3 已为 PRD 骨架改过一批，可参照）；不做平台裁剪 | `pnpm test` 在用户主机通过；三平台各 `trellis init` 一次 |
| C 代码（按需，第二版） | §3.4 的可选小段代码、`generic` 项目类型、`spec_lint.py` | 只在阶段 A 用过一到两周后仍觉得 prompt 层替代别扭时才做 |

消融纪律：阶段 A 完成后先用一到两周，只有同一处错误重复出现两次以上才把对应规则加回，并记录加回原因。

---

## 6. 风险与兼容

- **上游同步**：13351418 已把 fork 定为独立发行线（`@zachary/trellis`，版本 `0.7.0-beta.4-zachary.1`），不再跟踪 upstream，引擎与 mem 的修复按需 cherry-pick。模板改动面大因此不再是风险，是前提。
- **已安装项目的更新**：`trellis update` 按模板 hash 分类，未手改过 workflow.md 的项目会被静默覆盖到新版本，手改过的会弹"覆盖 / 跳过 / 另存"。没有三方合并。
- **解析器格式**：`## Phase Index`、`#### X.Y`、`[workflow-state:*]`、marker 行格式不能变；测试 invariant 同步。
- **Codex inline 变体块**：缺失时输出"状态损坏"提示而非回退主块（已核实）。第一版保留变体块且与主块同文（§2.5 方案 a），不碰脚本。
- **dsh**：`trellis_wait` 协议与 pull 式加载只在 dsh marker 块内保留，需在 dsh 上实际走一次档 B。
- **check 不再读 spec**：违反 spec 约定的改动只靠 Edit/Write 时的路径注入提醒。这是 P7 的代价，用 spec-review 把 spec 压小来补。
- **测试量**：`packages/cli/test/` 5.5 万行，其中断言模板内容的用例会因文本改动失败，需同步；不裁平台后，平台矩阵相关用例不动。
- **其余平台的 workflow.md**：marker 只放三平台专属协议后，其他平台 `trellis init` 拿到的 2.1 只有块外的平台中立文本。对用户无影响，但若日后加平台需补 marker 块。
- **提交先于用户审阅**：两档都在检查通过后直接提交，用户看完结果或在另一台机器跑完测试再要改，就多出 `fix:` 提交。本地未 push 的历史多几个小 commit 没有实际损失；在意就 push 前手动 squash。不 amend 仍是硬约束。

---

## 7. 未决问题

1. （已定，见 §0.4）语言：spec 与 task 正文中文，术语不翻译；workflow.md、breadcrumb、技能 / 命令 / agent 定义保持英文。
2. 档 A 里 agent 是否允许"建议建任务"一次？建议允许一次，不答即继续。
3. Parent / child 任务树是否保留？建议保留机制，不在 breadcrumb 里提。
4. `generic` 项目类型的三个种子文件名与内容是否合适？
5. design.md / implement.md 模板段落是否合适？
6. spec-review 的单文件预算（200 行 / 12 KB）与单次删除上限（40%）是否合适？
7. `pinned` 注释语法是否接受，还是用 frontmatter 字段？
8. `trellis init` 的平台选择器仍列 22 个平台。是否需要在 fork 里把默认勾选改为三平台？建议改默认勾选，不删条目。
