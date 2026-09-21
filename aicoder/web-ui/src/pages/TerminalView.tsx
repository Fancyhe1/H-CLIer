import { useState, useEffect, useRef, useCallback } from 'react'
import { api, type Session } from '../api/client'

interface TerminalViewProps {
  session: Session
  onBack: () => void
}

export default function TerminalView({ session, onBack }: TerminalViewProps) {
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [])

  // 加载历史内容 + 建立 WebSocket 连接
  useEffect(() => {
    let ws: WebSocket | null = null

    const connect = async () => {
      // 先加载历史内容
      try {
        const history = await api.getTerminalHistory(session.id)
        if (history) {
          setOutput(history)
          setTimeout(scrollToBottom, 100)
        }
      } catch {
        // 没有历史内容
      }

      // 建立 WebSocket 连接
      const wsUrl = api.getTerminalWsUrl(session.id)
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
      }

      ws.onmessage = (event) => {
        setOutput(prev => prev + event.data)
        setTimeout(scrollToBottom, 50)
      }

      ws.onclose = () => {
        setConnected(false)
      }

      ws.onerror = () => {
        setConnected(false)
      }
    }

    connect()

    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [session.id, scrollToBottom])

  // 发送输入
  const handleSend = async () => {
    if (!input.trim() || sending) return

    const data = input
    setInput('')
    setSending(true)

    try {
      await api.sendTerminalInput(session.id, data + '\n')
    } catch (e) {
      console.error('Failed to send input:', e)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  // 快捷键处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 格式化终端输出（ANSI 颜色等简化处理）
  const formatOutput = (text: string) => {
    // 移除 ANSI 转义序列，保留文本
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  }

  return (
    <div className="terminal-view">
      {/* 顶栏 */}
      <div className="terminal-header">
        <button className="btn-back" onClick={onBack}>← 返回</button>
        <div className="terminal-title">
          <span className="terminal-icon">
            {session.sessionType === 'claude' ? '🤖' : '💻'}
          </span>
          <span>{session.title}</span>
        </div>
        <div className={`terminal-status ${connected ? 'online' : 'offline'}`}>
          {connected ? '● 已连接' : '○ 未连接'}
        </div>
      </div>

      {/* 终端输出区 */}
      <div className="terminal-output" ref={outputRef}>
        <pre>{formatOutput(output)}</pre>
      </div>

      {/* 输入区 */}
      <div className="terminal-input-bar">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={connected ? '输入指令...' : '等待连接...'}
          disabled={!connected || sending}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button
          className="btn-send"
          onClick={handleSend}
          disabled={!connected || sending || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  )
}
