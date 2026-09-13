# Workspace Index

> 所有开发者的 AI Agent 工作记录汇总

---

## Overview

本目录记录本项目上所有与 AI Agent 协作的开发者。

### File Structure

```
workspace/
|-- index.md              # 本文件 — 总索引
+-- {developer}/          # 每个开发者一个目录
    |-- index.md          # 个人索引 + session 历史
    |-- tasks/         # task 文件
    |   |-- *.json        # 进行中的 task
    |   +-- archive/      # 已归档 task（按月）
    +-- journal-N.md     # journal 文件（顺序编号：1, 2, 3...）
```

---

## Active Developers

| Developer | Last Active | Sessions | Active File |
|-----------|-------------|----------|-------------|
| (none yet) | - | - | - |

---

## Getting Started

### For New Developers

运行初始化脚本：

```bash
python3 ./.trellis/scripts/init_developer.py <your-name>
```

它会：

1. 创建你的身份文件（已被 gitignore）
2. 创建你的 progress 目录
3. 创建你的个人 index
4. 创建首个 journal 文件

### For Returning Developers

1. 取得你的 developer 名：

   ```bash
   python3 ./.trellis/scripts/get_developer.py
   ```

2. 读取你的个人 index：

   ```bash
   cat .trellis/workspace/$(python3 ./.trellis/scripts/get_developer.py)/index.md
   ```

---

## Guidelines

### Journal File Rules

- 每个 journal 文件**最多 2000 行**
- 到达上限后新建 `journal-{N+1}.md`
- 新建文件后同步更新个人 `index.md`

### Session Record Format

每条 session 记录包含：

- Summary: One-line description
- Branch: Which branch the work was done on
- Main Changes: What was modified
- Git Commits: Commit hashes and messages
- Next Steps: What to do next

---

## Session Template

记录 session 时使用下面的模板：

```markdown
## Session {N}: {Title}

**Date**: YYYY-MM-DD
**Task**: {task-name}
**Branch**: `{branch-name}`

### Summary

{One-line summary}

### Main Changes

- {Change 1}
- {Change 2}

### Git Commits

| Hash | Message |
|------|---------|
| `abc1234` | {commit message} |

### Testing

- [OK] {Test result}

### Status

[OK] **Completed** / # **In Progress** / [P] **Blocked**

### Next Steps

- {Next step 1}
- {Next step 2}
```

---

**语言**：安装到项目里的 spec 正文使用**中文**；文件名、目录名、frontmatter 键、命令、路径与代码标识符保持英文。
