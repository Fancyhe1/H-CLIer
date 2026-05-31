# H CLIer

**AI 编程助手管理平台** — 为 Claude Code CLI 打造的企业级桌面管理客户端。

> 将 Claude Code 从裸终端带入多标签、可管理、可回滚的 IDE 级体验。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust)](https://www.rust-lang.org)

> ⚠️ **注意**：由于功能尚未开发完善，暂时不开源代码，待功能开发完成后会开源全部代码。

---

## 简介

H CLIer 是一款基于 **Tauri 2.x** 的跨平台桌面应用，为 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 提供图形化管理界面。它让开发者能够高效地管理多个并发 Claude 会话，同时获得终端仿真、Token 用量分析、项目检查点、聊天记录查看等专业级功能。

## 核心功能

### 多会话管理
- 基于 SQLite 的会话持久化存储
- 工作区分组 + 拖拽排序
- 收藏标记、颜色标签、软删除回收站
- 会话克隆与 JSON 格式导入导出
- 命令面板（`Ctrl+K`）快速切换

### 终端仿真
- 基于 `portable-pty` 的原生 PTY 实例，每会话独立终端
- 自动检测并启动 Claude CLI（支持 `--session-id` / `--resume`）
- 终端历史回放（重新打开会话时恢复之前的输出）
- 智能剪贴板（`Ctrl+C` 复制选中 / 发送中断信号）
- 未读消息检测 + 任务栏图标闪烁提醒

### Token 用量追踪
- 增量扫描 Claude 会话 JSONL 文件，按模型（Opus / Sonnet / Haiku）分别计费
- 实时显示日 / 周 / 月 Token 消耗与费用估算
- 7 天趋势图 + 6 个月活跃热力图

### 项目检查点
- 快照整个项目目录（智能跳过 `.git`、`node_modules`、`target` 等）
- 文件级 Diff 对比与一键回滚
- 免费版限 3 个检查点 / 项目，Pro 版无限制

### 聊天记录查看
- 解析 Claude 的 JSONL 会话格式
- 识别 `text` / `thinking` / `tool_use` / `tool_result` 四种内容块
- Markdown 渲染 + 可折叠详情面板 + 搜索过滤

### 其他特性
- 亮色 / 暗色 / 跟随系统主题切换
- 内置 CLAUDE.md 编辑器
- GitHub Releases 自动更新检测
- 机器绑定许可证系统（免费 / Pro 分级）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Ant Design 6 + xterm.js 6 |
| 状态管理 | Zustand 5 |
| 后端 | Rust + Tauri 2 + rusqlite + portable-pty |
| 数据库 | SQLite |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.70
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)（`npm install -g @anthropic-ai/claude-code`）

### 开发

```bash
# 克隆仓库
git clone https://github.com/Fancyhe1/H-CLIer.git
cd H-CLIer

# 安装前端依赖
cd aicoder
npm install

# 启动开发模式（前端 + Tauri 后端）
npm run tauri:dev
```

### 构建

```bash
cd aicoder
npm run tauri:build
```

构建产物位于 `aicoder/src-tauri/target/release/bundle/`。

## 项目结构

```
H-CLIer/
├── aicoder/
│   ├── src/
│   │   ├── components/     # React 组件（Sidebar, MultiTerminal, TokenStatsPanel 等）
│   │   ├── stores/         # Zustand 状态管理
│   │   ├── types/          # TypeScript 类型定义
│   │   ├── hooks/          # 自定义 Hooks
│   │   └── styles/         # CSS 样式
│   └── src-tauri/
│       └── src/
│           ├── lib.rs           # Tauri 入口 & 命令注册
│           ├── session.rs       # 会话管理（SQLite）
│           ├── pty.rs           # PTY 终端管理
│           ├── history.rs       # 聊天记录解析
│           ├── token_usage.rs   # Token 用量追踪
│           ├── checkpoint.rs    # 项目检查点
│           ├── cli.rs           # Claude CLI 检测
│           ├── config.rs        # 配置管理
│           └── license.rs       # 许可证系统
└── README.md
```

## 许可证

MIT License
