# 贡献指南

> 感谢你对 H CLIer 的关注！本文档介绍如何参与项目开发。

---

## 如何贡献

### 报告 Bug

1. 访问 [GitHub Issues](https://github.com/Fancyhe1/H-CLIer/issues)
2. 点击 "New Issue"
3. 选择 "Bug Report" 模板
4. 填写以下信息：
   - 操作系统版本
   - H CLIer 版本
   - 错误信息或截图
   - 复现步骤

### 提出建议

1. 访问 [GitHub Discussions](https://github.com/Fancyhe1/H-CLIer/discussions)
2. 创建新讨论
3. 描述你的建议和使用场景

### 提交代码

1. Fork 本仓库
2. 创建功能分支
3. 提交代码
4. 创建 Pull Request

---

## 开发环境

### 系统要求

- **Node.js**：>= 18
- **Rust**：>= 1.70
- **Git**：最新版本

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/Fancyhe1/H-CLIer.git
cd H-CLIer

# 安装依赖
cd aicoder
npm install

# 启动开发模式
npm run tauri:dev
```

---

## 代码规范

### 前端（TypeScript）

- **文件名**：PascalCase（组件）或 camelCase（工具）
- **组件**：PascalCase
- **函数**：camelCase
- **常量**：SCREAMING_SNAKE_CASE

### 后端（Rust）

- **模块**：snake_case
- **结构体**：PascalCase
- **函数**：snake_case
- **变量**：snake_case

### 提交信息

使用以下前缀：

- `feat: xxx`：新功能
- `fix: xxx`：修复 bug
- `docs: xxx`：文档更新
- `style: xxx`：代码格式调整
- `refactor: xxx`：重构
- `test: xxx`：测试相关
- `chore: xxx`：构建/工具相关

---

## Pull Request 流程

### 1. 准备

- 确保代码符合规范
- 确保测试通过
- 更新相关文档

### 2. 创建 PR

1. 访问 GitHub 仓库
2. 点击 "New Pull Request"
3. 选择你的分支
4. 填写 PR 描述

### 3. PR 描述模板

```markdown
## 描述

简要描述你的更改

## 更改类型

- [ ] 新功能
- [ ] Bug 修复
- [ ] 文档更新
- [ ] 代码重构
- [ ] 其他

## 测试

描述你如何测试你的更改

## 截图（如果适用）

添加相关截图

## 相关 Issue

关闭 #123
```

### 4. 代码审查

- 所有 PR 都需要经过代码审查
- 审查者会提出改进建议
- 根据反馈修改代码
- 审查通过后合并

---

## 分支管理

### 分支命名

- `feature/xxx`：新功能
- `fix/xxx`：修复 bug
- `docs/xxx`：文档更新
- `refactor/xxx`：重构

### 示例

```bash
# 创建功能分支
git checkout -b feature/add-export

# 创建修复分支
git checkout -b fix/terminal-crash
```

---

## 测试

### 前端测试

```bash
cd aicoder
npm run test
```

### 后端测试

```bash
cd aicoder/src-tauri
cargo test
```

### 手动测试

1. 启动开发模式
2. 测试相关功能
3. 确保无回归问题

---

## 文档

### 更新文档

- 修改代码后，更新相关文档
- 文档位于 `docs/` 目录
- 使用 Markdown 格式

### 文档规范

- 使用中文
- 保持简洁清晰
- 添加示例代码
- 更新目录结构

---

## 行为准则

### 我们的承诺

- 尊重他人
- 保持专业
- 欢迎新人
- 建设性反馈

### 不当行为

- 人身攻击
- 骚扰言论
- 恶意破坏
- 其他不当行为

---

## 常见问题

### Q1：如何运行开发服务器？

```bash
cd aicoder
npm run tauri:dev
```

### Q2：如何构建生产版本？

```bash
cd aicoder
npm run tauri:build
```

### Q3：如何更新依赖？

```bash
# 前端
npm update

# 后端
cd src-tauri
cargo update
```

---

## 联系方式

- **GitHub Issues**：https://github.com/Fancyhe1/H-CLIer/issues
- **GitHub Discussions**：https://github.com/Fancyhe1/H-CLIer/discussions

---

## 相关文档

- [开发指南](docs/开发指南.md)
- [安装指南](docs/安装指南.md)
- [使用教程](docs/使用教程.md)
- [常见问题](docs/常见问题.md)

---

*最后更新：2026-07-12*
