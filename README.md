# H CLIer

**Windows 上 Claude Code CLI 的图形化管理工具** — 让 AI 编程助手从终端进入 IDE 级体验。

> 专为 Windows 用户设计，将 Claude Code 从裸终端带入多标签、可管理、可回滚的桌面管理体验。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust)](https://www.rust-lang.org)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D6?logo=windows)](https://www.microsoft.com/windows)

---

## 📸 产品预览

<!-- TODO: 添加产品截图 -->
<!-- ![主界面](docs/screenshots/main.png) -->
<!-- ![Token 统计](docs/screenshots/token-stats.png) -->
<!-- ![检查点管理](docs/screenshots/checkpoint.png) -->

```
┌─────────────────────────────────────────────────────────────┐
│  H CLIer - Claude Code 管理工具                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────────────────────────────────────┐ │
│  │ 侧边栏  │  │  终端面板                                │ │
│  │         │  │  > claude --session-id xxx               │ │
│  │ 会话 1  │  │  > 帮我优化这段代码...                    │ │
│  │ 会话 2  │  │  > ✅ 已完成优化                          │ │
│  │ 会话 3  │  │                                          │ │
│  │         │  │  [Token: 1,234 | 费用: $0.05]            │ │
│  └─────────┘  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ 核心功能

### 🪟 Windows 原生支持
- 为 Windows 优化的 PTY 终端，解决 Windows 终端兼容性问题
- 原生 Windows 安装包（NSIS），一键安装
- 支持 Windows 10/11，兼容性经过充分测试

### 📁 多会话管理
- 基于 SQLite 的会话持久化存储
- 工作区分组 + 拖拽排序
- 收藏标记、颜色标签、软删除回收站
- 会话克隆与 JSON 格式导入导出
- 命令面板（`Ctrl+K`）快速切换

### 💻 终端仿真
- 基于 `portable-pty` 的原生 PTY 实例，每会话独立终端
- 自动检测并启动 Claude CLI（支持 `--session-id` / `--resume`）
- 终端历史回放（重新打开会话时恢复之前的输出）
- 智能剪贴板（`Ctrl+C` 复制选中 / 发送中断信号）
- 未读消息检测 + 任务栏图标闪烁提醒

### 📊 Token 用量追踪
- 增量扫描 Claude 会话 JSONL 文件，按模型（Opus / Sonnet / Haiku）分别计费
- 实时显示日 / 周 / 月 Token 消耗与费用估算
- 7 天趋势图 + 6 个月活跃热力图

### 📸 项目检查点
- 快照整个项目目录（智能跳过 `.git`、`node_modules`、`target` 等）
- 文件级 Diff 对比与一键回滚
- 免费版限 3 个检查点 / 项目，Pro 版无限制

### 💬 聊天记录查看
- 解析 Claude 的 JSONL 会话格式
- 识别 `text` / `thinking` / `tool_use` / `tool_result` 四种内容块
- Markdown 渲染 + 可折叠详情面板 + 搜索过滤

### 🎨 其他特性
- 亮色 / 暗色 / 跟随系统主题切换
- 内置 CLAUDE.md 编辑器
- GitHub Releases 自动更新检测
- 机器绑定许可证系统（免费 / Pro 分级）

---

## 🚀 快速开始

### 方式一：下载安装包（推荐）

1. 前往 [GitHub Releases](https://github.com/Fancyhe1/H-CLIer/releases) 下载最新版本
2. 运行 `H-CLIer_0.3.2_x64-setup.exe` 安装
3. 启动 H CLIer，开始使用

### 方式二：从源码构建

#### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.70
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)（`npm install -g @anthropic-ai/claude-code`）

#### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/Fancyhe1/H-CLIer.git
cd H-CLIer

# 安装前端依赖
cd aicoder
npm install

# 启动开发模式（前端 + Tauri 后端）
npm run tauri:dev

# 构建生产版本
npm run tauri:build
```

构建产物位于 `aicoder/src-tauri/target/release/bundle/`。

---

## 🛠️ 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| **前端框架** | React 19 | UI 组件库 |
| **类型系统** | TypeScript 6 | 类型安全 |
| **构建工具** | Vite 5 | 开发服务器与打包 |
| **UI 组件库** | Ant Design 6 | 企业级 UI 组件 |
| **状态管理** | Zustand 5 | 轻量级状态管理 |
| **终端仿真** | xterm.js 6 | 终端渲染 |
| **桌面框架** | Tauri 2 | 跨平台桌面应用 |
| **后端语言** | Rust | 系统级性能 |
| **数据库** | SQLite | 本地持久化 |
| **终端管理** | portable-pty | PTY 终端实例 |

---

## 📁 项目结构

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
├── docs/
│   ├── screenshots/        # 产品截图
│   ├── 安装指南.md         # 安装说明
│   ├── 使用教程.md         # 功能详解
│   ├── 常见问题.md         # FAQ
│   ├── 开发指南.md         # 参与开发
│   └── 宣发计划.md         # 推广计划
├── CHANGELOG.md            # 更新日志
├── CONTRIBUTING.md         # 贡献指南
└── README.md
```

---

## 📖 文档

- [安装指南](docs/安装指南.md) - 详细安装步骤
- [使用教程](docs/使用教程.md) - 功能详解
- [常见问题](docs/常见问题.md) - FAQ
- [开发指南](docs/开发指南.md) - 参与开发
- [更新日志](CHANGELOG.md) - 版本历史

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/AmazingFeature`）
3. 提交更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 创建 Pull Request

详见 [贡献指南](CONTRIBUTING.md)。

---

## 📝 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

## 🔗 相关链接

- [GitHub 仓库](https://github.com/Fancyhe1/H-CLIer)
- [问题反馈](https://github.com/Fancyhe1/H-CLIer/issues)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Tauri 官网](https://tauri.app)

---

## ⭐ Star History

如果觉得有用，请给个 Star 支持一下！

[![Star History Chart](https://api.star-history.com/svg?repos=Fancyhe1/H-CLIer&type=Date)](https://star-history.com/#Fancyhe1/H-CLIer&Date)
