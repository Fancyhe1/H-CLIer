import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { message } from 'antd'
import type { Session, CreateSessionParams } from '../types/session'

interface SessionState {
  sessions: Session[]
  archivedSessions: Session[]  // 归档会话列表
  activeSessionId: string | null
  closedSessionId: string | null  // 用于通知终端销毁
  runningSessionIds: Set<string>  // 正在运行的会话ID（终端已打开）
  isLoading: boolean
  error: string | null
  workspaceOrder: Record<string, string[]>  // 工作区文件夹顺序

  // Computed
  claudeSessions: () => Session[]
  terminalSessions: () => Session[]
  claudeArchivedSessions: () => Session[]
  terminalArchivedSessions: () => Session[]

  // Actions
  fetchSessions: () => Promise<void>
  fetchArchivedSessions: () => Promise<void>
  createSession: (params: CreateSessionParams) => Promise<Session | null>
  updateSession: (session: Session) => Promise<void>
  touchSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  clearAllSessions: () => Promise<void>
  setActiveSession: (sessionId: string | null) => void
  setClosedSession: (sessionId: string | null) => void  // 设置关闭的会话
  setSessionRunning: (sessionId: string, running: boolean) => void  // 设置会话运行状态
  toggleFavorite: (sessionId: string) => Promise<void>
  setSessionColor: (sessionId: string, color: string) => Promise<void>
  setHasUnread: (sessionId: string, hasUnread: boolean) => Promise<void>  // 设置未读状态
  reorderSessions: (sessionIds: string[]) => Promise<void>
  reorderWorkspaceFolders: (sessionType: string, paths: string[]) => void
  archiveSession: (sessionId: string) => Promise<void>
  unarchiveSession: (sessionId: string) => Promise<void>
  archiveSessionsByPath: (projectPath: string) => Promise<void>
  unarchiveSessionsByPath: (projectPath: string) => Promise<void>
}

