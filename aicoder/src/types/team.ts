/**
 * Team 模式可视化类型定义
 * 对应 Rust 侧 aicoder/src-tauri/src/team.rs
 */

/** 一个团队的完整信息（lead 会话 + teammates） */
export interface TeamInfo {
  /** lead 会话 ID（subagents 父目录的目录名） */
  teamSessionId: string
  /** 项目路径 */
  projectPath: string
  /** 所有 teammates（lead 是主会话，不在此列） */
  agents: AgentInfo[]
  /** 团队创建时间（Unix 秒，字符串形式） */
  createdAt: string
  /** 主会话 JSONL 是否存在 */
  hasLeadSession: boolean
}

/** 单个 teammate 的信息 */
export interface AgentInfo {
  /** agent 唯一 ID（来自文件名 agent-{id}.jsonl） */
  agentId: string
  /** agent 类型（来自 .meta.json，如 "Explore"、"general-purpose"） */
  agentType: string
  /** 任务描述（来自 .meta.json） */
  description: string
  /** 嵌套深度（1 = 直接由 lead 创建） */
  spawnDepth: number
  /** 推断的状态 */
  status: AgentStatus
  /** 该 agent 的 JSONL 文件路径 */
  jsonlPath: string
  /** JSONL 文件当前大小（字节） */
  jsonlSize: number
  /** 文件最后修改时间（Unix 秒） */
  lastModified: number
}

/** Agent 状态 */
export type AgentStatus = 'running' | 'idle' | 'completed' | 'unknown'

/** Agent 输出的分页查询结果 */
export interface AgentOutput {
  /** 解析后的条目 */
  entries: AgentEntry[]
  /** 是否还有更多 */
  hasMore: boolean
  /** 文件总行数 */
  totalLines: number
  /** 本次已读到的行数（offset + 读取行数） */
  linesConsumed: number
}

/** 单条输出记录 */
export interface AgentEntry {
  /** 类型：text / thinking / tool_use / tool_result / user */
  entryType: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'user' | string
  /** ISO 8601 时间戳 */
  timestamp?: string
  /** 内容文本 */
  content: string
  /** 工具名（仅 tool_use） */
  toolName?: string
}
