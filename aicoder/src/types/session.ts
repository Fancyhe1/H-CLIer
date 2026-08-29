// 会话类型
export type SessionType = 'claude' | 'terminal'

export interface Session {
  id: string
  projectPath: string
  title: string
  sessionType: SessionType  // 新增：会话类型
  color?: string
  isFavorite: boolean
  isActive: boolean
  isArchived: boolean  // 是否归档
  createdAt: string
  lastActivityAt: string
  archivedAt?: string  // 归档时间
  messageCount: number
  cliSessionId?: string
  description?: string
  hasUnread?: boolean  // 是否有未读消息
  sortOrder: number
}

export interface CreateSessionParams {
  projectPath: string
  title?: string
  sessionType?: SessionType  // 新增：会话类型
  cliSessionId?: string  // 导入时指定的 Claude CLI 会话编号
}

export interface UpdateSessionParams {
  id: string
  title?: string
  color?: string
  isFavorite?: boolean
}
