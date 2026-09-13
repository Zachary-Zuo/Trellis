# Trellis 轻量化改造方案（v4 讨论稿）

> 状态：讨论稿，未实施。基于 2026-09-13 的四份审计（运行时注入、源码分层、spec 增长、外部方案）。
> v1 相对 v0：每个删除项补齐"现在做什么 / 为什么删 / 替代 / 损失"；spec 审查从占位改为完整设计（§4）；新增原则 P7。
> v2 相对 v1：撤回平台面裁剪（§3.6）。未安装的平台对项目零影响，裁剪只减少 fork 维护量，却带来大量测试改动与上游同步成本。改为只处理"不论装哪个平台都会漏进项目"的几处文本。
> v3 相对 v2：对齐 2026-09-13 的两个提交——13351418（独立发行线 `@zachary/trellis`、dsh mem adapter）与 aee145b3（中文 PRD 骨架、hook 经 Node launcher 启动）。新增 §0.4 语言规则：spec 与 task 正文中文、术语不翻译，workflow / 技能 / agent 保持英文。新增 §5.0 改动形态：第一版只改 markdown、config.yaml 与代码里的字符串，可选小段代码与 `generic` 类型、`spec_lint.py` 推到第二版；撤回"三件套"新门禁（违反 P1）。提交规则改为：两档都在检查通过后直接提交本次改动，归档才等用户说；`session_auto_commit` 因此不必改。修正 §3.3.6、§3.4、§3.5 里与模板现状不符的引用，清掉 v1 残留的"裁平台"措辞。
> v4 相对 v3：§3.3.1 brainstorm 新增"提问方式"——问题分五类按序走、选型题排最后；偏差信号触发对齐题；先告知再问；"一次一个问题"改为"一次一个决策点"。§2.2 档 A 第 1 步加同一对齐动作的轻量版。
> v5 相对 v4：按 2026-09-13 的逐条实测复核修订。(1) 修 6 处事实错误：§2.5 的 inline 回退前提读错（`build_breadcrumb` 行 401-402 早已回退，两个 `-inline` 块可零代码直接删，方案 a 与 b 都不必做）；§3.1 的 jsonl 理由（内联三件套只发生在子代理派发，不在主会话注入路径）；漏掉的 `[workflow-state:task_error]`；不存在的 `[required · once]` 测试 invariant（真实约束在 `registry-invariants.test.ts`）；marker 组改写缺的硬约束（块外默认文本必须留 `- ` 条目）；§4.1 的命令与技能其实各只有一份。(2) 新增 §6.1"被本次改造推翻的既有决定"，把 #292、PRD-only 档、jsonl 门禁逐条登记。(3) 新增 §6.2"遗漏的改动面"：`commands/workflow.ts` 的 `REQUIRED_WORKFLOW_STATE_IDS`、`marketplace/workflows/native/workflow.md` 副本、本仓库自己的 `.trellis/workflow.md`、config.yaml 不随 update 下发。(4) 削弱排序改为"先降预算、后撤护栏"（§3.2），`spec_lint.py` 提到第一版或先拿中等文件试点（§4.4），并新增原则 P8。(5) §2.5 的 `no_task` 块压回 400 字符内，补 `task_error` 块。(6) §4.2 四问收到四问，八个标签归为四个动作。(7) §2.2 档 A 加会话级免确认开关。(8) §3.1 明确 SessionStart 预算由 `## Phase Index` → `## Phase 1: Plan` 整段决定，并给 Planning Artifacts 安排去处。(9) §3.5 补 unknown 项目类型的第一版兜底。(10) §5.1 补 spec 总量基线。(11) 数字勘误并入各表。
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
| P8 | 撤护栏前先确认补偿手段已就位。同一风险的两道防线不同时撤；先降预算、先试点，再删除。 | v4 稿的排序教训（§3.2、§4.4） |

P7 同时约束三端：写入端（update-spec）、清理端（spec-review，§4）、初建端（spec-bootstrap）用同一套判据（§4.2 的四问）。

### 0.4 语言规则（2026-09-13 定）

- 中文的：安装到项目里的 spec（`.trellis/spec/`）与 task 产物（`prd.md`、`design.md`、`implement.md`、bootstrap 任务）的正文。种子模板因此也是中文：`templates/markdown/` 下的 spec 种子、`workspace-index.md`、`task_store.py` 里的三件套骨架、`init.ts` 里的 bootstrap 任务描述。
- 英文的：workflow.md 正文、三个 breadcrumb、技能 / 命令 / agent 定义、`agents.md` 注入块。这些是给 agent 的指令，用户很少读；解析器与测试都按英文写；上游对技能的修正 cherry-pick 时冲突更少。
- 中文正文里不翻译的：术语 task、spec、prd、design、implement、hook、breadcrumb、index、package、layer、slug、archive、workspace；文件名、目录名、frontmatter 键、命令、路径、代码标识符。
- 这条规则 aee145b3 已写了一半：PRD 骨架"说明"段与 `cmd_create` 提示里有"title / slug / 路径英文，正文中文"。写 spec 的三个入口（spec-bootstrap、update-spec、spec-review）与写 task 的 brainstorm 各加一句同样的话，让产物语言不依赖当次会话的语言。

---

## 1. 现状诊断摘要

| 症状 | 实测根因 | 数字 |
|---|---|---|
| 每轮问"要不要建任务" | 同一规则在 `workflow.md` 内有两份完整副本（L155-159 `### Request Triage`、L180-182 `[workflow-state:no_task]` 正文）加 5 处回响（L150/194/322/326/670），另在 `session-start.py` 与 fork invariant 各一份；`no_task` breadcrumb 每轮推送 | 472 B/轮 |
| 轻量任务也很长 | 第一句到归档 18 个强制步骤、11 道独立验证、3 次阻塞确认、至少 3 个 commit；jsonl 门禁不豁免 | lint/typecheck 至少 3 次 |
| 加重过度防御 | check 24 个复选框；check agent 被要求"自己修不要只报告"；3.3 要求"结论为无也要走一遍" | Anthropic 原话：被要求找问题的 reviewer 总会报出问题 |
| 验证指标被自造 | 6 处模板文字要求"可测试验收标准"或测试数量 | 见 §3.7 |
| 下游 spec 长歪 | init 把 Python 仓库判为 backend，种 web 模板；update-spec 的 7 段强制模板逐任务追加，零处删除指令 | 本仓库自身 spec 8 个月净增 19,663 行，主动收缩 2 次 |
| 平台噪音 | 只有 `workflow.md` 一个文件会把平台文本漏进每个项目：marker 块合计 10,564 B（占文件 24.9%）；2.1/2.2 的 marker 行共 23 个平台 token（21 个真实平台 + `codex-sub-agent` / `codex-inline` 两个伪名），其中那条重复出现的完整 marker 行是 19 个 token；`in_progress` breadcrumb 里 664 B 是 dsh 协议。其余平台专属代码只在 `trellis init` 选中该平台时才写入项目 | per-platform 模板目录占模板层 34.9%，对项目侧无影响 |
| token | SessionStart 8.7 KB（76% 是 Phase Index 全文）；进行中每轮 1.7 KB；读一次匹配文件塞 9.4 KB spec 片段 | |

---

## 2. 目标工作流

### 2.1 两档分流

| 档 | 进入条件 | 产物 | 结束 |
|---|---|---|---|
| A. 不建任务（默认） | 用户没有明确说"建任务" | 无 | 检查通过后直接提交；报告改了什么、怎么验证的、commit 是哪个 |
| B. 任务 | 用户明确说"建任务" / "create a task" / "走流程" | `prd.md` + `design.md` + `implement.md` 三件套齐全 | 一次验证；通过后直接提交本任务改动；归档由用户说 |

