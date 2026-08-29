import { useEffect, useState } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Tooltip,
  Button,
  message,
} from 'antd'
import {
  DollarOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  PercentageOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useTokenStore } from '../stores/tokenStore'
import { useSessionStore } from '../stores/sessionStore'
import { refreshAllStats } from '../hooks/useTokenPolling'
import type { SessionTotalUsage } from '../types/token'
import '../styles/TokenStatsPanel.css'

const { Title, Text } = Typography

// 月度活动概览 - 日历样式
function MonthlyActivity() {
  const { stats } = useTokenStore()

  // 生成最近6个月
  const months: { year: number; month: number; key: string; label: string }[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(), // 0-indexed
      key: d.toISOString().slice(0, 7),
      label: `${d.getMonth() + 1}月`,
    })
  }

  // 建立日期 -> token 数的映射
  const dataMap = new Map(stats.history.map(h => [h.date, h.inputTokens + h.outputTokens]))

  // 全局最大值（用于颜色等级）
  const allTokens = [...dataMap.values()]
  const maxTokens = allTokens.length > 0 ? Math.max(...allTokens) : 1

  const getLevel = (tokens: number): 0 | 1 | 2 | 3 | 4 => {
    if (tokens === 0) return 0
    const ratio = tokens / maxTokens
    if (ratio < 0.2) return 1
    if (ratio < 0.4) return 2
    if (ratio < 0.7) return 3
    return 4
  }

  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']

  return (
    <div className="monthly-activity">
      <div className="monthly-calendar-grid">
        {months.map((m, mi) => {
          // 该月第一天是星期几（0=周日，转换为周一起始）
          const firstDay = new Date(m.year, m.month, 1).getDay()
          const startOffset = firstDay === 0 ? 6 : firstDay - 1 // 周一=0, 周日=6
          // 该月天数
          const daysInMonth = new Date(m.year, m.month + 1, 0).getDate()
          // 该月总 token
          let monthTotal = 0

          // 生成日格子
          const cells: { day: number; dateStr: string; tokens: number; level: number }[] = []
          for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${m.year}-${String(m.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const tokens = dataMap.get(dateStr) || 0
            monthTotal += tokens
            cells.push({ day, dateStr, tokens, level: getLevel(tokens) })
          }

          return (
            <div key={mi} className="month-calendar">
              <div className="month-calendar-title">{m.label}</div>
              <div className="month-calendar-weekdays">
                {weekdayLabels.map((w, wi) => (
                  <span key={wi}>{w}</span>
                ))}
              </div>
              <div className="month-calendar-grid-inner">
                {/* 前面的空白占位 */}
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="calendar-cell empty" />
                ))}
                {/* 日格子 */}
                {cells.map((c) => (
                  <Tooltip key={c.day} title={`${c.dateStr}\n${c.tokens.toLocaleString()} tokens`}>
                    <div className={`calendar-cell level-${c.level}`} />
                  </Tooltip>
                ))}
              </div>
              <div className="month-calendar-total">
                {monthTotal > 0 ? `${(monthTotal / 1000).toFixed(1)}k` : ''}
              </div>
            </div>
          )
        })}
      </div>
      <div className="heatmap-legend">
        <Text type="secondary">少</Text>
        {[0, 1, 2, 3, 4].map(level => (
          <div key={level} className={`legend-item level-${level}`} />
        ))}
        <Text type="secondary">多</Text>
      </div>
    </div>
  )
}

