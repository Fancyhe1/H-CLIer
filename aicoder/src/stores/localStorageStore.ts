// LocalStorage实现 - 用于纯前端开发模式
import type { Session, CreateSessionParams } from '../types/session'

const STORAGE_KEY = 'hcl-ier_sessions'

class LocalStorageSessionManager {
  private loadFromStorage(): Session[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  private saveToStorage(sessions: Session[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  }

  createSession(params: CreateSessionParams): Session {
    const sessions = this.loadFromStorage()
    const now = new Date().toISOString()
    const sessionType = params.sessionType || 'claude'
    const prefix = sessionType === 'claude' ? 'Claude' : '终端'

    const maxSortOrder = sessions.filter(s => s.isActive).reduce((max, s) => Math.max(max, s.sortOrder || 0), 0)

    const session: Session = {
      id: crypto.randomUUID(),
      projectPath: params.projectPath,
      title: params.title || `${prefix} ${new Date().toLocaleString()}`,
      sessionType: sessionType,
      color: undefined,
      isFavorite: false,
      isActive: true,
      isArchived: false,
      createdAt: now,
      lastActivityAt: now,
      messageCount: 0,
      cliSessionId: undefined,
      description: undefined,
      sortOrder: maxSortOrder + 1,
    }

    sessions.push(session)
    this.saveToStorage(sessions)
    return session
  }

  getAllSessions(): Session[] {
    return this.loadFromStorage()
      .filter(s => s.isActive)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  }

  reorderSessions(sessionIds: string[]): void {
    const sessions = this.loadFromStorage()
    const sessionMap = new Map(sessions.map(s => [s.id, s]))
    sessionIds.forEach((id, index) => {
      const session = sessionMap.get(id)
      if (session) session.sortOrder = index
    })
    this.saveToStorage(sessions)
  }

  updateSession(session: Session): void {
    const sessions = this.loadFromStorage()
    const index = sessions.findIndex(s => s.id === session.id)
    if (index !== -1) {
      sessions[index] = { ...session, lastActivityAt: new Date().toISOString() }
      this.saveToStorage(sessions)
    }
  }

  deleteSession(sessionId: string): void {
    const sessions = this.loadFromStorage()
    const index = sessions.findIndex(s => s.id === sessionId)
    if (index !== -1) {
      sessions[index].isActive = false
      this.saveToStorage(sessions)
    }
  }
}

export const localStorageManager = new LocalStorageSessionManager()
