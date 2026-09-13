# spec 审查提案：`.trellis/spec/cli/backend/commands-update.md`

> 方法：`packages/cli/src/templates/common/commands/spec-review.md`（Step 0-3）＋ `drafts/workflow-lite-plan.md` §4.2 / §4.4。
> 本文是 **Step 3 的提案**，未获批准前不修改任何 spec 文件（Step 4 未执行）。
> 审查日期：2026-09-13。目标文件：411 行 / 35,457 B。

---

## 0. Step 0 机械事实（`spec_lint.py` 原样摘录）

命令：`python ./.trellis/scripts/spec_lint.py --root . --json`（generated `2026-09-13T16:11:02+00:00`，退出码 0）。

**清单行（inventory）**

| 字段 | 值 |
|---|---|
| path | `.trellis/spec/cli/backend/commands-update.md` |
| lines | 411 |
| bytes | 35457 |
| modified | 2026-09-13 |
| has_paths | true |
| over_lines | true |
| over_bytes | true |
| stale | false |
| inbound_refs | 2 |
| referenced_by_index | true |

阈值：`max_lines 200 / max_bytes 12288 / stale_months 3`。全树：`{"files": 42, "lines": 19594, "bytes": 1030971}`。

**归到本文件的其它事实**

- `over_budget`：1 行（就是上面那行，`over_lines` 与 `over_bytes` 同时为真）。
- `dead_references.paths`：8 条 —— `utils/template-hash.ts`、`test/commands/update-internals.test.ts`、`migrations/index.ts`、`cli/index.ts`、`trellis-continue/SKILL.md`、`test/commands/update.integration.test.ts`、`trellis-finish-work/SKILL.md`、`commands/update.ts`。
- `dead_references.flags`：0 条。
- `dead_references.identifiers`：0 条。
- `duplicate_paragraphs`：0 条涉及本文件（全树 12 组重复段落全部落在 `quality-guidelines.md` 内）。
- `narrative_signals`：9 条（`issue` ×4、`version` ×2、`version+story` ×1、`story` ×1，另 1 条 `issue`）。
- `index_inconsistencies`：0 条（全树为空）。本文件被 index 正常引用：`.trellis/spec/cli/backend/index.md:31`、`:60`。

**脚本的三处问题（pilot 结果，见 §8）**：8 条“死引用”经逐个核对 **全部存在**，全是误报（§8.1）；`#22` 这类测试用例号被算成 issue 号（§8.2）；本文件真正失效的符号引用它一条都没报（§8.3）。

---

## 1. Step 2 对照代码的核验

核验对象：KEEP / TIGHTEN 里断言了代码事实的条目。方法：读 `packages/cli/src/`、grep 符号、读 `packages/cli/test/`。

### 1.1 VERIFIED（节选，均有锚点）

