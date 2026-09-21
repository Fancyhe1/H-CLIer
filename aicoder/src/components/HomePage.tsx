import { useState } from 'react'
import {
  PlusOutlined,
  BarChartOutlined,
  SettingOutlined,
  RightOutlined,
  ClockCircleOutlined,
  OrderedListOutlined,
  CheckOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { Input, Button } from 'antd'
import { useSessionStore } from '../stores/sessionStore'
import { useMemoStore } from '../stores/memoStore'
import type { MemoPriority } from '../stores/memoStore'
import '../styles/HomePage.css'

interface HomePageProps {
  onNewSession: () => void
  onOpenStats: () => void
  onOpenSettings: () => void
  onSelectSession: (sessionId: string) => void
}

const PRI_COLORS: Record<MemoPriority, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#3B82F6',
}

const formatTimeAgo = (timestamp: string): string => {
  const diff = Date.now() - new Date(timestamp).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  return `${d}d`
}

function HomePage({ onNewSession, onOpenStats, onOpenSettings, onSelectSession }: HomePageProps) {
  const { sessions, runningSessionIds } = useSessionStore()
  const { memos, addMemo, toggleMemo, deleteMemo, clearDone } = useMemoStore()
  const [memoInput, setMemoInput] = useState('')
  const [memoPri, setMemoPri] = useState<MemoPriority>('medium')

  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
    .slice(0, 5)

  const handleAddMemo = () => {
    const text = memoInput.trim()
    if (!text) return
    addMemo(text, '', memoPri)
    setMemoInput('')
  }

  const pendingCount = memos.filter(m => !m.done).length
  const doneCount = memos.filter(m => m.done).length

  // 排序：未完成在前，按优先级排序
  const sorted = [...memos].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    if (a.done !== b.done) return a.done ? 1 : -1
    return order[a.priority] - order[b.priority]
  })

  const quickActions = [
    { icon: <PlusOutlined />, title: '新建会话', desc: '创建新会话并开始编码', onClick: onNewSession },
    { icon: <BarChartOutlined />, title: 'Token 统计', desc: '查看 Token 用量数据', onClick: onOpenStats },
    { icon: <SettingOutlined />, title: '打开设置', desc: '配置应用偏好', onClick: onOpenSettings },
  ]

  return (
    <div className="home-page">
      {/* Hero */}
      <div className="home-hero">
        <img className="home-logo" src="/icon-32.png" alt="H CLLer" />
        <h1 className="home-title">H CLLer</h1>
        <p className="home-subtitle">Claude Code Session Manager & Workbench</p>
        <p className="home-description">更高效地管理 Claude Code 会话，专注于你的研发工作。</p>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        {quickActions.map((action) => (
          <div key={action.title} className="quick-action-card" onClick={action.onClick}>
            <div className="quick-action-icon">{action.icon}</div>
            <div className="quick-action-title">{action.title}</div>
            <div className="quick-action-desc">{action.desc}</div>
            <div className="quick-action-arrow"><RightOutlined /></div>
          </div>
        ))}
      </div>

      {/* Bottom Row */}
      <div className="home-bottom-row">
        {/* Recent Sessions */}
        <div className="recent-sessions">
          <div className="recent-header">
            <div className="recent-title">
              <ClockCircleOutlined className="recent-title-icon" />
              最近会话
            </div>
          </div>
          {recentSessions.length === 0 ? (
            <div className="recent-list">
              <div className="home-empty-recent">暂无会话，点击上方"新建会话"开始</div>
            </div>
          ) : (
            <div className="recent-list">
              {recentSessions.map((session) => {
                const isRunning = runningSessionIds.has(session.id)
                return (
                  <div key={session.id} className="recent-item" onClick={() => onSelectSession(session.id)}>
                    <div className="recent-item-status" style={{ backgroundColor: isRunning ? 'var(--status-running)' : 'var(--status-idle)' }} />
                    <div className="recent-item-info">
                      <div className="recent-item-name">{session.title}</div>
                      <div className="recent-item-path">{session.projectPath}</div>
                    </div>
                    <span className="recent-item-time">{formatTimeAgo(session.lastActivityAt)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Memo */}
        <div className="home-memo">
          <div className="home-memo-header">
            <OrderedListOutlined />
            备忘录
            {memos.length > 0 && <span className="home-memo-count">{pendingCount}/{memos.length}</span>}
          </div>
          <div className="home-memo-box">
            {/* Input row */}
            <div className="home-memo-input-row">
              <div className="home-memo-pri-btns">
                {(['high', 'medium', 'low'] as MemoPriority[]).map(p => (
                  <button
                    key={p}
                    className={`home-memo-pri-btn ${memoPri === p ? 'active' : ''}`}
                    style={{ '--pri-color': PRI_COLORS[p] } as React.CSSProperties}
                    onClick={() => setMemoPri(p)}
                  >
                    {{ high: '高', medium: '中', low: '低' }[p]}
                  </button>
                ))}
              </div>
              <Input
                className="home-memo-input"
                placeholder="添加备忘..."
                value={memoInput}
                onChange={e => setMemoInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddMemo() } }}
              />
              <Button type="primary" icon={<PlusOutlined />} size="small" className="home-memo-add-btn" onClick={handleAddMemo} disabled={!memoInput.trim()} />
            </div>

            {/* List */}
            <div className="home-memo-list">
              {sorted.length === 0 ? (
                <div className="home-memo-empty">暂无备忘事项</div>
              ) : (
                sorted.map(memo => (
                  <div key={memo.id} className={`home-memo-item ${memo.done ? 'is-done' : ''}`}>
                    <button className={`home-memo-check ${memo.done ? 'checked' : ''}`} onClick={() => toggleMemo(memo.id)}>
                      {memo.done && <CheckOutlined />}
                    </button>
                    <div className="home-memo-body">
                      <span className={`home-memo-text ${memo.done ? 'done' : ''}`}>{memo.title}</span>
                      <span className="home-memo-meta">
                        <span className="home-memo-pri-dot" style={{ background: PRI_COLORS[memo.priority] }} />
                        {memo.dueDate && <span className="home-memo-time" style={{ color: 'var(--status-warning)' }}>{memo.dueDate}</span>}
                      </span>
                    </div>
                    <button className="home-memo-del" onClick={() => deleteMemo(memo.id)}>✕</button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {doneCount > 0 && (
              <div className="home-memo-footer">
                <button className="home-memo-clear-btn" onClick={clearDone}>
                  <DeleteOutlined /> 清除已完成 ({doneCount})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage
