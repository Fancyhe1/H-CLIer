import { create } from 'zustand'
import { api, type Session, type ChatMessage, type TokenUsage } from '../api/client'

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  chatHistory: ChatMessage[]
  tokenUsage: TokenUsage | null
  isLoading: boolean
  error: string | null

  fetchSessions: () => Promise<void>
  setActiveSession: (id: string | null) => void
  createSession: (projectPath: string, title?: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  fetchHistory: (id: string) => Promise<void>
  fetchTokenUsage: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  chatHistory: [],
  tokenUsage: null,
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      const sessions = await api.getSessions()
      set({ sessions, isLoading: false })
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch sessions',
      })
    }
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id, chatHistory: [], tokenUsage: null })
    if (id) {
      get().fetchHistory(id)
      get().fetchTokenUsage(id)
    }
  },

  createSession: async (projectPath, title) => {
    try {
      await api.createSession(projectPath, title)
      await get().fetchSessions()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to create session' })
    }
  },

  deleteSession: async (id) => {
    try {
      await api.deleteSession(id)
      const { activeSessionId } = get()
      if (activeSessionId === id) {
        set({ activeSessionId: null, chatHistory: [], tokenUsage: null })
      }
      await get().fetchSessions()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete session' })
    }
  },

  fetchHistory: async (id) => {
    try {
      const history = await api.getSessionHistory(id)
      set({ chatHistory: history })
    } catch {
      // 会话可能没有历史记录，静默处理
      set({ chatHistory: [] })
    }
  },

  fetchTokenUsage: async (id) => {
    try {
      const usage = await api.getTokenUsage(id)
      set({ tokenUsage: usage })
    } catch {
      set({ tokenUsage: null })
    }
  },
}))