| 断言（spec 行） | 依据 |
|---|---|
| `--dry-run` 在 `Proceed?` 之前返回 | `packages/cli/src/commands/update.ts:2536-2539`（`Proceed?` 在 `:2543-2557`） |
| `--force` 兼作非交互、跳过全局 confirm | `update.ts:2543` |
| `--skip-all` 也跳过最终 confirm | `update.ts:2543`（与 spec:136 一致） |
| `--force` 在迁移里等价 `rename`／不留 inline `.backup` | `update.ts:1963-1965`；`.backup` 只在 `action === "backup-rename"` 时写（`update.ts:1990`） |
| 三者按优先级在 `promptConflictResolution` 里判定 | `update.ts:1184-1192` |
| `--allow-downgrade` 不带则提前返回并打印 help | `update.ts:2146-2161` |
| `--tag` 不存在于 `trellis update` | `packages/cli/src/cli/index.ts:157-165` 六个 option，无 `--tag` |
| `BACKUP_DIRS = ALL_MANAGED_DIRS`、`BACKUP_FILES = [AGENTS.md]` | `update.ts:1261`、`:1264` |
| 备份排除项（旧备份、`node_modules`、`workspace/`、`tasks/`、`spec/`、`backlog/`、`agent-traces/`、`/worktrees/`、`/worktree/`） | `update.ts:1269-1286` |
| `collectAllFiles` 位于 `commands/update.ts` | `update.ts:1393` |
| `dirHasManifestEntries(item.from, hashes)` 签名 | `update.ts:1550-1553` |
| `skip` 桶在 `--force` 下也不执行 | `update.ts:1858-1972` 只迭代 `auto` 与 `confirm` |
| 幂等三要素里“占位符两处都解析”与“init/update 文件集一致” | `update.ts:903`、`configurators/shared.ts` 的 `replacePythonCommandLiterals`（`update.ts:61` 导入） |
| `saveHashes` 走 `writeFileAtomic` | `packages/cli/src/utils/template-hash.ts:22, 111-117` |
| `isTemplateModified(cwd, path, hashes)` | `template-hash.ts:187` |
| `renameTracesToJournal(workspaceDir)` 为一次性 0.2.0 迁移、目标已存在则跳过并回报 | `update.ts:2058-2093`；`workspace/` 被排除出备份（`update.ts:1272`） |
| `configSectionsAdded` 仅在 `cliVsProject > 0 && projectVersion !== "unknown"` 时执行 | `update.ts:2696` |
| 迁移任务目录 `<MM-DD>-migrate-to-<cliVersion>`、`emptyTaskJson`、目录已存在则跳过 | `update.ts:2785-2793`、`:2818` |
| `.developer` 严格正则 `/^\s*name\s*=\s*(.+?)\s*$/m` | `update.ts:2809` |
| `getLatestNpmVersion` 只查 `latest` dist-tag、仅作提示 | `update.ts:1378`、`:2117-2139` |
| `setupProxy` 在 `update()` 内调用，来自 `utils/proxy.ts` | `update.ts:36, 2112` |
| `PROTECTED_PATHS` / `isProtectedPath` 存在 | `update.ts:126`、`:306` |
| `workflowMdTemplate` 走整文件模板路径 | `update.ts:903` |
| 引用的测试用例名（`#1/#2/#22/#23/#24/#26/#27`）都真实存在 | `packages/cli/test/commands/update.integration.test.ts:202, 474, 1382, 1395, 1409, 1480, 1505` |

### 1.2 CONTRADICTED → STALE（5 条，全部带 `file:line`）

| # | spec 位置 | 断言 | 代码事实 |
|---|---|---|---|
| **S1** | `commands-update.md:235` | 哈希刷新的文件集为 “…plus any `missingAgentsMdHash` entry from `collectMissingAgentsMdHash`” | `collectMissingAgentsMdHash` 与 `missingAgentsMdHash` 在 `packages/cli/src/**` 与 `packages/cli/test/**` 中**零出现**；真实来源是 `unchangedFileHashRepairs`（`packages/cli/src/commands/update.ts:2715`，赋值点 `update.ts:2442-2447`） |
| **S2** | `commands-update.md:91` | “`commands/update.ts:replaceTrellisManagedBlock`” | 该函数不存在；真名 `replaceManagedBlock`（`packages/cli/src/commands/update.ts:156`，调用点 `:194`） |
| **S3** | `commands-update.md:389-398` | 6 个 helper 是 `commands/update.ts` 的 `@internal` 导出，且“These are unit-tested in `test/commands/update-internals.test.ts`” | `cleanupEmptyDirs` 不是 update.ts 的导出，而是 `utils/managed-paths.ts` 的再导出（`update.ts:82-86`）；`@internal` 实际只有 5 个（`update.ts:486, 563, 605, 1292, 1820`）；`update-internals.test.ts:13-19` 导入的是 `cleanupEmptyDirs, loadUpdateSkipPaths, renameTracesToJournal, shouldExcludeFromBackup, sortMigrationsForExecution`——`extractConfigSection` / `applyConfigSectionsAdded` 不在其中（它们在 `packages/cli/test/regression.test.ts:11195-11290`），而被测的 `renameTracesToJournal`、`dirHasManifestEntries`（`update-internals.test.ts:315, 381`）未被列出 |
| **S4** | `commands-update.md:373` | “numbered cases `#1 .. #27`” | 用例号不是唯一键：`#22` 被用了两次（`update.integration.test.ts:1273` 与 `:1382`）；文件共 44 个 `it()`，编号还带 `b/c/d/e/f` 与 `#workflow-md-r4`（`:1541`） |
| **S5** | `commands-update.md:25` | 幂等不变量：“re-running … prints `✓ Already up to date!` and **writes nothing**” | 该分支确实会写：`update.ts:2445-2447` 在 `unchangedFileHashRepairs.size > 0` 时调用 `updateHashes`，代码注释即 “The ‘already up to date’ exit still has to repair the receipt” |