档 A 里改动越做越大时，agent 可以建议一次"要不要建任务"，用户不答就继续按档 A。

会话级免确认开关：用户说过"别问，直接改""这段不用复述"之后，本次会话跳到第 2 步；第 4 步的提交边界与"不 amend、不 push"不变。开关只由用户的话触发，agent 不自行判定——这补的是 §0.2"不做自动判档"的缺口：极小改动下"三段话 + 停下等确认"是纯摩擦，但档位判断权在用户手里，所以用显式开关而不是阈值。

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
| 3.1 spec 备注 | 只在踩到非显而易见的坑、做了未来会话必须知道的决策时写；先过 §4.2 四问 | required → optional |
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
Before editing, restate the requirement, what you will change, and what you will not do;
then wait for confirmation. Create a task only when the user explicitly asks, then load
`trellis-brainstorm`. After changes: run change-related checks, commit unless told not to,
report files, checks, and commit.
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

[workflow-state:task_error]
The active task record is unreadable. Repair it, or switch to the right task, before
continuing; do not create a new task to work around it.
[/workflow-state:task_error]
```

语言：保持英文（§0.4）。三个块的**含 tag 总长**都不超过 400 字符（实测 `no_task` 399、`in_progress` 380、`task_error` 197；正文分别为 348 / 329 / 146）。v4 稿的 `no_task` 正文是 435 字符、含 tag 486，超了自己定的预算——而它偏偏是注入最频繁的一块，所以这一版把复述三项压成了一行。`task_error` 必须保留：它是活状态（workflow.md L124 / L187-191 / L679，现有正文 345 B），v4 稿的 breadcrumb 集合与删除表都漏了它——删掉后任务记录损坏会退化成 `build_breadcrumb` 的通用提示"Refer to workflow.md for current step."。`[workflow-state:completed]` 仍然删（DEAD，见 §3.1）。

Codex 在 `dispatch_mode=inline` 时读 `planning-inline` / `in_progress-inline` 块。**实测更正（v4 稿读错了代码）**：`inject-workflow-state.py` 的 `build_breadcrumb` 行 401-402 早就有回退——`if body is None and lookup_key != status: body = templates.get(status)`，由 278b40ac 引入；v4 引用的行 232-241 是 `load_breadcrumbs` 的 docstring，描述的不是这段逻辑。这条回退今天就在生产路径上跑：Codex inline 且无任务时 `resolve_breadcrumb_key("no_task", ...)` 返回 `no_task-inline`，而这个 tag 从来不存在，正是靠回退落到主块。所以 v4 的两个方案都不需要：(a) 逐字重复两份文本 + 加 invariant 测试是多做的复杂度；(b) 要改的函数名不对（不是 `_status_tag`）。**做法：直接删掉 `planning-inline` / `in_progress-inline` 两个块，零代码改动，零漂移面。**唯一要同步的是 `packages/cli/src/commands/workflow.ts` 的 `REQUIRED_WORKFLOW_STATE_IDS`（见 §6.2）。

---

## 3. 逐模块修改清单

每个小节先列改动，再列"删除项与理由"表。表列含义：现在做什么 / 为什么删 / 替代 / 损失。

### 3.1 `templates/trellis/workflow.md`（726 行 → 目标 ≤ 250 行）

**保留并修改**

| 小节 | 改为 |
|---|---|
| Core Principles | 加 §2.4 两段；其余压缩 |
| Trellis System | 保留开发者身份、spec、task、workspace、context script，各 ≤ 5 行 |
| Phase Index | 3 行 ASCII 摘要 + §2.1 两档 + 3 个 breadcrumb 块（含 `task_error`）。**预算边界**：SessionStart 注入的是 `## Phase Index`（模板 L147）到 `## Phase 1: Plan`（L320）这一整段原始文本（12,697 B），脚本剥掉注释、tag 与裸 marker 行后剩 6,486 B。所以 ≤ 1.5 KB 由**这一段里的一切**决定，而不只是"Phase Index"标题下的内容。按本表删掉 Request Triage 与 Guardrails、Parent/Child 移到 1.0 详情、Active Task Routing 并为一块之后，还剩下三节没有安排去处：**Planning Artifacts**（§1 的产物定义，应移到 `## Phase 1: Plan` 之后）、Rules、Loading Step Detail |
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
| 1.3 Configure context 的 required 标记与 19 个平台 token 名（18 个平台 + 伪名 `codex-sub-agent`；L396 = L474 = L544） | 要求在 start 前手工填 implement.jsonl / check.jsonl | 只在派子代理时有用；主会话默认下是死重；派子代理时 `inject-subagent-context.py`（L519-630）本来就会内联三件套，jsonl 的边际价值只剩 spec 路径；本仓库 32% 的 jsonl 从未有真实条目 | optional，可由 design.md 引用的 spec 路径生成 | 派子代理时若 jsonl 为空，子代理只拿到三件套，需自己读 spec |
| 1.5 Completion criteria 表 | 6 行条件表（L465-472）加 1 行平台门控（L476） | 与 1.4 内容重复 | 并入 1.4 | 无 |
| 2.2 "Final pass 必须 full-scope、逐包加载 Quality Check" | 最后一轮 check 要列出所有包并读每个 index 的 Quality Check 段 | 这是 11 道验证里最重的一道：N 个包就 N 次加载；它验证的是"符合 spec"，与 P6/P7 冲突 | 2.2 一次对照验收标准 | 跨包一致性问题靠验收标准与已有测试捕获 |
| 2.2 "A required check that cannot run, is skipped, or exits non-zero is blocked/failed" | 跑不了的检查一律算失败 | 迫使 agent 补造检查或改环境；用户主机才跑测试的场景下这条永远触发 | "跑不了就如实说明" | 无 |
| 块外的 Sub-agent dispatch protocol 段（1466 B） | 列 Codex、Grok、Kimi、dsh 的派发协议 | 平台无关位置放平台专属协议，所有平台每会话都读 | 各协议进各自 marker 块 | 无 |
| Active Task Routing 的两套并列 marker 块（L287-293 / L295-301，各 3 条 bullet；不是表格） | sub-agent 组一块、inline 组一块 | 两块都会进 SessionStart 载荷，并排出现时指令互相矛盾 | 一块 | 无 |
| Guardrails 3 条 | 重申"建任务同意≠实现同意"等 | 与 breadcrumb、brainstorm 重复第三遍 | P1 + breadcrumb | 无 |
| 3.2 Debug retrospective 作为编号步骤 | 每任务提示"若反复调试则加载 break-loop" | 是按需技能，不该占步骤号让 continue 路由判断 | break-loop 保留为技能 | 无 |
| 3.3 Spec update 的 required 与"结论为无也要走一遍判断" | 每任务必经 | 强制仪式；与 update-spec 的 7 段模板叠加成 spec 增长引擎 | 3.1 optional + §4.2 四问 | 无 |
| 3.4 的 Spec-sync preamble | 提交前再问一次"要不要更新 spec" | 同一问题问两次 | 删 | 无 |
| 3.5 Wrap-up reminder | 提醒用户跑 finish-work | finish-work 由用户调用；提醒每任务出现一次 | 删 | 无 |
| `[workflow-state:completed]` 块（正文 80 B） | 归档后 breadcrumb | workflow.md 自己在行 131、264、684 三处注明"currently DEAD"，archive 时指针已丢 | 删 | 无。**注意 `[workflow-state:task_error]` 不删**：v4 稿把它和 completed 一起漏掉了，它是活状态（L124 / L187-191 / L679） |
| Customizing 小节里的 `[workflow-state:my-status]` 示例 | 文档示例 | 解析器不识别代码围栏，把示例当成了真实状态 | 示例改用非 tag 语法 | 无 |
| marker 行里的 23 个平台 token（21 个真实平台 + `codex-sub-agent` / `codex-inline` 两个伪名；重复出现的那条完整 marker 行是 19 个 token）与每组一套派发说明 | 每个平台组各写一遍 2.1 / 2.2 | 块外写平台中立的默认文本，marker 块只放三平台各自的特殊协议（Claude hook 注入、Codex SubagentStart / inline、dsh pull + `trellis_wait`）；其余平台自动落到默认文本。已实测 `filter_platform` 保留 marker 块外的文本，所以这条路可行 | 3 组 marker | 其余平台失去专属派发说明，仍可用。**硬约束**：`test/registry-invariants.test.ts:294-347` 驱动真实 Python resolver，断言每个平台 id 经 `filter_platform` 后 `### Active Task Routing` 段内至少留一行 `- ` 条目——块外默认文本里必须保留至少一个 `- ` 条目，否则 22 个平台用例一起红 |

