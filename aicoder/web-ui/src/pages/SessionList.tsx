import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import type { Session } from '../api/client'

function SessionItem({ session, onClick, onDelete }: {
  session: Session
  onClick: () => void
  onDelete: () => void
}) {
  const typeIcon = session.sessionType === 'claude' ? '🤖' : '💻'
  const timeStr = new Date(session.lastActivityAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="session-item" onClick={onClick}>
      <div className="session-avatar">{typeIcon}</div>
      <div className="session-info">
        <div className="session-top">
          <span className="session-title">{session.title}</span>
          <span className="session-time">{timeStr}</span>
        </div>
        <div className="session-bottom">
          <span className="session-path">{session.projectPath.split(/[/\\]/).pop()}</span>
          <button
            className="btn-delete-sm"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

interface SessionListProps {
  onEnterChat: (session: Session) => void
}

export default function SessionList({ onEnterChat }: SessionListProps) {
  const { sessions, isLoading, fetchSessions, deleteSession } = useSessionStore()

  useEffect(() => {
    fetchSessions()
    const timer = setInterval(fetchSessions, 10000)
    return () => clearInterval(timer)
  }, [fetchSessions])

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
  )

  // 按工作空间分组
  const grouped = sortedSessions.reduce((acc, s) => {
    const key = s.projectPath
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {} as Record<string, Session[]>)

  return (
    <div className="session-list-page">
      <div className="page-header">
        <h2>H CLIer</h2>
        <button className="btn-refresh" onClick={fetchSessions} disabled={isLoading}>
          {isLoading ? '⏳' : '🔄'}
        </button>
      </div>

      {sortedSessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <p>暂无会话</p>
        </div>
      ) : (
        <div className="session-list">
          {Object.entries(grouped).map(([projectPath, items]) => (
            <div key={projectPath} className="session-group">
              <div className="group-header">
                <span className="group-name">
                  📁 {projectPath.split(/[/\\]/).pop() || projectPath}
                </span>
                <span className="group-count">{items.length}</span>
              </div>
              {items.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  onClick={() => onEnterChat(session)}
                  onDelete={() => {
                    if (confirm(`删除「${session.title}」？`)) {
                      deleteSession(session.id)
                    }
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