S1 与 S2 是纯符号漂移；S3 的清单同时多列 1 个、漏列 2 个；S4 是编号事实；S5 是“绝对化措辞”与“带例外的实现”之间的缺口（例外的确是窄的，但 spec 写成了无例外）。

### 1.3 UNVERIFIABLE → ASK

- `commands-update.md:318-320`（Backup bloat）“Power users with 8+ platforms … can accumulate hundreds of MB of backups over a few months”：无测量手段，未复核。
- `commands-update.md:231`（`configSectionsAdded`）“dedupes by `file::sentinel`”：本轮只核了外层条件（`update.ts:2696`），未逐行读 `applyConfigSectionsAdded`（`update.ts:605`）的去重实现。

---

## 2. 逐条处置表

按 H2/H3 切成 32 个条目（`## Update Plan Composition`、`## Flags Semantics`、`## Migration Trigger Semantics`、`## Common Pitfalls` 四个纯容器不计条目）。Q1 先问：本文件绝大多数条目是“读 `update.ts` 一分钟能得到的同信息”，这正是本次试点的预期结论。

| # | 条目（spec 行） | 标签 | 一句理由 | 预计行数变化 |
|---|---|---|---|---|
| 1 | H1 + 导语（7-12） | KEEP | Q3：本文件与 `migrations.md` 的分工是决策，不是代码事实 | −2 |
| 2 | `## Overview`（15-27） | **STALE** | 两条不变量是 KEEP 级契约（Q2），但 S5 让第一条过绝对；输入/输出/副作用清单属 Q1 | −8 |
| 3 | `## Command Entry`（30-60） | TIGHTEN | flag 清单与 `UpdateOptions` 接口可直读代码（Q1）；只留“三者未互斥、按优先级判定”这一条决定 | −23 |
| 4 | `### 1. Collect bundled templates`（65-85） | TIGHTEN | 7 行“来源”表是 `collectTemplateFiles` 的镜像（Q1）；留“占位符必须两处都解析”这一条 Q2 规则 | −15 |
| 5 | `### 2. Whole-file … / AGENTS.md merge`（86-103） | **STALE** | Q3 的“为什么整文件”值得留 2 行；但 S2 的锚点符号写错 | −9 |
| 6 | `### 3. Analyze on-disk state`（104-117） | DERIVABLE | Q1：五个桶与 `analyzeChanges` 一一对应，读代码即得 | −14 |
| 7 | `### --dry-run`（122-125） | TIGHTEN | Q2：“不写盘、不备份、不推版本”值得一行；其余可读 | −1 |
| 8 | `### --force / -f`（126-133） | TIGHTEN | Q3：“force 兼作非交互”是隐性耦合，留；三层含义逐条列属 Q1 | −4 |
| 9 | `### --skip-all / -s`（134-137） | MERGE→#8 | 与 #8 同源，合成“输出策略三兄弟未互斥”一段 | −4 |
| 10 | `### --create-new / -n`（138-141） | DERIVABLE | Q1：语义与提示语直读 `update.ts` | −4 |
| 11 | `### --allow-downgrade`（142-145） | KEEP | Q3：迁移只向前走、降级是 best-effort，属代码推不出的后果 | 0 |
| 12 | `### --migrate`（146-154） | TIGHTEN | Q3：`renameTracesToJournal` 因路径含可变 developer slug 而无法进 manifest，值得留；两步流程属 Q1 | −4 |
| 13 | `### Tag flag (--tag …)`（155-158） | **ASK** | 事实已 VERIFIED（无此 flag），但“为不存在的 flag 写一节”是留还是删，由用户定 | 0（若删 −4） |
| 14 | `### Pending migrations`（163-179） | TIGHTEN | Q3：孤儿识别规则与 `dirHasManifestEntries` 归属门（“用户自己的 `.windsurf/` 不该被搬”）值得留；4 行分类表属 Q1 | −10 |
| 15 | `### The breaking-change gate`（180-206） | TIGHTEN | Q1 最强的一处：`text` 代码块是 `update.ts:2332-2340` 的逐字镜像；只留“为什么必须硬失败”+ 触发条件一行 | −20 |
| 16 | `### breakingBypass for update.skip`（207-212） | KEEP | Q3：理由（honor skip 会让项目永久半迁移）正是代码表达不出的决定 | −1 |
| 17 | `## Apply Phase`（215-240） | **STALE** | 11 步是全文最重的一段代码镜像（Q1）；同时含 S1 的错误符号。留“顺序 + 三条理由”，删步骤流水 | −17 |
| 18 | `## Hashing & Idempotency`（243-262） | TIGHTEN | Q2/Q3：`writeFileAtomic` 的理由（崩在写中途会把 manifest 截成 `{}`）与三条卫生规则留；helper 清单属 Q1 | −10 |
| 19 | `## Boundaries with init`（265-289） | TIGHTEN | Q3：末句“init 不推理任何先前状态”是边界决策，留；共有 producer 表与“unique to update”列表属 Q1 | −18 |
| 20 | `## Boundaries with migrations.md`（292-301） | KEEP | Q3：改哪个文件该落在哪一侧，是路由约定，代码里没有 | −1 |
| 21 | `### Multi-version hop chain`（306-309） | TIGHTEN | Q2：“一次硬失败、迁移列表可能很长，先 `--dry-run`”值得一行；机制属 Q1 | −1 |
| 22 | `### Breaking + recommendMigrate … migrationGuide`（310-313） | NARRATIVE | 规则本身是 Q2 真护栏；`0.5.0-beta.0` → `0.5.0-beta.9` 的版本史属叙事，压成一行 | −1 |
| 23 | `### Orphan migrations`（314-317） | TIGHTEN | Q2：三种成因 + 同一条修法有用；`⚠️` 文案属 Q1 | −1 |
| 24 | `### Backup bloat`（318-321） | TIGHTEN | Q2：“没有自动清理” + “要做就必须 opt-in 且不删上次版本跃迁之后的备份”两条留；“几百 MB”叙事删 | −1 |
| 25 | `### node_modules/ under managed dirs`（322-325） | KEEP | Q2：加了新平台必须验证该排除项仍然命中，否则备份爆炸 | 0 |
| 26 | `### .developer raw-trim foot-gun`（326-336） | TIGHTEN | Q2：真实坑、测试抓不到，“Don't simplify it”保留；4 行文件格式块与复述删 | −6 |
| 27 | `### Idempotency churn after adding a placeholder`（337-340） | KEEP | Q2：症状→根因→修法的完整闭环，已是 2 句 | 0 |
| 28 | `### "Modified by you" on a file the user never touched`（341-347） | KEEP | Q2：两种误报模式各有确定性修法 | −2 |
| 29 | `### --allow-downgrade is a foot-gun`（348-351） | MERGE→#11 | 与 #11 是同一主题的两半 | −4 |
| 30 | `### Codex two-layer upgrade`（352-363） | TIGHTEN | Q2：“非 Codex 平台不得声明那两个 marker 路径”是真护栏；检测机制属 Q1 | −6 |
| 31 | `### Things that look like bugs but aren't`（364-370） | KEEP | Q3：两条“有意为之”的判断，省掉未来每次重新排查 | −1 |
| 32 | `## Test Conventions`（371-411） | **STALE** | “扩展 update 时该写什么测试”的表是 Q2 级护栏，留；但含 S3、S4 两处事实错误，改写后重排 | −21 |

