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
  createdAt: string
  lastActivityAt: string
  messageCount: number
  cliSessionId?: string
  description?: string
  hasUnread?: boolean  // 是否有未读消息
}

export interface CreateSessionParams {
  projectPath: string
  title?: string
  sessionType?: SessionType  // 新增：会话类型
}

export interface UpdateSessionParams {
  id: string
  title?: string
  color?: string
  isFavorite?: boolean
}
