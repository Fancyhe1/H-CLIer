# H CLIer

<div align="center">

**Windows 上 Claude Code CLI 的图形化管理工具**

让 AI 编程助手从终端进入 IDE 级体验

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust)](https://www.rust-lang.org)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D6?logo=windows)](https://www.microsoft.com/windows)

[![GitHub release](https://img.shields.io/github/v/release/Fancyhe1/H-CLIer)](https://github.com/Fancyhe1/H-CLIer/releases)
[![GitHub stars](https://img.shields.io/github/stars/Fancyhe1/H-CLIer)](https://github.com/Fancyhe1/H-CLIer/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/Fancyhe1/H-CLIer)](https://github.com/Fancyhe1/H-CLIer/issues)

</div>

---

## 🎯 这是什么？

**H CLIer** 是一款专为 Windows 用户设计的 Claude Code CLI 图形化管理工具。

如果你在 Windows 上使用 Claude Code CLI，是否遇到这些问题：
- ❌ 终端体验差，多项目管理混乱
- ❌ Token 用量难以追踪
- ❌ 会话历史容易丢失
- ❌ 缺乏项目快照功能

**H CLIer 就是为了解决这些问题而生的。**

---

## ✨ 核心功能

<div align="center">

![主界面](docs/screenshots/main.png)

</div>

### 🪟 Windows 原生支持
- 为 Windows 优化的 PTY 终端
- 原生安装包，一键安装
- 支持 Windows 10/11

### 📁 多会话管理
- SQLite 持久化存储
- 工作区分组 + 拖拽排序
- 收藏标记、颜色标签
- 命令面板（`Ctrl+K`）快速切换

### 💻 终端仿真
- 原生 PTY 实例，每会话独立终端
- 终端历史回放
- 智能剪贴板

### 📊 Token 用量追踪
- 按模型（Opus/Sonnet/Haiku）分别计费
- 实时显示日/周/月消耗
- 7 天趋势图 + 6 个月热力图

### 📸 项目检查点
- 快照整个项目目录
- 文件级 Diff 对比
- 一键回滚

### 💬 聊天记录查看
- JSONL 格式解析
- Markdown 渲染
- 搜索过滤

---

## 🚀 快速开始

### 方式一：下载安装包（推荐）

1. 前往 [GitHub Releases](https://github.com/Fancyhe1/H-CLIer/releases)
2. 下载 `H-CLIer_0.3.2_x64-setup.exe`
3. 运行安装程序
4. 启动 H CLIer

### 方式二：从源码构建

```bash
# 克隆仓库
git clone https://github.com/Fancyhe1/H-CLIer.git
cd H-CLIer/aicoder

# 安装依赖
npm install

# 启动开发模式
npm run tauri:dev

# 构建生产版本
npm run tauri:build
```

---

## 📸 功能展示

<div align="center">

### 多会话管理
![会话管理](docs/screenshots/sidebar.png)

### Token 统计
![Token 统计](docs/screenshots/token-stats.png)

### 检查点管理
![检查点](docs/screenshots/checkpoint.png)

### 聊天记录
![聊天记录](docs/screenshots/chat-history.png)

</div>

---

## 🛠️ 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| **前端** | React 19 + TypeScript + Vite | UI 开发 |
| **UI 库** | Ant Design 6 | 组件库 |
| **状态管理** | Zustand 5 | 轻量级状态 |
| **终端** | xterm.js + portable-pty | 终端仿真 |
| **桌面框架** | Tauri 2 + Rust | 跨平台桌面 |
| **数据库** | SQLite | 本地持久化 |

---

## 📖 文档

- [完整文档](README.full.md) - 详细技术文档
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
3. 提交更改（`git commit -m 'feat: Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 创建 Pull Request

详见 [贡献指南](CONTRIBUTING.md)。

---

## 📊 项目状态

- **版本**：0.3.2
- **平台**：Windows 10/11
- **许可证**：MIT

---

## 🔗 相关链接

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Tauri 官网](https://tauri.app)
- [问题反馈](https://github.com/Fancyhe1/H-CLIer/issues)

---

## ⭐ Star History

如果觉得有用，请给个 Star 支持一下！

[![Star History Chart](https://api.star-history.com/svg?repos=Fancyhe1/H-CLIer&type=Date)](https://star-history.com/#Fancyhe1/H-CLIer&Date)

---

<div align="center">

**Made with ❤️ by [Fancyhe1](https://github.com/Fancyhe1)**

</div>