**合计削减：−209 行 / −17.6 KB。**

---

## 3. 四个动作清单

**标签计数（32 条）**：KEEP 8、TIGHTEN 14、MERGE 2、DERIVABLE 2、STALE 4、NARRATIVE 1、PLACEHOLDER 0、ASK 1。四动作：留 8 条（KEEP）、压 16 条（TIGHTEN + MERGE）、删 3 条（DERIVABLE 2 + NARRATIVE 1，另 2 条 MERGE 源整条并入）、问 1 条（ASK）；STALE 4 条按 §3.4 改写，不计入“删”。

### 3.1 留（KEEP，8 条）
#1 H1 导语、#11 `--allow-downgrade`、#16 `breakingBypass`、#20 `Boundaries with migrations.md`、#25 `node_modules`、#27 幂等 churn、#28 “Modified by you”、#31 “Things that look like bugs”。
其中 #1 / #16 / #20 全文保留，#11 / #25 / #27 / #28 / #31 各删 0-2 行填充语。

### 3.2 压（TIGHTEN 14 + MERGE 2 = 16 条）
TIGHTEN：#3、#4、#7、#8、#12、#14、#15、#18、#19、#21、#23、#24、#26、#30。
MERGE（见下）：#9、#29。
两个合并：
- #9（`--skip-all`）→ #8（`--force / -f`），改写为一段“输出策略：force / skip-all / create-new 未互斥，按 `update.ts:1184-1192` 的优先级判定”。
- #29（`--allow-downgrade is a foot-gun`）→ #11（`--allow-downgrade`），合并后 ≤ 5 行。