解析器约束必须保留：`## Phase Index` 标题（`workflow_phase.py:39`）、`#### X.Y` 步骤标题（`_STEP_HEADING_RE`，行 36）、`[workflow-state:STATUS]` 成对 tag、marker 行格式。

**测试 invariant 更正**：v4 稿写的"每个 `[required · once]` 步骤必须在所属 phase 的 breadcrumb 里有对应行"在测试里并不存在——`[required · once]` 唯一出现的地方是 `update.integration.test.ts:852,1549` 的字面 fixture。真正会挡住这次改写的是另外两条：(1) `registry-invariants.test.ts:294-347` 的 Active Task Routing 非空约束（见上表）；(2) `regression.test.ts:7744`（`[workflow-state-r2]`）断言 planning breadcrumb 的原文，同文件 `[#292]` 断言 jsonl 门禁，`templates/shared-hooks.test.ts:234` 断言 PRD-only 档——这三条不是"改期望值"，是推翻既有决定，必须走 §6.1 的登记。

### 3.2 注入层 `templates/shared-hooks/`（三平台共享的 hook）

**保留并修改**

| 文件 | 改为 |
|---|---|
| `session-start.py` | 脚本按 `## Phase Index` 到 `## Phase 1: Plan` 抽取 workflow.md 原文注入（行 836），抽取范围见 §3.1 的"预算边界"——**缩的必须是这一整段，不是只有 Phase Index 标题下的内容**，否则注入量降不到 ≤ 1.5 KB。脚本不必改。可选的脚本改动只剩两处：删 `<first-reply-notice>` 段、去掉载荷双发 |
| `inject-workflow-state.py` | 第一版不改。v4 稿的两个方案都不需要：`build_breadcrumb` 行 401-402 已有 `-inline` → 主块的回退（§2.5）。可选：忽略代码围栏内的 tag（`my-status` 那个示例） |
| `inject-spec-context.py` | 脚本不改。第一版：`templates/trellis/config.yaml` 显式打开 `spec_injection` 并设 `max_spec_chars: 3000`（现在整段是注释，代码默认 `DEFAULT_EDIT_TOOLS = ("Read","Edit","Write","MultiEdit")`，行 125）。**跑过一轮 spec-review、spec 压到预算内之后**，第二版再把 `tools` 收成 `[Edit, Write]` —— 理由见下表的顺序说明与 P8 |
| `inject-subagent-context.py` | 不改；jsonl 为空时只内联三件套 |
| 关闭开关 | `no-trellis`、`TRELLIS_HOOKS=0` 保留 |

Codex 的 `SubagentStart` 注入与 dsh 的 pull 式加载沿用现有实现。

**为什么 Read 触发分两步撤（P8）**：§3.3.2 删掉 check 的"逐包读 index 的 Quality Check 段"之后，验证阶段已经不看 spec 了；如果同一次改造又把**读代码**阶段的 spec 提醒也关掉，主会话就只剩下 Edit/Write 那一刻的注入——而那时方案往往已经定了。两道防线同时撤、补它们的手段（§4 的 spec-review / `spec_lint.py`）却要到第二版，这是 v4 稿的排序漏洞。所以第一版先降预算（Read 仍触发，但每次最多 3 KB），等 spec 真的瘦下来再撤触发。

**另一个下发问题**：`spec_injection` 在模板 `config.yaml` 里整段是注释，本仓库自己的 `.trellis/config.yaml` 里也没有这个块（`channel:` 倒是未注释，在 L125）。config.yaml 由 `trellis init` 写入，`trellis update` 不管它。所以这项改动**只对新建项目生效**；要让自己的会话也生效、要量到 §5.1 说的 token 对比，必须先手改本仓库的 `.trellis/config.yaml`。见 §6.2。

**删除项与理由**

| 项 | 现在做什么 | 为什么删 | 替代 | 损失 |
|---|---|---|---|---|
| `<trellis-workflow>` 的 Phase Index 全文（6.7 KB/会话） | 把 workflow.md 行 144-307 搬进每个会话开头 | 档 A 用不到任何 phase 细节；档 B 每步都能按需拉；这是最大的单项 token 税 | 3 行摘要 + 按需拉取 | 首次进入档 B 时多一次 `get_context.py` 调用 |
| `<first-reply-notice>` 的致谢要求（781 B） | 强制首句说"Trellis SessionStart 已加载"并选语言 | 纯仪式，每会话一次；语言选择逻辑 3 条规则只为一句话 | 只留一行更新提示 | 无 |
| 载荷双发（`additionalContext` + 顶层 `additional_context`） | 同一文本发两遍。脚本自己的注释（`session-start.py:958-959`）说 ZCode **两个键都读且不去重**，所以现状是 ZCode 把同一段文本收两遍 | v4 稿写的"平台只读前者"与注释相反；真正的收益是**修掉 ZCode 的重复注入**，附带省一半载荷 | 单发（保留 `additionalContext`，去掉顶层键） | 需在 ZCode 上确认它还读得到（它本来就是两个都读，去掉一个仍可读） |
| spec 注入的 Read 触发 | 读任何匹配文件就注入（`DEFAULT_EDIT_TOOLS` 含 `Read`） | 读文件是最频繁的动作；档 A 里读 3 个文件可能塞 28 KB spec | **第一版只降预算**：`max_spec_chars: 9400 → 3000`；**第二版**（spec-review 跑过一轮后）再收成 `[Edit, Write]` | 读代码时不再自动看到相关 spec；需要时手动 cat |

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

- 写入条件：只有三种——踩到非显而易见的坑；做了未来会话必须知道的决策；约定与语言/框架默认不同。写入前过 §4.2 四问。
- 写入语言：正文中文（§0.4）。
- 三种动作：add / modify / remove。每次写入先回答"这条替代或废止了现有哪条"，并执行对应的 modify / remove。
- 单文件预算 200 行 / 12 KB，超了先删再加。
- 保留的短模板：Convention、Don't、Common Mistake、Design Decision，各 ≤ 8 行。
- 新 checklist 5 项：是否可从代码直接推出（是则不写）；是否已有等价条目；是否替代了旧条目；是否超预算；是否含 file:line 证据。

**删除项与理由**

