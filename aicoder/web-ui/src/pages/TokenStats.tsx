import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import type { Session, TokenUsage } from '../api/client'
import { api } from '../api/client'

export default function TokenStats() {
  const { sessions, fetchSessions } = useSessionStore()
  const [usages, setUsages] = useState<Record<string, TokenUsage>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    const claudeSessions = sessions.filter(s => s.sessionType === 'claude' && s.cliSessionId)
    if (claudeSessions.length === 0) return

    setLoading(true)
    Promise.all(
      claudeSessions.map(async (s) => {
        try {
          const usage = await api.getTokenUsage(s.id)
          return [s.id, usage] as const
        } catch {
          return null
        }
      })
    ).then((results) => {
      const map: Record<string, TokenUsage> = {}
      results.forEach((r) => {
        if (r) map[r[0]] = r[1]
      })
      setUsages(map)
      setLoading(false)
    })
  }, [sessions])

  const totalCost = Object.values(usages).reduce((sum, u) => sum + u.cost, 0)
  const totalInput = Object.values(usages).reduce((sum, u) => sum + u.inputTokens, 0)
  const totalOutput = Object.values(usages).reduce((sum, u) => sum + u.outputTokens, 0)

  const claudeSessions = sessions.filter(s => s.sessionType === 'claude')

  return (
    <div className="token-stats-page">
      <div className="page-header">
        <h2>Token 统计</h2>
      </div>

      {/* 汇总卡片 */}
      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-value">${totalCost.toFixed(2)}</div>
          <div className="stat-label">总费用</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{(totalInput / 1000).toFixed(1)}k</div>
          <div className="stat-label">输入 Tokens</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{(totalOutput / 1000).toFixed(1)}k</div>
          <div className="stat-label">输出 Tokens</div>
        </div>
      </div>

      {loading && <div className="loading">加载中...</div>}

      {/* 各会话详情 */}
      <div className="stats-list">
        {claudeSessions.map((session) => {
          const usage = usages[session.id]
          return (
            <div key={session.id} className="stats-item">
              <div className="stats-item-header">
                <span className="stats-item-title">{session.title}</span>
                <span className="stats-item-cost">
                  {usage ? `$${usage.cost.toFixed(4)}` : '-'}
                </span>
              </div>
              {usage && (
                <div className="stats-item-detail">
                  <span>输入: {usage.inputTokens.toLocaleString()}</span>
                  <span>输出: {usage.outputTokens.toLocaleString()}</span>
                  {usage.model && <span className="stats-model">{usage.model}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
