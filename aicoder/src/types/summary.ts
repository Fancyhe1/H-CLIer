// 查看摘要 - 真实数据结构
export interface SessionSummaryData {
  // 基本信息
  title: string
  sessionType: 'claude' | 'terminal'
  projectPath: string
  createdAt: string
  lastActivityAt: string
  // 对话统计
  userMessageCount: number
  assistantMessageCount: number
  totalMessageCount: number
  toolCallCount: number
  thinkingBlockCount: number
  durationMinutes: number
  // Token消耗
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalCost: number
  model: string
  // 工具使用TOP5
  topTools: { name: string; count: number }[]
}

// AI记忆摘要 - 结构化提取结果
export interface AIMemorySummary {
  // 会话概述
  overview: string
  // 文件操作
  filesEdited: string[]   // 被编辑/创建的文件
  filesRead: string[]     // 被读取的文件
  // 命令执行
  commandsRun: string[]   // 执行过的Bash命令（去重）
  // 讨论要点
  userTopics: string[]    // 用户提出的主要问题/话题
  // 错误与解决
  errorsEncountered: string[]  // 遇到的错误信息
  // 工具使用统计
  toolSummary: { tool: string; count: number; description: string }[]
}