压缩的通用写法：**一行规则 + 一行违反后果**，去掉步骤流水、代码镜像表、逐字 `if` 块与 shell/TS 片段。改写出的中文条目按 §0.4 用中文；#1/#11/#16/#20 等 KEEP 的英文条目不为翻译而动（Step 4 规则）。

### 3.3 删（DERIVABLE 2 + NARRATIVE 1，以及 2 条 MERGE 源）
整条删除（正文归零，最多留一行指针）：
- #6 `### 3. Analyze on-disk state`（14 行）—— Q1，留一行指向 `update.ts:analyzeChanges`。
- #10 `### --create-new / -n`（4 行）—— Q1。
- #22（NARRATIVE）不整条删：规则留一行，仅删版本史。
- #9、#29 见合并（其行数已计入“压”）。

段删（条目保留、内容删除）：
- #15 的 `text` 代码块（`update.ts:2332-2340` 的镜像）。
- #17 的 11 步流水，只留顺序摘要 + 第 1、7、10 步的三条理由。
- #19 的 6 行 producer 表与 5 行 “What's unique to update” 列表。
- #4 的 7 行“来源”表、#14 的 4 行分类表、#18 的 5 行 helper 清单、#3 的 flag 块与 `UpdateOptions` 接口。
- #2 的 Input/Output/Side effects 三条清单与叙述句。
- #26 的 `text` 文件格式块、#32 的 `ts` fixture 代码块。

### 3.4 改写（STALE 4 条，改写为当前状态而不删除）
| 位置 | 改写为 |
|---|---|
| `:235` | 哈希刷新集合写成：`newFiles`、`autoUpdateFiles`、被覆盖的 `changedFiles`，以及 `update.ts:2715` 从 `unchangedFileHashRepairs` 带进来的收据修复项 |
| `:91` | 锚点改为 `commands/update.ts:replaceManagedBlock`（`update.ts:156`） |
| `:389-398` | helper 清单改为真实的 5 个 `@internal` 导出；测试归属改为：`loadUpdateSkipPaths` / `shouldExcludeFromBackup` / `sortMigrationsForExecution` 在 `update-internals.test.ts`，`extractConfigSection` / `applyConfigSectionsAdded` 在 `regression.test.ts:11195-11290` |
| `:373` | 改成“用例按 `#NN` 编号（注意 `#22` 重号，见 `update.integration.test.ts:1273` 与 `:1382`），另有 `#workflow-md-r4` 与 `[issue-*]` 命名用例”，或直接去掉编号区间的断言 |
| `:25` | 不变量补例外：干净树上无写入；但若收据（`.template-hashes.json`）有待修复项，该分支仍会写（`update.ts:2442-2447`） |

---

## 4. ASK 清单

