import { create } from 'zustand'
import type { TokenStats, TokenUsage, HeatmapData } from '../types/token'

interface TokenState {
  stats: TokenStats
  isLoading: boolean

  // Actions
  fetchStats: () => void
  addUsage: (usage: TokenUsage) => void
  getHeatmapData: () => HeatmapData[]
}

const STORAGE_KEY = 'hcl-ier_token_stats'

// 生成模拟数据
function generateMockData(): TokenUsage[] {
  const data: TokenUsage[] = []
  const now = new Date()

  for (let i = 179; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)

    // 随机生成用量（周末较少）
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const baseTokens = isWeekend ? 1000 : 5000
    const randomFactor = Math.random() * 0.5 + 0.5

    const inputTokens = Math.floor(baseTokens * randomFactor)
    const outputTokens = Math.floor(inputTokens * 0.6)
    const cachedTokens = Math.floor(inputTokens * 0.3)

    data.push({
      date: date.toISOString().split('T')[0],
      inputTokens,
      outputTokens,
      cachedTokens,
      totalCost: (inputTokens + outputTokens) * 0.000003,
    })
  }

  return data
}

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

export const useTokenStore = create<TokenState>((set, get) => ({
  stats: calculateStats(generateMockData()),
  isLoading: false,

  fetchStats: () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const history = JSON.parse(stored) as TokenUsage[]
      set({ stats: calculateStats(history) })
    }
  },

  addUsage: (usage) => {
    const { stats } = get()
    const newHistory = [...stats.history, usage]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
    set({ stats: calculateStats(newHistory) })
  },

  getHeatmapData: () => {
    const { stats } = get()
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