| 项 | 现在做什么 | 为什么删 | 替代 | 损失 |
|---|---|---|---|---|
| "Code-Spec First Rule (CRITICAL)"：spec 必须是可执行契约（签名、字段、env、错误行为） | 把 spec 定义为代码契约的镜像 | 直接违反 P7：签名、字段、错误码都能从代码读到，镜像一份就会漂移；这是本仓库 spec 里 `platform-integration.md` 长到 197 KB 的根因 | P7 + 四问 | 无 |
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

加"文件越少越好、不适用的种子文件直接删"与"算法 / 研究型仓库的 spec 形态：一个 conventions + 一个 verification 即可"。初建时同样过 §4.2 四问。Operating Rules 加一条 §0.4 语言规则：spec 正文中文，文件名英文。

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

命令与技能都是单源：`templates/{claude,codex,dsh}/` 下只有 `agents/`（claude、codex 另有 `hooks/`），**没有** per-platform 的 `skills/` 或 `commands/` 目录。所以 §4 的 `trellis-spec-review` 是 `common/skills/` 一份加 `common/commands/` 一份，不是三份薄包装。

#### 3.3.11 agent 定义（implement / check / research，三平台各一份）

| 项 | 改为 | 理由 |
|---|---|---|
| implement agent 的 lint / type-check 要求 | claude `trellis-implement.md:78` 与 dsh `trellis-implement.md:74` 的 "Run project's lint and typecheck commands to verify changes" 改为 "run checks related to the change"；codex `trellis-implement.toml` 完全没提 lint / type-check（只有 L35 的 "Tests/checks run"），无内容可改 | 与 §2.4 一致。v4 稿把它写成三平台同一句，与现状不符 |
| check 的 "Fix issues yourself" | 见 §3.3.2 | 与技能一致 |
| research 的 "Returning findings only through the chat reply is a failure" | 保留 | 这条是对的：研究结果不落盘就会随 compaction 丢失 |
| `inject-subagent-context.py` 的 implement prompt 模板里 "Self-check against check specs" | 删 | 子代理不再以 spec 为验证对象（P7） |

### 3.4 引擎脚本 `templates/trellis/scripts/`

| 文件 | 改动 | 理由 |
|---|---|---|
| `common/task_store.py` `_default_prd_content`（行 301，aee145b3 已改为中文 7 段骨架） | 在已提交骨架上只改两处：验收标准段加注释；"说明"段删"轻量任务可以只保留 PRD"一行（行 335）。`cmd_create` 提示（行 730-732）同样删"轻量任务可以只保留 PRD"；jsonl 种子在行 617-630 | 字符串改动，不是逻辑改动 |
| design.md / implement.md 种子 | 建议放 `cmd_create`（行 343），紧挨 `_default_prd_content` 加两个同形函数，十几行；零代码的替代是模板放进 brainstorm.md，由 agent 建文件 | task 目录布局是引擎的事，放引擎更稳；但两种都可 |
| `task.py start` 行 202-217 的 jsonl 门禁 | 不加任何新门禁（P1）。现有门禁只在 create 种了 jsonl 时触发，且已有 `--allow-empty-context` 旗标（行 764）。两种处理：(a) 零代码——workflow.md 1.4 写明 jsonl 为空时带该旗标；(b) `cmd_create` 行 617-630 不再种 jsonl，门禁自然不触发。建议 (b)，几行，比让 agent 每次记旗标干净 | 见 §3.1 |
| `templates/trellis/config.yaml` 的 `spec_injection:` 段（L183-193，现为注释） | 显式打开并设 `max_spec_chars: 3000` | 见 §3.2。**只对新建项目生效**：config.yaml 由 init 写入，update 不管它，见 §6.2 |
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
| 项目类型 | 第二版再做：增加 `generic`，unknown 与"Python 但无 web 框架依赖"归此类。这是 TS 改动（`project-detector.ts`、`init.ts`、`markdown/index.ts` 三处加测试）。**第一版兜底（一行映射）**：`init.ts:547` / `1467` 现在把 `unknown` 直接映射成 `fullstack`，改成 unknown 只种 backend 一套（不动 `project-detector.ts`），比完全依赖"用户真的会跑 bootstrap 任务"稳 | 现在 Python 一律判 backend；更糟的是 `init.ts:547`、`1467` 把 `unknown` 映射为 `fullstack`，没有任何指示文件的仓库会同时种 backend 与 frontend 两套 |
| `generic` 种子 | 随上一行第二版；形态是 `spec/<pkg>/index.md` + `conventions.md` + `verification.md`（检查命令、什么算验证通过），中文 | 三个文件够覆盖 P7 允许留在 spec 里的东西 |
| web 类型种子（backend / frontend 共 13 个文件：backend 6 + frontend 7） | 正文改中文；删三处 "All documentation should be written in English"（`spec/backend/index.md.txt` 行 38、`spec/frontend/index.md.txt` 行 39、`workspace-index.md` 行 125） | §0.4 |
| `guides/` 合并后的 `thinking-triggers.md` | 中文 | §0.4 |
| bootstrap 任务描述（init.ts 行 397-543） | 中文；"只写代码库能证明的约定；不适用的文件删除；每文件 ≤ 200 行；写入前过四问"；删"每个任务都派两个子代理、hook 自动注入 jsonl"那段运行时说明 | 现文英文；"空 spec 等于子代理写通用代码"驱动填满；主会话默认后子代理说法失真 |
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
- 裁剪的收益只有 fork 维护量下降；代价是 `packages/cli/test/`（86 个文件 40,969 行，其中 31 个引用 `workflow.md` / `workflow-state`）里平台矩阵、registry-invariants、regression、template 测试的大面积改动，加上之后无法从上游 cherry-pick 引擎修复。
- 用户本人可能换平台或加平台；保留矩阵零成本。

**不论装哪个平台都会漏进项目的东西**，这些才需要处理，且都是文本级改动，已分别列在别的小节：

| 漏入点 | 项目侧表现 | 处理 | 所在小节 |
|---|---|---|---|
| `workflow.md` 的平台 marker 组与块外厂商段落 | marker 行共 23 个平台 token；块外 1466 B 协议段每会话读；`in_progress` breadcrumb 665 B dsh 段每轮读 | 重写时把三平台的特殊协议放进各自 marker 块；块外只写平台中立文本；其余平台走块外默认文本，不再逐个列名 | §3.1 |
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

- 由用户调用，不是任务步骤，不挂 hook，不自动跑。入口各一份：技能 `common/skills/spec-review.md` + 命令 `common/commands/spec-review.md`（不需要三平台各写一份——模板层没有 per-platform 的 skills / commands 目录，见 §3.3.10）。
- 目的：审查、整理、清理已有 spec；保留代码推不出的项目约束；消除与代码的漂移；把 spec 总量压回预算。
- 分工：脚本只算事实，不做判断；技能做判断并写提案；执行前必经用户批准。
- 与写入端共用判据：update-spec 写入时、spec-bootstrap 初建时、spec-review 清理时都用 §4.2 四问，避免一边写一边删。

### 4.2 判据：什么该留在 spec（四问）

对 spec 里的每一条（按 H2/H3 切分）依次问：

| # | 问题 | 答"是"时 | 例 |
|---|---|---|---|
| Q1 | 读相关代码一分钟内能得到同样信息吗？ | 不留。最多留一行指针"见 `path/file.py`" | 函数签名、参数表、目录结构、错误码表、配置键清单 |
| Q2 | 违反它会造成测试抓不到的错误，或它来自一次真实事故吗？ | 留，写成一行规则 + 违反后果；有事故背景的删叙事、日期、issue 号 | "两个模块必须同步改"；"不要在 X 里调 Y：会死锁" |
| Q3 | 它是一个代码表达不出的理由吗（决策理由、被否决的方案、与语言 / 框架默认不同之处）？ | 留，≤ 3 行 | "用 X 而不用 Y，因为 Z"；"本仓库不用 dataclass，用 attrs" |
| Q4 | 它是操作步骤（how-to）吗？ | 变成脚本或命令，spec 只留一行指向 | "发布前跑这 5 条命令" |