1. **`### Tag flag (--tag <beta|rc|latest>)`（`:155-158`）** —— 我判断保留（用户会问“为什么没有 `--tag`”，一行负事实省一次排查），但也可能是已移除 flag 的残留、应当删除。请确认。
2. **`### Breaking + recommendMigrate must ship migrationGuide`（`:310-313`）** —— 我判断属 NARRATIVE，删掉 `0.5.0-beta.0` → `0.5.0-beta.9` 的版本史、只留规则与 `create-manifest.js --stdin` 的硬失败；但这段历史可能正是“为什么有这个守卫”的解释，请确认保留到什么程度。
3. **`paths:` 的覆盖范围** —— 本文件现在只声明 `packages/cli/src/commands/update.ts`，而按路径校验它必须打开 `migrations/index.ts`、`configurators/index.ts`、`configurators/shared.ts`、`utils/template-hash.ts`、`cli/index.ts` 才能核。我判断应补前三个；但补得越多，按路径注入越大（与 P4 冲突）。请确认。
4. **~~双预算是否都要满足~~（已决：不设预算，本项撤销）** —— 原提案按“200 行 / 12 KB”给出 ≈202 行 / ≈17.8 KB，并指出字节仍超 45%、要达标需再删 ≈5.5 KB 的 Q2/Q3 级内容。**该预算已从设计与方法中移除**（见 `drafts/workflow-lite-plan.md` §9.6）：按行数/字节裁剪会逼人牺牲正确性，用户已明确不要硬行数控制，重点是功能正确。
   因此：§3 的处置**全部按四问成立**（逐条理由本来就是 Q1/Q2/Q3/Q4，不是为凑数），`#19 Boundaries with init` 与 `#22-#24` 的 Pitfalls **不再为字节预算而删**——删不删只看四问。削减量按内容走，不再承诺 ≈202 行 / ≈17.8 KB 这两个数。

---

## 5. 总量对比

| | 审查前 | 审查后（预计） |
|---|---|---|
| 本文件行数 | 411 | **≈202** |
| 本文件字节 | 35,457 | **≈17,800** |
| spec 文件数 | 42 | 42（本文件不删） |
| 全树行数 | 19,594 | ≈19,385 |
| 全树字节 | 1,030,971 | ≈1,013,363 |

删除量核算：本文件削 209 / 411 = 50.9%；但保护机制的上限是 **“全树行数的 40%”**，209 / 19,594 = **1.07%**，未触发上限，无需拆成两次 review。（该口径在方法里只写了一句“the tree's lines”，单文件试点时会让人误以为 50.9% 已越界 —— 见 §8.4。）

---

## 6. `paths:` 建议

- 本文件：保留 `packages/cli/src/commands/update.ts`；建议增补 `packages/cli/src/migrations/index.ts`、`packages/cli/src/configurators/shared.ts`（见 ASK 3）。
- 本轮只审一个文件，**没有其它文件进入本提案的 `paths:` 建议**。
- 顺带记录（不属本提案，供后续整树 review 用）：Step 0 报 `no_paths` 共 29 / 42 个文件，本文件不在其中。

---

## 7. 保护机制核对

- 本文件不含 `<!-- pinned: ... -->`，无条目受 pin 保护。
- ASK 的 4 项在答复前一律不动（`:155-158` 整条保留原样）。
- 全部删除内容留在 git 历史；Step 4 结束后按方法追加一行到 `.trellis/spec/REVIEW-LOG.md`（该文件当前不存在，需新建）。

---

## 8. 对方法与脚本的反馈（本次试点的直接产出）

### 8.1 `spec_lint.py` 的“死引用”检测在本仓库基本不可用
`spec_lint.py:199` 只做 `(root / ref).exists()`，**从不尝试包相对解析**。本仓库所有 spec 里的路径都相对于 `packages/cli/` 写（如 `commands/update.ts`、`utils/template-hash.ts`），于是全树 238 条死路径引用中 **109 条是误报**（可被 `packages/cli/src/` 等前缀解析成功）；本文件的 8 条 **100% 误报**（逐个确认存在）。后果：Step 5 “确认你targeted 的死引用已消失”永远无法达成。

### 8.2 叙事信号把测试用例号当成 issue 号
`spec_lint.py:69` 的 `issue` 正则是 `(?:^|[\s(])#\d{2,6}\b`，于是 `#1 .. #27`、`#22`、`#26` 全部命中。本文件 9 条叙事信号里 **5 条是这个误报**。真叙事只有 2 条 version（`0.2.0`、`0.5.0-beta.9`）与 1 条 story（`Historical incident`）。

