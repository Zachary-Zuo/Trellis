# trellis mem 参数摘要

`trellis mem` 是本机全局的只读会话检索 CLI，读取各 agent 自己的本地会话存储，不依赖项目内任何目录。这里只是常用项摘要；版本不同时以 `trellis mem help` 的实际输出为准，不要假定某个平台或参数一定存在。

| 子命令 | 用途 |
| --- | --- |
| `projects` | 列出本机有会话记录的项目 cwd 与会话数，用它确认该传哪个 `--cwd` |
| `list` | 按条件列出会话 |
| `search <keyword>` | 定位内容匹配关键词的会话，给出命中片段与得分 |
| `context <session-id>` | 返回关键词命中的轮次及周边上下文，受字符预算限制 |
| `extract <session-id>` | 导出清理后的整段对话，可用关键词缩小范围 |

| 参数 | 适用命令 | 含义 |
| --- | --- | --- |
| `--platform <name>\|all` | 全部 | 过滤会话来源，默认 `all`；可用名见 help |
| `--cwd <path>` | list / search | 使用明确的项目路径，默认当前 cwd |
| `--global` | list / search | 搜索本机所有项目，用户要求跨项目时使用 |
| `--since YYYY-MM-DD`、`--until YYYY-MM-DD` | list / search | 日期范围，含端点 |
| `--limit N` | list / search | 输出条数 |
| `--grep <keywords>` | context / extract | 关键词筛选，空格分隔的词按 AND 匹配 |
| `--turns N`、`--around N` | context | 命中轮次数与每个命中的周边轮次数 |
| `--max-chars N` | context | 总字符预算 |
| `--include-children` | search / context | 把子代理会话合入父会话，视平台支持 |
| `--json` | 全部 | 机器可读输出 |

## 常用组合

找最近一次关于某主题的讨论：

```text
trellis mem search "<主题关键词>" --since <YYYY-MM-DD> --limit 10
trellis mem context <session-id> --grep "<关键词>" --turns 3 --around 2 --max-chars 6000
```

cwd 不匹配，例如远程机或 Windows 路径：

```text
trellis mem projects
trellis mem search "<关键词>" --cwd <projects 列出的实际路径>
```

只看某个 agent 的会话：

```text
trellis mem search "<关键词>" --platform codex
```

## 注意

- search 默认只在当前 cwd 的会话里找。换机器、换路径后先跑 `projects`。
- 得分高、日期新的会话优先。
- 不使用 `--phase`：它依赖旧版 Trellis 任务目录。
- 会话存储被清理后无法恢复缺失内容。记录里的技术推断与运行结果只代表当时快照，需要当前证据复核。