// 趋势图
function TrendChart() {
  const { stats } = useTokenStore()

  // 生成最近14个日历天
  const last14Days: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    last14Days.push(d.toISOString().split('T')[0])
  }

  const dataMap = new Map(stats.history.map(h => [h.date, h]))
  const chartData = last14Days.map(date => dataMap.get(date) || { date, inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalCost: 0 })

  const maxTokens = Math.max(...chartData.map(d => d.inputTokens + d.outputTokens), 1)

  return (
    <div className="trend-chart">
      <div className="chart-bars">
        {chartData.map((d, i) => {
          const total = d.inputTokens + d.outputTokens
          const height = (total / maxTokens) * 100

          return (
            <Tooltip
              key={i}
              title={`${d.date}\n输入: ${d.inputTokens.toLocaleString()}\n输出: ${d.outputTokens.toLocaleString()}`}
            >
              <div className="chart-bar-wrapper">
                <div
                  className="chart-bar"
                  style={{ height: `${height}%`, opacity: total === 0 ? 0.3 : 1 }}
                />
                <Text className="chart-label" type="secondary">
                  {d.date.slice(5)}
                </Text>
              </div>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

// 会话用量列表（按工作空间分组）
function SessionUsageList() {
  const { sessions } = useSessionStore()
  const [sessionUsages, setSessionUsages] = useState<Map<string, SessionTotalUsage>>(new Map())
  const [loading, setLoading] = useState(false)

  const claudeSessions = sessions.filter(s => s.sessionType === 'claude' && s.cliSessionId)

  // 按工作空间（projectPath）分组
  const grouped = new Map<string, typeof claudeSessions>()
  for (const session of claudeSessions) {
    const list = grouped.get(session.projectPath) || []
    list.push(session)
    grouped.set(session.projectPath, list)
  }

  // 工作空间排序：按会话数量降序
  const sortedGroups = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)

  const loadAll = async () => {
    setLoading(true)
    const map = new Map<string, SessionTotalUsage>()
    for (const session of claudeSessions) {
      try {
        const usage = await invoke<SessionTotalUsage>('get_session_total_usage', {
          sessionId: session.cliSessionId!,
          projectPath: session.projectPath,
        })
        map.set(session.id, usage)
      } catch {
        // skip
      }
    }
    setSessionUsages(map)
    setLoading(false)
  }

  useEffect(() => {
    if (claudeSessions.length > 0) {
      loadAll()
    }
  }, [sessions.length])

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return n.toString()
  }

  // 计算工作空间汇总
  const getWorkspaceTotal = (sessionList: typeof claudeSessions) => {
    let input = 0, output = 0, cost = 0
    for (const s of sessionList) {
      const u = sessionUsages.get(s.id)
      if (u) {
        input += u.inputTokens
        output += u.outputTokens
        cost += u.cost
      }
    }
    return { input, output, cost }
  }

  if (claudeSessions.length === 0) return null

  return (
    <Card
      title="会话用量"
      className="session-list-card"
      extra={
        <Button size="small" icon={<ReloadOutlined spin={loading} />} onClick={loadAll} loading={loading}>
          刷新
        </Button>
      }
    >
      <div className="session-usage-list">
        {sortedGroups.map(([projectPath, sessionList]) => {
          const workspaceName = projectPath.split('\\').pop() || projectPath.split('/').pop() || projectPath
          const total = getWorkspaceTotal(sessionList)
          return (
            <div key={projectPath} className="workspace-group">
              <div className="workspace-header">
                <div className="workspace-name">{workspaceName}</div>
                <div className="workspace-total">
                  <span>{formatNumber(total.input + total.output)} tokens</span>
                  <span style={{ color: '#cf1322' }}>${total.cost.toFixed(4)}</span>
                </div>
              </div>
              <div className="workspace-sessions">
                {sessionList.map(session => {
                  const usage = sessionUsages.get(session.id)
                  return (
                    <div key={session.id} className="session-usage-item">
                      <div className="session-usage-info">
                        <div className="session-usage-title">{session.title}</div>
                        <div className="session-usage-id">{session.cliSessionId}</div>
                      </div>
                      {usage && (
                        <div className="session-usage-tokens">
                          <div className="session-usage-stat">
                            <div className="session-usage-stat-value">{formatNumber(usage.inputTokens)}</div>
                            <div className="session-usage-stat-label">输入</div>
                          </div>
                          <div className="session-usage-stat">
                            <div className="session-usage-stat-value">{formatNumber(usage.outputTokens)}</div>
                            <div className="session-usage-stat-label">输出</div>
                          </div>
                          <div className="session-usage-stat">
                            <div className="session-usage-stat-value" style={{ color: '#cf1322' }}>${usage.cost.toFixed(4)}</div>
                            <div className="session-usage-stat-label">花费</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function TokenStatsPanel() {
  const { stats, fetchStats } = useTokenStore()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshAllStats()
      message.success('用量统计已刷新')
    } catch {
      message.error('刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

  const formatNumber = (n: number) => n.toLocaleString()
  const formatCost = (n: number) => `$${n.toFixed(4)}`

  // 缓存命中率 = cached / (input + cached) * 100
  const cacheHitRate = stats.thisMonth.input + stats.thisMonth.cached > 0
    ? ((stats.thisMonth.cached / (stats.thisMonth.input + stats.thisMonth.cached)) * 100).toFixed(1)
    : '0'

  return (
    <div className="token-stats-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Token 统计</Title>
        <Tooltip title="重新扫描所有会话用量">
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={handleRefresh}
            loading={refreshing}
            size="small"
          >
            刷新
          </Button>
        </Tooltip>
      </div>

      <Row gutter={[16, 16]} className="stats-row">
        <Col span={8}>
          <Card className="stat-card">
            <Statistic
              title="今日用量"
              value={formatNumber(stats.today.input + stats.today.output)}
              suffix="tokens"
              valueStyle={{ color: '#1677ff' }}
            />
            <div className="stat-detail">
              <Text type="secondary">
                输入: {formatNumber(stats.today.input)} |
                输出: {formatNumber(stats.today.output)}
              </Text>
            </div>
            <div className="stat-cost">
              <DollarOutlined /> {formatCost(stats.today.cost)}
            </div>
          </Card>
        </Col>

        <Col span={8}>
          <Card className="stat-card">
            <Statistic
              title="本周用量"
              value={formatNumber(stats.thisWeek.input + stats.thisWeek.output)}
              suffix="tokens"
              valueStyle={{ color: '#52c41a' }}
            />
            <div className="stat-detail">
              <Text type="secondary">
                输入: {formatNumber(stats.thisWeek.input)} |
                输出: {formatNumber(stats.thisWeek.output)}
              </Text>
            </div>
            <div className="stat-cost">
              <DollarOutlined /> {formatCost(stats.thisWeek.cost)}
            </div>
          </Card>
        </Col>

        <Col span={8}>
          <Card className="stat-card">
            <Statistic
              title="本月用量"
              value={formatNumber(stats.thisMonth.input + stats.thisMonth.output)}
              suffix="tokens"
              valueStyle={{ color: '#722ed1' }}
            />
            <div className="stat-detail">
              <Text type="secondary">
                输入: {formatNumber(stats.thisMonth.input)} |
                输出: {formatNumber(stats.thisMonth.output)}
              </Text>
            </div>
            <div className="stat-cost">
              <DollarOutlined /> {formatCost(stats.thisMonth.cost)}
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="详细数据" className="detail-card">
        <Row gutter={[16, 16]}>
          <Col span={6}>
            <Statistic
              title="总输入 Token"
              value={formatNumber(stats.thisMonth.input)}
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="总输出 Token"
              value={formatNumber(stats.thisMonth.output)}
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="缓存命中"
              value={formatNumber(stats.thisMonth.cached)}
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="总花费"
              value={formatCost(stats.thisMonth.cost)}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={6}>
            <Statistic
              title="缓存命中率"
              value={cacheHitRate}
              suffix="%"
              prefix={<PercentageOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
        </Row>
      </Card>

      <Card title="最近14天趋势" className="trend-card">
        <TrendChart />
      </Card>

      <Card title="月度活动" className="heatmap-card">
        <MonthlyActivity />
      </Card>

      <SessionUsageList />
    </div>
  )
}

export default TokenStatsPanel