// 从 localStorage 加载工作区顺序
function loadWorkspaceOrder(): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const sessionType of ['claude', 'terminal']) {
    const key = `hcl-ier_workspace_order_${sessionType}`
    try {
      const stored = localStorage.getItem(key)
      if (stored) result[sessionType] = JSON.parse(stored)
    } catch { /* ignore */ }
  }
  return result
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  archivedSessions: [],
  activeSessionId: null,
  closedSessionId: null,
  runningSessionIds: new Set<string>(),
  isLoading: false,
  error: null,
  workspaceOrder: loadWorkspaceOrder(),

  // 获取 Claude 会话
  claudeSessions: () => {
    return get().sessions.filter(s => s.sessionType === 'claude')
  },

  // 获取普通终端会话
  terminalSessions: () => {
    return get().sessions.filter(s => s.sessionType === 'terminal')
  },

  // 获取 Claude 归档会话
  claudeArchivedSessions: () => {
    return get().archivedSessions.filter(s => s.sessionType === 'claude')
  },

  // 获取普通终端归档会话
  terminalArchivedSessions: () => {
    return get().archivedSessions.filter(s => s.sessionType === 'terminal')
  },

  fetchSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      const sessions = await invoke<Session[]>('get_sessions')
      set({ sessions, isLoading: false })
    } catch (err) {
      const errStr = String(err)
      set({ error: errStr, isLoading: false })
      message.error('加载会话列表失败')
    }
  },

  fetchArchivedSessions: async () => {
    try {
      const archivedSessions = await invoke<Session[]>('get_archived_sessions')
      set({ archivedSessions })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  createSession: async (params) => {
    set({ isLoading: true, error: null })
    try {
      const session = await invoke<Session>('create_session', {
        projectPath: params.projectPath,
        title: params.title,
        sessionType: params.sessionType || 'claude',
        cliSessionId: params.cliSessionId,
      })
      set((state) => ({
        sessions: [session, ...state.sessions],
        isLoading: false,
        activeSessionId: session.id,
      }))
      return session
    } catch (err) {
      set({ error: String(err), isLoading: false })
      message.error('创建会话失败')
      return null
    }
  },

  updateSession: async (session) => {
    try {
      await invoke('update_session', { session })
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === session.id ? session : s
        ),
      }))
    } catch (err) {
      set({ error: String(err) })
      message.error('更新会话失败')
    }
  },

  touchSession: async (sessionId) => {
    try {
      await invoke('touch_session', { sessionId })
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, lastActivityAt: new Date().toISOString() } : s
        ),
      }))
    } catch (err) {
      // 静默失败，不影响用户体验
      console.error('更新会话活动时间失败:', err)
    }
  },

  deleteSession: async (sessionId) => {
    try {
      await invoke('move_to_trash', { sessionId })
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId,
      }))
    } catch (err) {
      set({ error: String(err) })
      message.error('删除会话失败')
    }
  },

  clearAllSessions: async () => {
    const { sessions } = get()
    set({ isLoading: true })
    try {
      for (const session of sessions) {
        await invoke('move_to_trash', { sessionId: session.id })
      }
      set({ sessions: [], activeSessionId: null, isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
      message.error('清空会话失败')
    }
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
    // 切换到会话时清除未读状态
    if (sessionId) {
      const session = get().sessions.find((s) => s.id === sessionId)
      if (session && session.hasUnread) {
        get().updateSession({ ...session, hasUnread: false })
      }
    }
  },

  setClosedSession: (sessionId) => {
    // 从运行列表中移除
    if (sessionId) {
      const newRunning = new Set(get().runningSessionIds)
      newRunning.delete(sessionId)
      set({ closedSessionId: sessionId, runningSessionIds: newRunning })
    } else {
      set({ closedSessionId: null })
    }
  },

  setSessionRunning: (sessionId, running) => {
    const newRunning = new Set(get().runningSessionIds)
    if (running) {
      newRunning.add(sessionId)
    } else {
      newRunning.delete(sessionId)
    }
    set({ runningSessionIds: newRunning })
  },

  toggleFavorite: async (sessionId) => {
    const session = get().sessions.find((s) => s.id === sessionId)
    if (!session) return

    const updated = { ...session, isFavorite: !session.isFavorite }
    await get().updateSession(updated)
  },

  setSessionColor: async (sessionId, color) => {
    const session = get().sessions.find((s) => s.id === sessionId)
    if (!session) return

    const updated = { ...session, color }
    await get().updateSession(updated)
  },

  setHasUnread: async (sessionId, hasUnread) => {
    const session = get().sessions.find((s) => s.id === sessionId)
    if (!session) return

    const updated = { ...session, hasUnread }
    await get().updateSession(updated)

    // 任务栏图标闪烁提示（使用 Windows 原生 FlashWindowEx API）
    const hasAnyUnread = get().sessions.some((s) => s.hasUnread)
    invoke('flash_taskbar', { flash: hasAnyUnread }).catch(console.error)
  },

  reorderSessions: async (sessionIds: string[]) => {
    try {
      await invoke('reorder_sessions', { sessionIds })
      set((state) => {
        const sortOrderMap = new Map(sessionIds.map((id, index) => [id, index]))
        const updatedSessions = state.sessions.map(s => {
          const newSortOrder = sortOrderMap.get(s.id)
          if (newSortOrder !== undefined) {
            return { ...s, sortOrder: newSortOrder }
          }
          return s
        })
        return { sessions: updatedSessions }
      })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  reorderWorkspaceFolders: (sessionType: string, paths: string[]) => {
    const key = `hcl-ier_workspace_order_${sessionType}`
    localStorage.setItem(key, JSON.stringify(paths))
    set((state) => ({
      workspaceOrder: { ...state.workspaceOrder, [sessionType]: paths }
    }))
  },

  archiveSession: async (sessionId: string) => {
    try {
      await invoke('archive_session', { sessionId })
      set((state) => {
        const session = state.sessions.find(s => s.id === sessionId)
        if (!session) return state
        return {
          sessions: state.sessions.filter(s => s.id !== sessionId),
          archivedSessions: [{ ...session, isArchived: true, archivedAt: new Date().toISOString() }, ...state.archivedSessions],
          activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
        }
      })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  unarchiveSession: async (sessionId: string) => {
    try {
      await invoke('unarchive_session', { sessionId })
      set((state) => {
        const session = state.archivedSessions.find(s => s.id === sessionId)
        if (!session) return state
        return {
          archivedSessions: state.archivedSessions.filter(s => s.id !== sessionId),
          sessions: [{ ...session, isArchived: false, archivedAt: undefined }, ...state.sessions],
        }
      })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  archiveSessionsByPath: async (projectPath: string) => {
    try {
      await invoke('archive_sessions_by_path', { projectPath })
      set((state) => {
        const sessionsToArchive = state.sessions.filter(s => s.projectPath === projectPath)
        const now = new Date().toISOString()
        const archived = sessionsToArchive.map(s => ({ ...s, isArchived: true, archivedAt: now }))
        return {
          sessions: state.sessions.filter(s => s.projectPath !== projectPath),
          archivedSessions: [...archived, ...state.archivedSessions],
          activeSessionId: sessionsToArchive.some(s => s.id === state.activeSessionId) ? null : state.activeSessionId,
        }
      })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  unarchiveSessionsByPath: async (projectPath: string) => {
    try {
      await invoke('unarchive_sessions_by_path', { projectPath })
      set((state) => {
        const sessionsToUnarchive = state.archivedSessions.filter(s => s.projectPath === projectPath)
        const unarchived = sessionsToUnarchive.map(s => ({ ...s, isArchived: false, archivedAt: undefined }))
        return {
          archivedSessions: state.archivedSessions.filter(s => s.projectPath !== projectPath),
          sessions: [...unarchived, ...state.sessions],
        }
      })
    } catch (err) {
      set({ error: String(err) })
    }
  },
}))
