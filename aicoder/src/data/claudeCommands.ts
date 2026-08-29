/**
 * Claude Code 内置指令完整列表
 * 数据来源：https://code.claude.com/docs/en/commands
 */

export interface ClaudeCommand {
  command: string
  description: string
  args?: string
}

export interface CommandCategory {
  name: string
  icon: string
  commands: ClaudeCommand[]
}

export const claudeCommandCategories: CommandCategory[] = [
  {
    name: '会话管理',
    icon: '💬',
    commands: [
      { command: '/clear', description: '清空对话上下文，开始新会话', args: '[name]' },
      { command: '/compact', description: '压缩对话历史以节省上下文窗口', args: '[instructions]' },
      { command: '/resume', description: '恢复之前的对话会话', args: '[session]' },
      { command: '/branch', description: '在当前节点创建对话分支，尝试不同方向', args: '[name]' },
      { command: '/fork', description: '派生后台子代理继续当前对话', args: '' },
      { command: '/rewind', description: '回退对话和/或代码到之前的状态', args: '' },
      { command: '/rename', description: '重命名当前会话', args: '[name]' },
      { command: '/export', description: '导出当前对话为纯文本文件', args: '[filename]' },
      { command: '/recap', description: '生成当前会话的一行摘要', args: '' },
      { command: '/exit', description: '退出 CLI（后台会话中则分离）', args: '' },
    ]
  },
  {
    name: '模型与配置',
    icon: '⚙️',
    commands: [
      { command: '/model', description: '切换 AI 模型并保存为默认', args: '[model]' },
      { command: '/effort', description: '设置模型推理努力级别', args: '[level|auto]' },
      { command: '/fast', description: '切换快速模式（使用更快的模型输出）', args: '[on|off]' },
      { command: '/config', description: '打开设置界面调整主题、模型等偏好', args: '[key=value ...]' },
      { command: '/theme', description: '更改颜色主题', args: '' },
      { command: '/advisor', description: '启用或禁用顾问工具（咨询第二个模型）', args: '[model|off]' },
      { command: '/color', description: '设置当前会话的提示栏颜色', args: '[color|default]' },
      { command: '/tui', description: '设置终端 UI 渲染器并重新启动', args: '[default|fullscreen]' },
      { command: '/scroll-speed', description: '交互式调整鼠标滚轮滚动速度', args: '' },
    ]
  },
  {
    name: '代码审查与质量',
    icon: '🔍',
    commands: [
      { command: '/code-review', description: '审查当前 diff 的正确性和代码质量', args: '[level] [--fix] [target]' },
      { command: '/simplify', description: '审查变更代码的简化机会并应用修复', args: '[target]' },
      { command: '/review', description: '在当前会话中审查 Pull Request', args: '[PR]' },
      { command: '/security-review', description: '分析待提交变更的安全漏洞', args: '' },
      { command: '/diff', description: '打开交互式 diff 查看器显示未提交的变更', args: '' },
      { command: '/ultrareview', description: '在云端沙箱中运行深度多代理代码审查', args: '[PR]' },
    ]
  },
  {
    name: '上下文与记忆',
    icon: '🧠',
    commands: [
      { command: '/context', description: '以彩色网格可视化当前上下文使用情况', args: '[all]' },
      { command: '/memory', description: '编辑 CLAUDE.md 记忆文件', args: '' },
      { command: '/init', description: '用 CLAUDE.md 指南初始化项目', args: '' },
      { command: '/btw', description: '快速提问而不增加对话历史', args: '' },
      { command: '/goal', description: '设置目标条件，Claude 持续工作直到满足', args: '[condition|clear]' },
    ]
  },
  {
    name: '代理与任务',
    icon: '🤖',
    commands: [
      { command: '/agents', description: '管理代理配置', args: '' },
      { command: '/tasks', description: '查看和管理后台运行的所有任务', args: '' },
      { command: '/background', description: '将当前会话分离为后台代理运行', args: '[prompt]' },
      { command: '/batch', description: '将大规模变更分解为独立单元并行执行', args: '' },
      { command: '/plan', description: '直接进入计划模式', args: '[description]' },
      { command: '/loop', description: '在会话打开期间重复运行提示', args: '[interval] [prompt]' },
      { command: '/schedule', description: '创建、更新、列出或运行定时例程', args: '[description]' },
      { command: '/workflows', description: '打开工作流进度视图', args: '' },
      { command: '/stop', description: '停止当前后台会话', args: '' },
      { command: '/teleport', description: '将 Web 会话拉取到当前终端', args: '' },
    ]
  },
  {
    name: '工具与集成',
    icon: '🔧',
    commands: [
      { command: '/mcp', description: '管理 MCP 服务器连接和 OAuth 认证', args: '[reconnect|enable|disable]' },
      { command: '/permissions', description: '管理工具权限的允许、询问和拒绝规则', args: '' },
      { command: '/hooks', description: '查看工具事件的钩子配置', args: '' },
      { command: '/ide', description: '管理 IDE 集成并显示状态', args: '' },
      { command: '/chrome', description: '配置 Chrome 集成设置', args: '' },
      { command: '/plugin', description: '管理 Claude Code 插件', args: '[subcommand]' },
      { command: '/reload-plugins', description: '重新加载所有活跃插件', args: '[--force]' },
      { command: '/reload-skills', description: '重新扫描技能和命令目录', args: '' },
      { command: '/skills', description: '列出可用技能', args: '' },
      { command: '/add-dir', description: '为当前会话添加工作目录以访问文件', args: '' },
      { command: '/cd', description: '将会话移动到新的工作目录', args: '' },
    ]
  },
  {
    name: '账户与认证',
    icon: '🔑',
    commands: [
      { command: '/login', description: '登录 Anthropic 账户', args: '' },
      { command: '/logout', description: '退出登录', args: '' },
      { command: '/status', description: '打开设置界面显示版本、模型、账户信息', args: '' },
      { command: '/usage', description: '显示会话费用、套餐用量限制和活动统计', args: '' },
      { command: '/usage-credits', description: '配置用量额度以在达到限制时继续工作', args: '' },
      { command: '/upgrade', description: '打开升级页面切换到更高的套餐层级', args: '' },
      { command: '/passes', description: '与朋友分享 Claude Code 免费周', args: '' },
      { command: '/privacy-settings', description: '查看和更新隐私设置', args: '' },
    ]
  },
  {
    name: '开发辅助',
    icon: '💻',
    commands: [
      { command: '/doctor', description: '诊断和验证 Claude Code 安装和设置', args: '' },
      { command: '/debug', description: '启用调试日志并排查问题', args: '[description]' },
      { command: '/feedback', description: '提交反馈、报告 Bug 或分享对话', args: '[report]' },
      { command: '/copy', description: '复制最后一个助手回复到剪贴板', args: '[N]' },
      { command: '/terminal-setup', description: '配置终端快捷键绑定', args: '' },
      { command: '/keybindings', description: '打开键盘快捷键配置文件', args: '' },
      { command: '/vim', description: '切换 Vim 编辑模式（已移除，使用 /config）', args: '' },
      { command: '/heapdump', description: '写入 JavaScript 堆快照用于诊断内存问题', args: '' },
      { command: '/sandbox', description: '切换沙箱模式', args: '' },
      { command: '/focus', description: '切换焦点视图，仅显示最后一个提示和响应', args: '' },
    ]
  },
  {
    name: '代码辅助',
    icon: '📝',
    commands: [
      { command: '/claude-api', description: '加载 Claude API 参考材料并辅助迁移', args: '[migrate|managed-agents-onboard]' },
      { command: '/run', description: '启动并驱动项目应用以查看变更效果', args: '' },
      { command: '/verify', description: '通过构建和运行应用确认代码变更正确', args: '' },
      { command: '/fewer-permission-prompts', description: '扫描常见工具调用并添加允许列表减少提示', args: '' },
      { command: '/web-setup', description: '将 GitHub 账户连接到 Claude Code Web', args: '' },
      { command: '/install-github-app', description: '为仓库设置 Claude GitHub Actions 应用', args: '' },
      { command: '/install-slack-app', description: '安装 Claude Slack 应用', args: '' },
      { command: '/voice', description: '切换语音听写功能', args: '[hold|tap|off]' },
    ]
  },
  {
    name: '高级功能',
    icon: '🚀',
    commands: [
      { command: '/autofix-pr', description: '监控 PR 的 CI 失败并自动推送修复', args: '[prompt]' },
      { command: '/ultraplan', description: '在 ultraplan 会话中起草计划并在浏览器中审查', args: '' },
      { command: '/deep-research', description: '展开网络搜索、交叉验证来源并合成引用报告', args: '' },
      { command: '/insights', description: '生成分析 Claude Code 会话的报告', args: '' },
      { command: '/team-onboarding', description: '从使用历史生成团队入门指南', args: '' },
      { command: '/powerup', description: '通过快速交互课程发现 Claude Code 功能', args: '' },
      { command: '/release-notes', description: '在交互式版本选择器中查看更新日志', args: '' },
      { command: '/stickers', description: '订购 Claude Code 贴纸', args: '' },
      { command: '/desktop', description: '在 Claude Code 桌面应用中继续当前会话', args: '' },
      { command: '/mobile', description: '显示二维码下载 Claude 移动应用', args: '' },
      { command: '/radio', description: '在浏览器中打开 Claude FM Lo-Fi 电台', args: '' },
      { command: '/remote-control', description: '使当前会话可从 claude.ai 远程控制', args: '' },
      { command: '/remote-env', description: '选择云端代理的默认环境', args: '' },
      { command: '/statusline', description: '配置 Claude Code 的状态行', args: '' },
      { command: '/run-skill-generator', description: '编写项目技能教 /run 和 /verify 如何构建和启动应用', args: '' },
    ]
  },
]

/** 获取所有指令的扁平列表 */
export function getAllCommands(): (ClaudeCommand & { category: string })[] {
  return claudeCommandCategories.flatMap(cat =>
    cat.commands.map(cmd => ({ ...cmd, category: cat.name }))
  )
}
