import { create } from 'zustand'
import { api } from '../api/client'

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (token: string) => Promise<void>
  logout: () => void
  checkAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!api.getToken(),
  isLoading: false,
  error: null,

  login: async (token: string) => {
    set({ isLoading: true, error: null })
    try {
      api.setToken(token)
      await api.login(token)
      set({ isAuthenticated: true, isLoading: false })
    } catch (e) {
      api.clearToken()
      set({
        isAuthenticated: false,
        isLoading: false,
        error: e instanceof Error ? e.message : 'Login failed',
      })
    }
  },

  logout: () => {
    api.clearToken()
    set({ isAuthenticated: false, error: null })
  },

  checkAuth: () => {
    set({ isAuthenticated: !!api.getToken() })
  },
}))
