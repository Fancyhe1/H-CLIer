export interface TokenUsage {
  date: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalCost: number
}

export interface TokenStats {
  today: {
    input: number
    output: number
    cached: number
    cost: number
  }
  thisWeek: {
    input: number
    output: number
    cached: number
    cost: number
  }
  thisMonth: {
    input: number
    output: number
    cached: number
    cost: number
  }
  history: TokenUsage[]
}

export interface HeatmapData {
  date: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface SessionUsageDelta {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cost: number
  model: string
  date: string
}

export interface SessionUsageResult {
  deltas: SessionUsageDelta[]
  newFileOffset: number
}

export interface SessionTotalUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cost: number
  model: string
}
