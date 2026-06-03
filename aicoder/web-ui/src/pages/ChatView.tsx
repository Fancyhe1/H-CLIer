import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, type Session, type ChatMessage } from '../api/client'
import { SwipeBack } from '../components/SwipeBack'
import { notificationManager } from '../utils/notifications'

interface ChatViewProps {
  session: Session
  onBack: () => void
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const timeStr = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const textContent = message.content
    .filter(b => b.blockType === 'text' && b.text)
    .map(b => b.text)
    .join('\n')

  const thinkingContent = message.content
    .filter(b => b.blockType === 'thinking' && b.thinking)
    .map(b => b.thinking)
    .join('\n')

  const toolUses = message.content.filter(b => b.blockType === 'tool_use')

  if (!textContent && !thinkingContent && toolUses.length === 0) return null

  return (
    <div className={`chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-assistant'}`}>
      <div className="chat-avatar">{isUser ? '👤' : '🤖'}</div>
      <div className="chat-bubble-wrap">
        <div className="chat-bubble">
          {thinkingContent && (
            <details className="chat-thinking">
              <summary>💭 思考</summary>
              <div className="chat-thinking-content">{thinkingContent}</div>
            </details>
          )}
          {toolUses.length > 0 && (
            <div className="chat-tools">
              {toolUses.map((t, i) => (
                <span key={i} className="chat-tool-tag">🔧 {t.toolName}</span>
              ))}
            </div>
          )}
          {textContent && (
            <div className="chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
            </div>
          )}
        </div>
        <div className="chat-time">{timeStr}</div>
      </div>
    </div>
  )
}

export default function ChatView({ session, onBack }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const history = await api.getSessionHistory(session.id)
      setMessages(history)
    } catch {} finally {
      setLoading(false)
    }
  }, [session.id])

  useEffect(() => {
    // 进入会话时，先通知桌面端打开会话（创建 PTY 并启动 Claude）
    const activateAndLoad = async () => {
      try {
        await api.activateSession(session.id)
      } catch (e) {
        console.error('Failed to activate session:', e)
      }
      await loadHistory()
    }
    activateAndLoad()
  }, [session.id, loadHistory])

  // 轮询新消息
  useEffect(() => {
    let lastMessageCount = messages.length
    const timer = setInterval(async () => {
      try {
        const history = await api.getSessionHistory(session.id)
        if (history.length > lastMessageCount) {
          // 有新消息
          const newMessages = history.slice(lastMessageCount)
          const assistantMessages = newMessages.filter(m => m.role === 'assistant')
          if (assistantMessages.length > 0) {
            notificationManager.notifyNewMessage(session.title)
          }
          lastMessageCount = history.length
        }
        setMessages(prev => history.length !== prev.length ? history : prev)
      } catch {}
    }, 3000)
    return () => clearInterval(timer)
  }, [session.id, session.title])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)

    try {
      // 终端中 Enter 是 \r，不是 \n
      await api.sendTerminalInput(session.id, text + '\r')
      // 延迟刷新消息，等待 Claude 响应
      setTimeout(() => {
        loadHistory()
        setSending(false)
      }, 3000)
    } catch (e) {
      console.error('Send failed:', e)
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <SwipeBack onSwipeBack={onBack}>
    <div className="chat-view">
      <div className="chat-header">
        <button className="btn-back" onClick={onBack}>←</button>
        <div className="chat-header-info">
          <span className="chat-header-icon">
            {session.sessionType === 'claude' ? '🤖' : '💻'}
          </span>
          <span className="chat-header-title">{session.title}</span>
        </div>
      </div>

      <div className="chat-messages">
        {loading ? (
          <div className="chat-loading">加载中...</div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p>发送消息开始对话</p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={sending ? '等待响应中...' : '输入消息...'}
          rows={1}
        />
        <button
          type="button"
          className="chat-send-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleSend()}
          disabled={sending || !input.trim()}
        >
          {sending ? '...' : '发送'}
        </button>
      </div>
    </div>
    </SwipeBack>
  )
}