四问全否的条目删除。Q1 是最强的一问，先问它。

**为什么从六问收到四问**：v4 稿的 Q2（违反会造成测试抓不到的错误）与 Q5（来自真实事故）问的是同一件事——违反的后果；Q3（决策理由）与 Q4（与框架默认不同）问的也是同一件事——代码表达不出的理由。合并后判据不减，仪式少一档；§4 本身是"由用户调用、每季度一次"的动作，不该再叠一层清单。

### 4.3 调用时机（建议，由用户判断）

- 归档任务累计到一定数量（例如 10 个）后。
- 开始一个大功能前，确保 spec 不给错误约束。
- 发现按路径注入的 spec 与代码不符，或注入内容明显是噪音时。
- Step 0 的事实表出现超预算或死引用时。
- 例行：每季度一次。

### 4.4 流程

**Step 0 机械事实（只读）**

**v5 改动：`spec_lint.py` 提到第一版。** v4 稿把脚本推到第二版，让 agent 手工 `wc -l` + `grep -rn` 扫 42 个文件 / 1.03 MB，还要人工判断死引用（代码里不存在的路径、函数名、类名、CLI 旗标）。下表七项全是确定性检查，本来就属于"脚本算事实、技能做判断"的既定分工；而这项能力正是 §3.2 撤掉 Read 触发的前提（P8）。第一版只写机械部分，判断仍留在技能里。

若坚持第一版不写脚本，则必须先挑一个**中等规模**文件试点（例如 `commands-update.md` 35 KB），不要一上来就切 197 KB 的 `platform-integration.md`。要算的事实：

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

把每个 spec 按 H2/H3 切成条目，逐条过四问，打一个标签并附一句理由：

| 标签 | 含义 | 后续 |
|---|---|---|
| KEEP | 四问有"是"，且已足够短 | 不动 |
| TIGHTEN | 四问有"是"，但太长或含叙事 | 压缩到规则 + 后果 |
| MERGE→X | 与条目 X 重叠 | 合并进 X |
| DERIVABLE | Q1 为是 | 删，或留一行指针 |
| STALE | 与代码不符（Step 2 判定） | 改写为当前状态，或删 |
| NARRATIVE | 历史叙述、复盘、issue 引用 | 压成一行规则或删 |
| PLACEHOLDER | 模板残留、"To be filled"、空标题 | 删 |
| ASK | 拿不准（例如疑似有意的护栏） | 列给用户裁决 |

八个标签是**诊断词汇**，最终只归成四个动作，写进 Step 3 的提案时用动作列：KEEP → 留；TIGHTEN、MERGE → 压；DERIVABLE、STALE、NARRATIVE、PLACEHOLDER → 删；ASK → 问。保留八个标签是因为"这条能从代码推出"与"这条已经过时"对用户批准提案是不同的信息，但批准与执行只需要四个动作。

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

- 写入端（3.1 步、update-spec）用同一四问，写入时就不产生 DERIVABLE 条目。
- 验证端（check）以代码与验收标准为准，不读 spec 做验证；spec 只在 Edit/Write 时按路径注入作提醒。spec 越小，注入越准。**第一版 Read 注入仍在（只降预算，见 §3.2）**——因为把关 check 的那道 spec 防线同时撤掉时，补它的能力（本节的 spec-review / `spec_lint.py`）必须先到位（P8）。
- 初建端（spec-bootstrap）按四问写，`generic` 项目从三文件开始。
- 本仓库自己的 42 个 spec（14,738 行 / 1.03 MB）可作为验证这套流程的对象。**但不要拿 `platform-integration.md`（197 KB）第一个开刀**——先用一个中等规模文件（例如 `commands-update.md` 35 KB）把 Step 0-5 走通，确认提案格式与删除上限可用，再处理两个 100 KB+ 的文件。预期那两个的大部分条目落在 DERIVABLE 与 NARRATIVE。

---

## 5. 实施顺序与验证

### 5.0 改动形态

这套方案本质是 prompt 改动。逐项分类后，第一版可以做到"改 markdown 与 config.yaml，外加一处 TS 常量与同步测试期望值"：

| 类别 | 内容 | 形态 |
|---|---|---|
| markdown | `templates/trellis/workflow.md`、其副本 `marketplace/workflows/native/workflow.md`（当前与模板 MD5 相同）、breadcrumb 块、5 个技能、3 个命令、3 组 agent 定义、bundled skills 文档、spec 种子、workspace-index、新技能 spec-review | 纯文本，第一版主体 |
| yaml | `config.yaml`：显式打开 `spec_injection:` 并设 `max_spec_chars: 3000`、`channel:` 注释掉 | 配置文本。**只对新建项目生效**，见 §6.2 |
| 代码里的字符串 | `task_store.py` PRD 骨架与 `cmd_create` 提示、`init.ts` bootstrap 描述与 unknown 映射、`inject-subagent-context.py` 的 implement prompt、`commands/workflow.ts` 的 `REQUIRED_WORKFLOW_STATE_IDS` | 改的是字面量与常量，不改逻辑 |
| 小段代码（可选） | `cmd_create` 种 design.md / implement.md（十几行）；`cmd_create` 不再种 jsonl（几行） | 每处都有零代码替代（§3.4），第一版可全跳过。**不再需要** `_status_tag` 回退——`build_breadcrumb` 已有（§2.5） |
| 第一版新增脚本 | `templates/trellis/scripts/spec_lint.py`（Step 0 的机械事实，只算不判断） | 见 §4.4；若坚持不写，则先在中等文件上试点 |
| 推迟到第二版 | `generic` 项目类型（TS 三文件 + 测试）；spec 注入收成 `[Edit, Write]` | 各有第一版替代（§3.5、§3.2） |
| 绕不开 | `packages/cli/test/` 里断言模板文本的用例改期望值；**另有 3 条是语义断言，属 §6.1 的推翻决定，必须连理由一起改** | 模板一动就挂；文本期望只是改期望，语义断言要登记 |

### 5.1 阶段

| 阶段 | 内容 | 验证 |
|---|---|---|
| A 文本（1 天） | §3.1 workflow.md 与其 marketplace 副本、§2.5 breadcrumb（含 `task_error`、删两个 `-inline`）、§3.3 技能 / 命令 / agent 文本、§3.4 PRD 骨架字符串与 config.yaml、§3.5 中文 spec 种子与 bootstrap 描述、§4 spec-review 技能与命令 + `spec_lint.py`、§6.1 的推翻决定登记 | 样例项目 `trellis init` 后：SessionStart ≤ 1.5 KB；breadcrumb ≤ 400 B；走一次档 A 与一次档 B，数阻塞确认次数（档 A 1 次：复述后；档 B 1 次：start 前）；记录 token 对比（**先手改本仓库 `.trellis/config.yaml`，否则量不到**）；`task.py create` 产出的三件套与种子 spec 正文无英文占位；在本仓库 spec 上跑一次 spec-review 到 Step 3 |
| B 测试同步 | 因模板文本变化而失败的 `packages/cli/test/` 用例（31 个文件引用 workflow.md / workflow-state）；断言英文骨架 / 种子文本的用例（aee145b3 已为 PRD 骨架改过一批，可参照）；**外加 §6.1 那 3 条语义断言（`regression.test.ts:7744` / `[#292]`、`shared-hooks.test.ts:234`）**；不做平台裁剪 | `pnpm test` 在用户主机通过；三平台各 `trellis init` 一次 |
| C 代码（按需，第二版） | §3.4 的可选小段代码、`generic` 项目类型、spec 注入收成 `[Edit, Write]` | 只在阶段 A 用过一到两周、且 spec-review 已把 spec 压到预算内之后才做（P8） |

