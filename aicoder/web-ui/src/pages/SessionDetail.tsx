import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import type { ChatMessage, ContentBlock } from '../api/client'

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.blockType) {
    case 'text':
      return <div className="content-text">{block.text}</div>
    case 'thinking':
      return (
        <details className="content-thinking">
          <summary>💭 思考过程</summary>
          <pre>{block.thinking}</pre>
        </details>
      )
    case 'tool_use':
      return (
        <div className="content-tool">
          <span className="tool-icon">🔧</span>
          <span className="tool-name">{block.toolName}</span>
        </div>
      )
    case 'tool_result':
      return (
        <div className="content-tool-result">
          <span className="tool-icon">📋</span>
          <pre>{block.toolResult}</pre>
        </div>
      )
    default:
      return <div className="content-unknown">[{block.blockType}]</div>
  }
}

function MessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const timeStr = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-header">
        <span className="message-role">{isUser ? '👤 用户' : '🤖 Claude'}</span>
        <span className="message-time">{timeStr}</span>
      </div>
      <div className="message-content">
        {message.content.map((block, i) => (
          <ContentBlockView key={i} block={block} />
        ))}
      </div>
    </div>
  )
}

export default function SessionDetail() {
  const {
    sessions, activeSessionId, chatHistory, tokenUsage,
    setActiveSession, fetchHistory,
  } = useSessionStore()

  const session = sessions.find(s => s.id === activeSessionId)

  useEffect(() => {
    if (activeSessionId) {
      fetchHistory(activeSessionId)
    }
  }, [activeSessionId, fetchHistory])

  if (!session) {
    return (
      <div className="detail-empty">
        <div className="empty-icon">👈</div>
        <p>选择一个会话查看详情</p>
      </div>
    )
  }

  return (
    <div className="session-detail-page">
      <div className="detail-header">
        <button className="btn-back" onClick={() => setActiveSession(null)}>
          ← 返回
        </button>
        <div className="detail-title">
          <span className="detail-icon">
            {session.sessionType === 'claude' ? '🤖' : '💻'}
          </span>
          <h3>{session.title}</h3>
        </div>
      </div>

      {/* Token 统计卡片 */}
      {tokenUsage && (
        <div className="token-card">
          <div className="token-row">
            <span className="token-label">输入 Tokens</span>
            <span className="token-value">{tokenUsage.inputTokens.toLocaleString()}</span>
          </div>
          <div className="token-row">
            <span className="token-label">输出 Tokens</span>
            <span className="token-value">{tokenUsage.outputTokens.toLocaleString()}</span>
          </div>
          <div className="token-row">
            <span className="token-label">费用</span>
            <span className="token-value cost">${tokenUsage.cost.toFixed(4)}</span>
          </div>
          {tokenUsage.model && (
            <div className="token-row">
              <span className="token-label">模型</span>
              <span className="token-value model">{tokenUsage.model}</span>
            </div>
          )}
        </div>
      )}

      {/* 聊天历史 */}
      <div className="chat-history">
        <div className="history-header">
          <h4>聊天记录 ({chatHistory.length})</h4>
          <button className="btn-refresh-sm" onClick={() => fetchHistory(session.id)}>
            🔄
          </button>
        </div>

        {chatHistory.length === 0 ? (
          <div className="empty-history">
            <p>暂无聊天记录</p>
          </div>
        ) : (
          <div className="messages-list">
            {chatHistory.map((msg) => (
              <MessageView key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
