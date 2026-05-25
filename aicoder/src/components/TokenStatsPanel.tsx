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
} from '@ant-design/icons'
import { useTokenStore } from '../stores/tokenStore'
import { refreshAllStats } from '../hooks/useTokenPolling'
import '../styles/TokenStatsPanel.css'

const { Title, Text } = Typography

// 活动时间热力图
function ActivityHeatmap() {
  const { getHeatmapData } = useTokenStore()
  const [data, setData] = useState(getHeatmapData())

  useEffect(() => {
    setData(getHeatmapData())
  }, [getHeatmapData])

  // 生成最近6个月的热力图
  const weeks: string[][] = []
  const today = new Date()

  for (let w = 0; w < 26; w++) {
    const week: string[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(today)
      date.setDate(date.getDate() - (w * 7 + (6 - d)))
      week.push(date.toISOString().split('T')[0])
    }
    weeks.unshift(week)
  }

  const getLevel = (date: string) => {
    const item = data.find(d => d.date === date)
    return item?.level || 0
  }

  const getTooltip = (date: string) => {
    const item = data.find(d => d.date === date)
    return item ? `${date}: ${item.count.toLocaleString()} tokens` : date
  }

  const levelColors = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']

  return (
    <div className="activity-heatmap">
      <div className="heatmap-legend">
        <Text type="secondary">少</Text>
        {levelColors.map((color, i) => (
          <div
            key={i}
            className="legend-item"
            style={{ backgroundColor: color }}
          />
        ))}
        <Text type="secondary">多</Text>
      </div>
      <div className="heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-week">
            {week.map((date, di) => (
              <Tooltip key={di} title={getTooltip(date)}>
                <div
                  className="heatmap-day"
                  style={{ backgroundColor: levelColors[getLevel(date)] }}
                />
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// 趋势图（简化版）
function TrendChart() {
  const { stats } = useTokenStore()

  // 按日期排序，取最近7天数据
  const recentData = [...stats.history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)

  const maxTokens = Math.max(...recentData.map(d => d.inputTokens + d.outputTokens))

  return (
    <div className="trend-chart">
      <div className="chart-bars">
        {recentData.map((d, i) => {
          const total = d.inputTokens + d.outputTokens
          const height = maxTokens > 0 ? (total / maxTokens) * 100 : 0

          return (
            <Tooltip
              key={i}
              title={`${d.date}\n输入: ${d.inputTokens.toLocaleString()}\n输出: ${d.outputTokens.toLocaleString()}`}
            >
              <div className="chart-bar-wrapper">
                <div
                  className="chart-bar"
                  style={{ height: `${height}%` }}
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

      <Card title="最近7天趋势" className="trend-card">
        <TrendChart />
      </Card>

      <Card title="活动时间（最近6个月）" className="heatmap-card">
        <ActivityHeatmap />
      </Card>

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
      </Card>
    </div>
  )
}

export default TokenStatsPanel