### 8.3 本文件真正的失效引用，脚本一条没报
- `collectMissingAgentsMdHash` / `missingAgentsMdHash`（`:235`）：`IDENT_CALL_RE`（`spec_lint.py:62`）要求反引号后紧跟 `(`，而 spec 写作 `` `collectMissingAgentsMdHash` ``（后随 `)`），因此漏检；`dead_references.identifiers` 对本文件返回 0。
- `replaceTrellisManagedBlock`（`:91`）：本仓库引用代码符号的主力写法是 `` `path/file.ts:symbol` ``。`PATH_REF_RE`（`spec_lint.py:52`）要求反引号紧接扩展名闭合，**这种写法完全不匹配**。本文件共 45 处 `file.ts:symbol` 锚点，脚本一个都没检查。
- 建议：`spec_lint.py` 增 **(a)** 对 `PATH_REF_RE` 命中的 ref 依次尝试 `root/`、`root/packages/*/src/`、`root/packages/*/` 解析；**(b)** 新增 `file.ext:symbol` 锚点提取与存在性检查；**(c)** `IDENT_CALL_RE` 放宽为反引号内任意标识符；**(d)** `issue` 正则排除 `#\d+` 紧邻 `test`/`it(`/`case`/`>` 的场景。

### 8.4 方法本身的歧义 / 缺失 / 错误
1. **删除上限的口径**：`spec-review.md:89` 写“at most 40% of **the tree's** lines”。单文件试点时无法自证是否越界（本文件削 50.9%，全树 1.07%）。建议补一句“单文件不设上限，上限只对整棵树生效”。
2. **Step 0 未给条目清单**：Step 1 要求“按 H2/H3 切成条目”，但 `spec_lint.py` 不输出任何 heading 事实（`spec_lint.py:265-279` 的返回体里没有 headings 字段）。每个文件都要 agent 自己读全文数标题。建议 inventory 行增加 `h2: n, h3: n` 与标题行号列表。
3. **`over_budget` 是单一阈值**：`--max-lines` / `--max-bytes` 只有一个全局档，`docs-site` 类文件（`release-lifecycle.md` 226 行 / 12.8 KB）与 CLI backend 文件同档。当一处行数达标、字节不达标时（本文件正是如此），方法没给取舍规则。见 ASK 4。
4. **Step 2 的判定语言缺一档**：只有 VERIFIED / CONTRADICTED / UNVERIFIABLE。本文件 S5 属于“按字面读是错的、按注明的前提读是对的”（`:25` 的“immediately after a successful run”确实不触发收据修复）。要么允许 STALE 带“窄化例外”这一处置，要么在方法里说明此类算 CONTRADICTED。
5. **`narrative_signals` 没有文件级计数**：JSON 只给逐段行（`spec_lint.py:277`），要 `grep` 数一遍才知道某文件有几条；且每段只截 110 字符，判断“该压成一行还是该删”仍需回原文。
6. **`stale`（3 个月未改）在本仓库恒为 0**：`spec_lint.py:176` 用 mtime，而整棵树在同一次 checkout 里 mtime 相同。这个检查在“刚 clone / 刚 mass-touch”的场景下没有信息量，建议增加“内容里最新版本号 vs 当前 CLI 版本”的替代信号，或明确它只对长期本地工作区有效。
7. **`paths:` 只判有无、不判内容**：`has_paths`（`spec_lint.py:173`）为正即通过，不校验声明路径是否存在、是否覆盖正文反复引用的文件。本文件 `has_paths: true` 但正文还重度依赖 4 个未声明的文件（见 ASK 3）。
8. **Step 3 的产物路径未定义目录创建**：`.trellis/spec/.review/` 在方法里是写作目标（`spec-review.md:63`），但没有一句说明该目录可能不存在、需要新建；`REVIEW-LOG.md` 同理（Step 4 要追加，但当前仓库没有这个文件）。
9. **八标签与四动作的映射有一处松**：`spec-review.md:55` 规定 “DERIVABLE、STALE、NARRATIVE、PLACEHOLDER → delete”，但 Step 4 又说 STALE 可以“rewrite to current state”。本提案按后者处理 S1/S2/S3/S4（改写而非删除），并在 §3.4 单列“改写清单”。建议在方法里把 STALE 明确拆成 STALE-rewrite 与 STALE-delete。
