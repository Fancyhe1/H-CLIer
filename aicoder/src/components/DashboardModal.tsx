import { Modal } from 'antd'
import {
  ThunderboltOutlined,
  CodeOutlined,
  ConsoleSqlOutlined,
  DesktopOutlined,
} from '@ant-design/icons'
import { useSessionStore } from '../stores/sessionStore'
import { useTokenStore } from '../stores/tokenStore'
import type { Session } from '../types/session'
import '../styles/Dashboard.css'

interface DashboardModalProps {
  visible: boolean
  onClose: () => void
  theme: 'light' | 'dark'
}

// Agent 配置
const AGENT_CONFIG = {
  claude: {
    label: 'Claude Agent',
    icon: <CodeOutlined />,
    className: 'agent-claude',
  },
  terminal: {
    label: 'Terminal',
    icon: <ConsoleSqlOutlined />,
    className: 'agent-terminal',
  },
} as const

// 格式化相对时间
function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 60) return '刚刚活跃'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`
  return `${Math.floor(diffSec / 86400)} 天前`
}

// 格式化 Token 数量
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function DashboardModal({ visible, onClose, theme }: DashboardModalProps) {
  const { sessions, runningSessionIds, setActiveSession } = useSessionStore()
  const { stats } = useTokenStore()

  // 过滤出运行中的会话
  const runningSessions = sessions.filter(s => runningSessionIds.has(s.id))

  // 今日统计
  const todayTokens = stats.today.input + stats.today.output

  // 点击卡片切换会话
  const handleCardClick = (session: Session) => {
    setActiveSession(session.id)
    onClose()
  }

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DesktopOutlined />
          仪表盘
        </span>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={720}
      className={theme === 'dark' ? 'dark' : ''}
    >
      {/* 统计概览 */}
      <div className="dashboard-stats">
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-value" style={{ color: '#22c55e' }}>
            {runningSessions.length}
          </div>
          <div className="dashboard-stat-label">运行中会话</div>
        </div>
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-value">
            {sessions.length}
          </div>
          <div className="dashboard-stat-label">总会话数</div>
        </div>
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-value" style={{ color: '#a855f7' }}>
            {formatTokens(todayTokens)}
          </div>
          <div className="dashboard-stat-label">今日 Token</div>
        </div>
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-value" style={{ color: '#f59e0b' }}>
            ${stats.today.cost.toFixed(4)}
          </div>
          <div className="dashboard-stat-label">今日费用</div>
        </div>
      </div>

      {/* 运行中会话列表 */}
      <div className="dashboard-section-title">
        <ThunderboltOutlined style={{ color: '#22c55e' }} />
        运行中的会话
      </div>

      {runningSessions.length === 0 ? (
        <div className="dashboard-empty">
          <div className="dashboard-empty-icon">
            <DesktopOutlined />
          </div>
          <div className="dashboard-empty-text">暂无运行中的会话</div>
          <div className="dashboard-empty-text" style={{ fontSize: 12, marginTop: 4 }}>
            打开一个会话后将在这里显示
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          {runningSessions.map(session => {
            const agent = AGENT_CONFIG[session.sessionType]
            return (
              <div
                key={session.id}
                className={`session-card ${session.hasUnread ? 'is-active' : ''}`}
                onClick={() => handleCardClick(session)}
              >
                <div className="session-card-header">
                  <div className="session-card-title">{session.title}</div>
                  <span className={`agent-badge ${agent.className}`}>
                    {agent.icon}
                    {agent.label}
                  </span>
                </div>
                <div
                  className="session-card-path"
                  title={session.projectPath}
                >
                  {session.projectPath}
                </div>
                <div className="session-card-meta" style={{ marginTop: 10 }}>
                  <div className="activity-indicator">
                    <span className={`activity-dot ${session.hasUnread ? 'active' : 'idle'}`} />
                    {session.hasUnread ? '活跃' : '空闲'}
                  </div>
                  <span>{formatRelativeTime(session.lastActivityAt)}</span>
                  {session.messageCount > 0 && (
                    <span>{session.messageCount} 条消息</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export default DashboardModal
