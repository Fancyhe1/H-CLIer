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
import { useTokenStore } from '../stores/tokenStore'
import { refreshAllStats } from '../hooks/useTokenPolling'
import '../styles/TokenStatsPanel.css'

const { Title, Text } = Typography

// 月度活动概览
function MonthlyActivity() {
  const { stats } = useTokenStore()

  // 生成最近6个月
  const months: { key: string; label: string }[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7) // "2026-04"
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
    months.push({ key, label })
  }

  // 按月聚合
  const monthlyData = months.map(m => {
    const entries = stats.history.filter(h => h.date.startsWith(m.key))
    const totalTokens = entries.reduce((sum, h) => sum + h.inputTokens + h.outputTokens, 0)
    const totalCost = entries.reduce((sum, h) => sum + h.totalCost, 0)
    return { ...m, totalTokens, totalCost }
  })

  const maxTokens = Math.max(...monthlyData.map(m => m.totalTokens), 1)

  // 颜色等级：根据占比分5档
  const getLevel = (tokens: number) => {
    if (tokens === 0) return 0
    const ratio = tokens / maxTokens
    if (ratio < 0.2) return 1
    if (ratio < 0.4) return 2
    if (ratio < 0.7) return 3
    return 4
  }

  const levelColors = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']

  return (
    <div className="monthly-activity">
      <div className="monthly-grid">
        {monthlyData.map((m, i) => {
          const level = getLevel(m.totalTokens)
          return (
            <Tooltip
              key={i}
              title={`${m.label}\n总量: ${m.totalTokens.toLocaleString()} tokens\n花费: $${m.totalCost.toFixed(4)}`}
            >
              <div
                className="month-box"
                style={{ backgroundColor: levelColors[level] }}
              >
                <div className="month-label">{m.label}</div>
                <div className="month-value">
                  {m.totalTokens > 0 ? `${(m.totalTokens / 1000).toFixed(1)}k` : '-'}
                </div>
              </div>
            </Tooltip>
          )
        })}
      </div>
      <div className="heatmap-legend">
        <Text type="secondary">少</Text>
        {levelColors.map((color, i) => (
          <div key={i} className="legend-item" style={{ backgroundColor: color }} />
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
    </div>
  )
}

export default TokenStatsPanel
