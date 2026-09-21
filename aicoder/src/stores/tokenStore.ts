import { create } from 'zustand'
import type { TokenStats, TokenUsage, HeatmapData, SessionUsageDelta, SessionUsageResult } from '../types/token'

interface TokenState {
  stats: TokenStats
  isLoading: boolean

  // Actions
  fetchStats: () => void
  clearStats: () => void
  addUsage: (usage: TokenUsage) => void
  upsertDailyUsage: (usage: TokenUsage) => void
  processSessionDelta: (delta: SessionUsageDelta) => void
  processSessionResult: (result: SessionUsageResult) => void
  getHeatmapData: () => HeatmapData[]
}

const STORAGE_KEY = 'hcl-ier_token_stats'

// 计算统计数据
function calculateStats(history: TokenUsage[]): TokenStats {
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const todayData = history.filter(h => h.date === today)
  const weekData = history.filter(h => new Date(h.date) >= weekStart)
  const monthData = history.filter(h => new Date(h.date) >= monthStart)

  return {
    today: {
      input: todayData.reduce((sum, h) => sum + h.inputTokens, 0),
      output: todayData.reduce((sum, h) => sum + h.outputTokens, 0),
      cached: todayData.reduce((sum, h) => sum + h.cachedTokens, 0),
      cost: todayData.reduce((sum, h) => sum + h.totalCost, 0),
    },
    thisWeek: {
      input: weekData.reduce((sum, h) => sum + h.inputTokens, 0),
      output: weekData.reduce((sum, h) => sum + h.outputTokens, 0),
      cached: weekData.reduce((sum, h) => sum + h.cachedTokens, 0),
      cost: weekData.reduce((sum, h) => sum + h.totalCost, 0),
    },
    thisMonth: {
      input: monthData.reduce((sum, h) => sum + h.inputTokens, 0),
      output: monthData.reduce((sum, h) => sum + h.outputTokens, 0),
      cached: monthData.reduce((sum, h) => sum + h.cachedTokens, 0),
      cost: monthData.reduce((sum, h) => sum + h.totalCost, 0),
    },
    history,
  }
}

const emptyStats: TokenStats = {
  today: { input: 0, output: 0, cached: 0, cost: 0 },
  thisWeek: { input: 0, output: 0, cached: 0, cost: 0 },
  thisMonth: { input: 0, output: 0, cached: 0, cost: 0 },
  history: [],
}

// 初始化时从 localStorage 加载
function loadInitialStats(): TokenStats {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const history = JSON.parse(stored) as TokenUsage[]
      return calculateStats(history)
    } catch {
      return emptyStats
    }
  }
  return emptyStats
}

export const useTokenStore = create<TokenState>((set, get) => ({
  stats: loadInitialStats(),
  isLoading: false,

  fetchStats: () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const history = JSON.parse(stored) as TokenUsage[]
      set({ stats: calculateStats(history) })
    }
  },

  clearStats: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ stats: emptyStats })
  },

  addUsage: (usage) => {
    const { stats } = get()
    const newHistory = [...stats.history, usage]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
    set({ stats: calculateStats(newHistory) })
  },

  upsertDailyUsage: (usage) => {
    const { stats } = get()
    const existing = stats.history.find(h => h.date === usage.date)
    let newHistory: TokenUsage[]
    if (existing) {
      newHistory = stats.history.map(h =>
        h.date === usage.date
          ? {
              ...h,
              inputTokens: h.inputTokens + usage.inputTokens,
              outputTokens: h.outputTokens + usage.outputTokens,
              cachedTokens: h.cachedTokens + usage.cachedTokens,
              totalCost: h.totalCost + usage.totalCost,
            }
          : h
      )
    } else {
      newHistory = [...stats.history, usage]
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
    set({ stats: calculateStats(newHistory) })
  },

  processSessionDelta: (delta) => {
    if (delta.inputTokens === 0 && delta.outputTokens === 0) return
    const usage: TokenUsage = {
      date: delta.date,
      inputTokens: delta.inputTokens,
      outputTokens: delta.outputTokens,
      cachedTokens: delta.cacheReadTokens,
      totalCost: delta.cost,
    }
    get().upsertDailyUsage(usage)
  },

  processSessionResult: (result) => {
    for (const delta of result.deltas) {
      get().processSessionDelta(delta)
    }
  },

  getHeatmapData: () => {
    const { stats } = get()
    if (stats.history.length === 0) return []
    const maxCount = Math.max(...stats.history.map(h => h.inputTokens + h.outputTokens))

    return stats.history.map(h => {
      const count = h.inputTokens + h.outputTokens
      const level = maxCount === 0 ? 0 : Math.min(4, Math.floor((count / maxCount) * 4)) as 0 | 1 | 2 | 3 | 4

      return {
        date: h.date,
        count,
        level,
      }
    })
  },
}))
