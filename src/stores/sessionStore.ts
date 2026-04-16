import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Session, CreateSessionParams } from '../types/session'

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  closedSessionId: string | null  // 用于通知终端销毁
  isLoading: boolean
  error: string | null

  // Computed
  claudeSessions: () => Session[]
  terminalSessions: () => Session[]

  // Actions
  fetchSessions: () => Promise<void>
  createSession: (params: CreateSessionParams) => Promise<Session | null>
  updateSession: (session: Session) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  clearAllSessions: () => Promise<void>
  setActiveSession: (sessionId: string | null) => void
  setClosedSession: (sessionId: string | null) => void  // 设置关闭的会话
  toggleFavorite: (sessionId: string) => Promise<void>
  setSessionColor: (sessionId: string, color: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  closedSessionId: null,
  isLoading: false,
  error: null,

  // 获取 Claude 会话
  claudeSessions: () => {
    return get().sessions.filter(s => s.sessionType === 'claude')
  },

  // 获取普通终端会话
  terminalSessions: () => {
    return get().sessions.filter(s => s.sessionType === 'terminal')
  },

  fetchSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      const sessions = await invoke<Session[]>('get_sessions')
      set({ sessions, isLoading: false })
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  createSession: async (params) => {
    set({ isLoading: true, error: null })
    try {
      const session = await invoke<Session>('create_session', {
        projectPath: params.projectPath,
        title: params.title,
        sessionType: params.sessionType || 'claude',
      })
      set((state) => ({
        sessions: [session, ...state.sessions],
        isLoading: false,
        activeSessionId: session.id,
      }))
      return session
    } catch (err) {
      set({ error: String(err), isLoading: false })
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
    }
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  setClosedSession: (sessionId) => {
    set({ closedSessionId: sessionId })
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
}))