消融纪律：阶段 A 完成后先用一到两周，只有同一处错误重复出现两次以上才把对应规则加回，并记录加回原因。

成功判据除成本侧（注入 ≤ 1.5 KB、breadcrumb ≤ 400 B、阻塞确认次数）外，补一条可证伪的收益侧基线：**spec 总量 42 个文件 / 14,738 行 / 1.03 MB**，其中 `platform-integration.md` 197,630 B、`script-conventions.md` 132,069 B。P5/P7 的成败只有这个数字能证；只量 token 不量 spec 总量，等于只验证了成本没验证收益。

---

## 6. 风险与兼容

- **上游同步**：13351418 已把 fork 定为独立发行线（`@zachary/trellis`，版本 `0.7.0-beta.4-zachary.1`），不再跟踪 upstream，引擎与 mem 的修复按需 cherry-pick。模板改动面大因此不再是风险，是前提。
- **已安装项目的更新**：`trellis update` 按模板 hash 分类，未手改过 workflow.md 的项目会被静默覆盖到新版本，手改过的会弹"覆盖 / 跳过 / 另存"。没有三方合并。
- **解析器格式**：`## Phase Index`（`workflow_phase.py:39`）、`#### X.Y`（`_STEP_HEADING_RE`，行 36）、`[workflow-state:*]` 成对 tag、marker 行格式不能变。会响应的测试是 `registry-invariants.test.ts:294-347`（每个平台的 Active Task Routing 段至少留一行 `- `）与 `inject-workflow-state-kiro` / `prompt-injection-skip-keyword` 两个集成测试。v4 稿提到的"`[required · once]` breadcrumb invariant"并不存在（§3.1）。
- **Codex inline 变体块**：**已核实 `build_breadcrumb` 行 401-402 本来就有 `-inline` → 主块回退**（v4 稿读反了）。第一版直接删两个变体块，零代码、零漂移面，顺带同步 `commands/workflow.ts` 的 `REQUIRED_WORKFLOW_STATE_IDS`（§6.2）。
- **dsh**：`trellis_wait` 协议与 pull 式加载只在 dsh marker 块内保留，需在 dsh 上实际走一次档 B。
- **check 不再读 spec**：这是 P7 的代价。第一版 Read 注入仍在（只降预算），所以读代码阶段还有兜底；等 §4 的 spec-review 把 spec 压小之后再撤 Read 触发。两次同时撤违反 P8。
- **测试量**：`packages/cli/test/` 86 个文件 40,969 行，其中 31 个引用 `workflow.md` / `workflow-state`。这 31 个不会全挂，但 §6.1 那 3 条是语义断言，不是"改期望值"。
- **其余平台的 workflow.md**：marker 只放三平台专属协议后，其他平台 `trellis init` 拿到的 2.1 只有块外的平台中立文本。对用户无影响，但若日后加平台需补 marker 块；块外默认文本必须保留至少一个 `- ` 条目（§3.1 的硬约束）。
- **提交先于用户审阅**：两档都在检查通过后直接提交，用户看完结果或在另一台机器跑完测试再要改，就多出 `fix:` 提交。本地未 push 的历史多几个小 commit 没有实际损失；在意就 push 前手动 squash。不 amend 仍是硬约束。档 A 的会话级免确认开关（§2.2）只跳过复述，不跳过提交边界。

### 6.1 被本次改造推翻的既有决定

这三条不是"模板文本变了所以改期望值"，而是仓库里**有 issue 编号的既有决定被推翻**。不登记的话，未来会话看到失败用例会当成回归、把规则再加回来——这正是 `trellis-break-loop` 要防的循环。所以每条都要写清原决定、编号、为什么现在推翻，并让 commit message 引用它。

| 被推翻的决定 | 证据 | 本次为何推翻 | 必须同步 |
|---|---|---|---|
| jsonl 必须在 `task.py start` 前各有至少一条真实条目，seed-only 不算 planning-ready | `regression.test.ts` 的 `[#292]` 用例断言 `Ready gate: both implement.jsonl and check.jsonl must contain at least one real entry before task.py start` 与 `Runtime consumers tolerate missing or seed-only manifests for compatibility, but that tolerance is not a planning-ready state.` | 用户要求单一任务形态、主会话默认实现；jsonl 只在派子代理时有用，而 `inject-subagent-context.py`（L519-630）本来就会内联三件套 | 改该用例；`task.py start` 的 `--allow-empty-context` 从"逃生口"变成常规路径；§3.4 的 jsonl 种子处理 |
| 任务分轻量 / 复杂两档，轻量可只写 prd | `regression.test.ts:7744`（`[workflow-state-r2]`）断言 planning breadcrumb 的 `Lightweight: prd.md can be enough` / `Complex: finish prd.md, design.md, and implement.md`；`templates/shared-hooks.test.ts:234` 断言 `Lightweight task can request start review with PRD-only` | 用户要求任务档三件套齐全；两种形态让 start 门禁、continue 路由、brainstorm 都要分支 | 改这两条断言；`workflow.md:167` 的 `Lightweight tasks may be PRD-only`；`task_store.py:335` 与 `cmd_create` 提示 |
| 规划阶段就要把 implement.jsonl / check.jsonl 整理好 | `regression.test.ts:7744` 后半断言 `curate implement.jsonl and check.jsonl as spec/research manifests before start` | 同第一条 | 同上 |

### 6.2 遗漏的改动面（v4 稿未提，但这次改造会碰到）

| 面 | 现状 | 处理 |
|---|---|---|
| `packages/cli/src/commands/workflow.ts:288-296` `REQUIRED_WORKFLOW_STATE_IDS` | 硬编码六个状态：no_task / planning / planning-inline / in_progress / in_progress-inline / completed，注释点名要与 `.trellis/spec/cli/backend/workflow-state-contract.md` 同步 | 删掉 `completed` 与两个 `-inline` 后同步这张表。它只 warn 不 block，但 §5.0"只改 markdown"的说法要把它算进去 |
| `marketplace/workflows/native/workflow.md` | 与 `templates/trellis/workflow.md` **MD5 完全相同**（E7348BC9BD） | native 是虚拟入口 `bundled:trellis/workflow.md`（`utils/workflow-resolver.ts:88-104`），这份副本不同步就会漂移；改模板时一并改 |
| 本仓库自己的 `.trellis/workflow.md`（714 行，与模板的 726 行不同） | 当前会话真正读的那份 | 改模板不会改它。要 dogfood 得先刷新它，否则你自己手上这个会话还是旧行为 |
| `templates/trellis/config.yaml` 的 `spec_injection:` 段 | 整段是注释（L183-193）；代码默认 `DEFAULT_EDIT_TOOLS = ("Read","Edit","Write","MultiEdit")`（`inject-spec-context.py:125`）；本仓库 `.trellis/config.yaml` 里没有这个块 | config.yaml 由 init 写入、update 不管它，所以 §3.2 的降预算**只对新建项目生效**。要量 §5.1 的 token 对比，先手改本仓库的 `.trellis/config.yaml` |
| `.trellis/spec/cli/backend/workflow-state-contract.md` | `workflow.ts` 的注释点名要与它同步 | breadcrumb 集合变化（删 `completed` 与两个 `-inline`、保留 `task_error`）后同步该契约文档 |

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
9. （v5 新增）档 A 的会话级免确认开关（§2.2）由哪些话触发？建议只认明确措辞（"别问""直接改""不用复述"），且只在当前会话有效；不接受 agent 自行推断。
10. （v5 新增）`[workflow-state:task_error]` 的处理：保留（本稿建议）还是也删掉、退化成通用提示？它不在 `REQUIRED_WORKFLOW_STATE_IDS` 里，保留的成本是 §6.2 的契约文档多一条。
11. （v5 新增）`spec_lint.py` 是否进第一版？本稿建议进（§4.4）。若你坚持不写脚本，就要接受 spec-review 第一轮只在一个中等文件上做。
12. （v5 新增）本仓库自己的 `.trellis/workflow.md` 要不要一并刷新？不刷新则阶段 A 的"走一次档 A / 档 B"验证是在旧 workflow 上做的，量不到真实效果。

---

## 8. 阶段 A 执行记录（第 1 片：workflow.md + breadcrumb）

### 8.1 实测推翻的三个机制假设

| v5 稿的假设 | 实测 | 影响 |
|---|---|---|
| Phase Index 里的 breadcrumb 块属于注入预算 | `session-start.py` 在注入前剥掉**全部** `[workflow-state:*]` 块、HTML 注释与裸 marker 行。7 个块合计 3,694 B，**对 SessionStart 预算贡献为 0** | 预算完全由正文决定；删 `completed`、删两个 `-inline` 都省 0 B。本片因此**保留**全部 7 个块 |
| SessionStart 的取数范围是"Phase Index 那一段内容" | 实际是 `## Phase Index` → `## Phase 1: Plan` 之间**一整段**（模板 L147-L318，原始 12,697 B） | 只缩标题下的内容远远不够，必须把这一段里的正文搬走 |
| ≤1.5 KB 可达成 | 实测落到 **1,768 B**（原 6,476 B，降 73%）。再往 1.5 KB 压只能牺牲 `### Active Task Routing` 或 `### Rules`，而 `get_context.py --mode phase` 与 `--platform <id>` 的路由过滤都依赖它们 | 目标调整为 **≤2 KB**，并已写成测试断言 |
| 平台 marker 组合并能省 token | `#### 2.1` / `#### 2.2` 位于 `## Phase 1: Plan` **之后，不在注入范围内** | 合并是零收益改动，却会删掉 class-2 pull-based / Kiro / codex-inline 的功能文本并打破 5 个测试。v5 的这条已撤回 |

### 8.2 撤回的两处 v5 决定

- **不删 `-inline` 块**：删了省 0 B，代价是改 `REQUIRED_WORKFLOW_STATE_IDS`、契约文档与 3 个测试。改为保留，并在块间注释里说明 codex-inline 为什么需要不同的 per-turn 文本。
- **2.1 / 2.2 的平台 marker 组保持原结构**（4 块 + 2 块），只把内容按 §2.3 调整措辞。

### 8.3 本片实际改动

| 文件 | 改动 |
|---|---|
| `packages/cli/src/templates/trellis/workflow.md` | 726 → 544 行。Phase Index 段重写：新增"两档"表；删 Request Triage 与 Guardrails；Planning Artifacts 与 Parent/Child 移到 `## Phase 1: Plan` 之后；1,466 B 的 dispatch 协议移入 Phase 2 新小节；Rules 压缩。Core Principles 增补 Verification Principles 与 Avoid Over-engineering（§2.4）。2.2 重写为"对照验收标准给证据"；3.3 改 `[optional · once]`；3.4 改为检查通过即提交、不再让用户先批准提交计划；`my-status` 示例改为不匹配 `[A-Za-z0-9_-]+` 的占位符 |
| `marketplace/workflows/native/workflow.md` | 同步为同内容。**注意 `marketplace` 是 git submodule**，需在其内部单独提交 |
| `packages/cli/test/regression.test.ts` | 5 条断言更新：`[workflow-state-r2]`、`[#292-reversed]`、`get_context --mode phase`、`[pi] --mode phase`、session-start `<trellis-workflow>`（新增 ≤2 KB 预算断言） |

未改（留给第 2、3 片）：`commands/workflow.ts`（改动已撤回）、技能 / 命令 / agent 文本、config.yaml、spec 种子。

### 8.4 已知的中间态不一致（第 2 片必须关闭）

`common/skills/brainstorm.md` 与 `copilot/prompts/brainstorm.prompt.md` 仍写着 "seed-only manifests are not ready"（旧 #292 门禁），而 workflow.md 已把 1.3 改成 `[optional · once]`。测试 `[#292-reversed]` 现在**同时**钉住新契约与这两处旧文案——第 2 片改技能文本时必须三处一起改，否则测试会红。

### 8.5 新增的推翻登记（并入 §6.1）

| 被推翻的决定 | 证据 | 为何推翻 |
|---|---|---|
| 1.3 必须 `[required · once]`，且 start 前两个 jsonl 各有真实条目 | `regression.test.ts` 的 `[#292]`（本片改写为 `[#292-reversed]`） | 主会话实现成为默认；jsonl 只对子代理派发有意义，边际价值只剩 spec 路径 |
| 阶段请求必须先做"轻量 / 复杂"二分 | `regression.test.ts` `[workflow-state-r2]` 的旧断言 | 单一任务形态；微小改动走档 A 根本不建任务 |
| Phase Index 必须连 Request Triage 与 Planning Artifacts 一起注入 | `[workflow-v2] get_context --mode phase` 与 session-start 两处旧断言 | 这两节移到 `## Phase 1: Plan` 之后按需加载，为预算让路 |

### 8.6 尚未处理

- 契约文档 `.trellis/spec/cli/backend/workflow-state-contract.md`：L16 与 L440 声称"每个 `[required · once]` 步骤必须在所属 phase 的 breadcrumb 里有对应行"，并说该 invariant 在 `test/regression.test.ts` 里——**全仓搜索确认这条测试不存在**（`[required · once]` 只出现在 workflow.md 自身与 `update.integration.test.ts:852,1549` 的字面 fixture）。workflow.md 的旧契约注释也引用了它，本片已删；契约文档待订正。
- **21 个既有失败与本片无关**，已用 `git stash` 建立基线确认：`.trellis/scripts` 与模板逐字节比对 2 条、`add_session.py` branch context 5 条、`env-file-dedup` 4 条、`session-start.py py_compile` 3 条、其他 7 条。本片改动的净新增失败为 **0**。
- §7 的问题 11（`spec_lint.py` 进第一版）与问题 12（刷新本仓库 `.trellis/workflow.md`）仍未决，但已确认**本片不需要**：模板改动不进入本仓库自己的 `.trellis/`，所以自举风险在本片不存在。

---

## 9. 第 2、3 片执行记录

### 9.1 第 2 片：模板文本

| 面 | 改动 | 实测 |
|---|---|---|
| `templates/trellis/config.yaml` | `channel:` 整块注释；`spec_injection:` 打开并把 `max_spec_chars` 9400 → 3000、`max_total_chars` 9500 → 4000，附注说明"收成 `[Edit, Write]` 是后续步骤" | 只对新建项目生效（config.yaml 由 init 写入，update 不管） |
| `shared-hooks/session-start.py` | `<first-reply-notice>` 改为**有 update hint 才发**：无 hint 返回空串；有 hint 只发一行 | 每会话省 779 B（无 hint 时归零） |
| `codex/hooks/session-start.py` | 该 hook 没有 hint 机制，通知整段删除（常量 + 写入点） | 同样的 779 B |
| `opencode/lib/session-utils.js`、`opencode/plugins/session-start.js`、`pi/extensions/trellis/index.ts.txt` | 同上删除；opencode 里那条用于剥离该块的死正则与 helper 一并移除 | — |
| `common/skills/brainstorm.md`（195 → 205 行） | §3.3.1 全部：五类提问按序、偏差信号表、先告知再问、一次一个决策点；删 `Non-Negotiable` 与"至少一轮往返"；删 `## PRD Convergence Pass`；删 jsonl 门禁与轻量/复杂二分；补语言规则与 design/implement 短模板 | 技能保持英文 |
| `common/skills/check.md`（106 → 76） | §3.3.2 重写：对照验收标准给证据；删"逐包读 index 的 Quality Check"、`Test Coverage` 三项、`Spec Sync` 复选框、`Cross-Layer Dimensions` 四节（改为指向 `guides/thinking-triggers.md`）；保留 scope discipline 五项 | — |
| `common/skills/update-spec.md`（351 → 81） | §3.3.3 delta 语义：三种写入条件、四问门禁、add/modify/remove 且必须点名被替代的旧条目、200 行/12 KB 预算、4 个短模板、5 项 checklist（2 项是减法）；删 `Code-Spec First Rule`、`Mandatory Triggers`、7 段模板、旧 checklist、`Core Philosophy` | ≤120 行目标达成 |
| `common/skills/before-dev.md`（46 → 41） | 第 4 步不再引用不存在的 `Pre-Development Checklist`；第 6 步并入第 5 步并按需触发；删末行 `mandatory` | — |
| `common/commands/{continue,start,finish-work}.md` | 删轻量/复杂二分与每轮征求同意；`start` 的"无任务"分支改为档 A 默认；`finish-work` 写明"调用即同意归档" | — |
| 21 平台的 `trellis-check` / `trellis-implement` 定义（33 个文件） | 规则一：机械问题就地修、判断问题上报 + reviewer 约束；规则二：改为"跑与改动相关的检查" | 方案原以为"三平台各一份"，实际 21 平台 × 3 角色 |
| `shared-hooks/inject-subagent-context.py`、`opencode/plugins/inject-subagent-context.js` | check prompt 的 "Fix issues yourself" / "lint and typecheck" / "complete checklist" 三处措辞 | 方案 §3.3.11 只点了 implement 模板，check 侧漏了 |
| `trellis-spec-bootstrap`、`trellis-meta`、`trellis-session-insight` | bootstrap 加"文件越少越好 / 算法仓库只要 conventions + verification / 写入前四问"；meta 的 index 断言与 1.3 名称、路由表命名订正；session-insight 修 3 处漂移（假的 `--mem task` 旗标、OpenCode "stub"、缺 dsh） | — |
| `templates/markdown/`（22 文件 2264 行 → 20 文件 756 行） | 正文改中文；删三处 "must be written in English"；index 加"何时读"列、删 How-to-Fill；guides 合并为 33 行 `thinking-triggers.md`；删 633 行 cross-platform 指南 | −1508 行 |
| `commands/init.ts` + `configurators/workflow.ts` | bootstrap 描述改中文；`unknown` 不再映射为 `fullstack`，单仓与 monorepo 两条路径都改为只种 backend | `configurators/workflow.ts` 是导出改名与第二条 unknown 映射的必然连带 |

另：删除了三份已删除 guides 的遗留引用（`break-loop.md` 与其 copilot 镜像、`check-cross-layer.prompt.md`、`trellis-meta/add-project-local-conventions.md`），并把 `trellis-meta/local-architecture/workflow.md` 里"默认派发子代理"改成"主会话默认"。

### 9.2 第 3 片：spec-review

- 新增 `templates/trellis/scripts/spec_lint.py`（359 行，只算事实：清单/超预算/陈旧/死引用/重复段落/叙事信号/索引一致性；支持 `--json`、`--root`、`--stale-months`、`--max-lines`、`--max-bytes`），已注册进 `templates/trellis/index.ts` 的 `getAllScripts()`，并同步到 `.trellis/scripts/`（有一条逐字节一致性测试）
- 新增 `common/commands/spec-review.md`（§4 全流程：四问判据、八个诊断标签归四个动作、Step 0–5、pinned / 40% 删除上限 / ASK / REVIEW-LOG 保护）
- `configurators/shared.ts` 补 `COMMAND_DESCRIPTIONS` 与 `SKILL_DESCRIPTIONS` 条目

**实测（`spec_lint.py --root .`）**：42 文件 / **19,594 行** / 1.03 MB，其中 **30 个文件超预算**；`platform-integration.md` 2,370 行 / 197,630 B，`script-conventions.md` 2,860 行 / 132,069 B。

> 数字更正：§5.1 与我先前报的"14,738 行"来自 PowerShell 计数，不准。真实是 19,594 行——方案原文 §1 的"净增 19,663 行"才是对的。

### 9.3 新增的推翻登记（并入 §6.1）

| 被推翻的决定 | 证据 | 为何推翻 |
|---|---|---|
| 规划收尾必须做一次"无损 PRD 重写" | `regression.test.ts` `[#320]`（已改为 `[#320-reversed]`） | 机械步骤，产出与输入几乎相同；收敛门与最终批准门保留 |
| SessionStart 必须发 `<first-reply-notice>` 并致谢 | `regression.test.ts`（helper + 5077/5097 + 6187-6218）、`opencode.test.ts`、`pi.test.ts` | 纯仪式；该块只是 update hint 的投递通道，无 hint 就不该发 |
| `continue.md` / `start.md` 必须做轻量/复杂二分 | 两个命令文件与 copilot 镜像 | 单一任务形态 |
| `unknown` 项目类型映射为 `fullstack` | `init.integration.test.ts` #10 / #16 | 会同时种 backend + frontend 两套，且多数仓库并非全栈 |

### 9.4 偏差与撤回

1. **`spec-review` 只做命令，不做技能**（原方案 §4.1 要技能 + 命令各一份）。原因：`resolveAllAsSkillsNeutral` 把命令也渲染成技能且不去重，同名会在 codex 上重复出一条；仓库既有约定是"一个名字只占一个通道"（`start`/`continue`/`finish-work` 是命令，`check`/`update-spec` 等是技能）。方法整体并入命令文件。注意：命令仍需 `SKILL_DESCRIPTIONS` 条目，否则 codex 的渲染路径会抛错。
2. **载荷双发不动**：`session-start.py` 早有 ZCode 排除（注释写明 ZCode 两个键都读会重复），顶层键是给 Cursor 的。§3.2 这条属过时项。
3. **jsonl 去种子化不做**：`task.py start` 的门禁注释写明"absent manifest is not gated"，去种子化属方案 §5.0 的"可选小段代码（第一版可全跳过）"。
4. **步骤不重编号**：`workflow.md` 自己写着 "Numbering kept stable to avoid breaking external references"，仓库有先例。
5. **`generic` 项目类型仍延后**，但第一版兜底已落地（unknown → 只种 backend）。

### 9.5 遗留

- `transcriptHasAssistantMessage`（`opencode/lib/context-visibility.js:121`）在本次改动后全仓无引用，但它是导出函数，删除属独立清理，未动。
- 4 条 `[worktree-identity]` 测试在全套并行跑时偶发失败，单独跑 9/9 通过——并行 git 操作的测试环境问题，与本改动无关。
- 契约文档与 `trellis-meta` 里仍有个别"默认派发子代理"的历史表述，已在 9.1 修掉主要的两处。
