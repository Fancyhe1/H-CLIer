import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Spin, Empty, Button, Tooltip, Input } from 'antd'
import { ReloadOutlined, ArrowDownOutlined, SendOutlined } from '@ant-design/icons'
import { useTerminalStore } from '../stores/terminalStore'
import type { ChatMessage, ContentBlock } from '../types/history'
import '../styles/MarkdownPanel.css'

const { TextArea } = Input

interface MarkdownPanelProps {
  sessionId: string | undefined
  projectPath: string | undefined
}

export default function MarkdownPanel({ sessionId, projectPath }: MarkdownPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 提取消息文本内容
  const extractText = useCallback((content: ContentBlock[]): string => {
    return content
      .filter(block => block.blockType === 'text' && block.text)
      .map(block => block.text)
      .join('\n')
  }, [])

  // 加载会话消息
  const loadMessages = useCallback(async () => {
    if (!sessionId || !projectPath) {
      setMessages([])
      return
    }

    setLoading(true)
    try {
      const history = await invoke<ChatMessage[]>('read_session_history', {
        sessionId,
        projectPath
      })

      // 只保留用户和助手的消息，过滤掉只有 tool_use 的消息
      const filteredMessages = history.filter(msg => {
        const text = extractText(msg.content)
        return text.trim().length > 0
      })

      setMessages(filteredMessages)
    } catch (error) {
      console.error('Failed to load session history:', error)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [sessionId, projectPath, extractText])

  // 初始加载
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // 监听 PTY 输出事件 + 定期轮询，确保消息及时更新
  useEffect(() => {
    if (!sessionId) return

    // 监听 PTY 输出事件
    const unlisten = listen<string>(`pty-output-${sessionId}`, () => {
      // 使用防抖，避免频繁刷新
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
      loadTimeoutRef.current = setTimeout(() => {
        loadMessages()
      }, 800)
    })

    // 定期轮询（每 2 秒读取一次文件）
    const pollInterval = setInterval(() => {
      loadMessages()
    }, 2000)

    return () => {
      unlisten.then(fn => fn())
      clearInterval(pollInterval)
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
    }
  }, [sessionId, loadMessages])

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, autoScroll])

  // 监听滚动事件，判断是否需要自动滚动
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }, [])

  // 手动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setAutoScroll(true)
  }, [])

  // 发送消息到 PTY
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !sessionId) return

    setSending(true)
    try {
      // 从终端存储获取 ptyId
      // 注意：sessionId 可能不是 ptyId，需要从终端实例获取
      const terminalState = useTerminalStore.getState()
      const terminalInstance = terminalState.terminals.get(sessionId)
      const ptyId = terminalInstance?.ptyId || sessionId

      // 发送输入到 PTY（添加回车符）
      await invoke('write_to_pty', {
        ptyId,
        data: inputValue + '\r'
      })

      // 清空输入框
      setInputValue('')

      // 延迟刷新消息列表
      setTimeout(() => loadMessages(), 500)
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }, [inputValue, sessionId, loadMessages])

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 渲染代码块
  const renderCodeBlock = useCallback(({ className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''

    // 内联代码
    if (!match) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }

    return (
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        custom={{
          margin: '8px 0',
          borderRadius: '6px',
          fontSize: '13px'
        }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    )
  }, [])

  // 渲染单条消息
  const renderMessage = useCallback((message: ChatMessage) => {
    const isUser = message.role === 'user'
    const timestamp = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })

    // 提取 thinking 内容
    const thinkingBlocks = message.content.filter(
      block => block.blockType === 'thinking' && block.thinking
    )

    // 提取 text 内容
    const textBlocks = message.content.filter(
      block => block.blockType === 'text' && block.text
    )

    // 如果只有 tool_use 没有 text，跳过
    if (textBlocks.length === 0 && !isUser) return null

    const text = textBlocks.map(block => block.text).join('\n')

    return (
      <div key={message.id} className={`message-row ${isUser ? 'user' : 'assistant'}`}>
        <div className="message-bubble">
          <div className="message-header">
            <span className="message-role">{isUser ? '你' : 'Claude'}</span>
            <span className="message-time">{timestamp}</span>
          </div>

          {/* 思考过程（可折叠） */}
          {thinkingBlocks.length > 0 && (
            <details className="thinking-section">
              <summary className="thinking-summary">
                🧠 思考过程 ({thinkingBlocks.length} 个步骤)
              </summary>
              <div className="thinking-content">
                {thinkingBlocks.map((block, index) => (
                  <div key={index} className="thinking-block">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {block.thinking!}
                    </ReactMarkdown>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* 消息内容 */}
          {text.trim() && (
            <div className="message-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ code: renderCodeBlock }}
              >
                {text}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    )
  }, [renderCodeBlock])

  // 空状态
  if (!sessionId || !projectPath) {
    return (
      <div className="markdown-panel empty">
        <Empty
          description="请先选择一个会话"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    )
  }

  return (
    <div className="markdown-panel">
      {/* 工具栏 */}
      <div className="markdown-toolbar">
        <div className="toolbar-left">
          <span className="message-count">{messages.length} 条消息</span>
        </div>
        <div className="toolbar-right">
          <Tooltip title="刷新">
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={loadMessages}
              loading={loading}
              size="small"
            />
          </Tooltip>
          <Tooltip title={autoScroll ? '已开启自动滚动' : '点击开启自动滚动'}>
            <Button
              type={autoScroll ? 'primary' : 'text'}
              icon={<ArrowDownOutlined />}
              onClick={scrollToBottom}
              size="small"
            />
          </Tooltip>
        </div>
      </div>

      {/* 消息列表 */}
      <div
        className="markdown-messages"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {loading && messages.length === 0 ? (
          <div className="loading-container">
            <Spin tip="加载中..." />
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-container">
            <Empty description="暂无对话记录" />
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 输入区域 */}
      <div className="markdown-input-area">
        <TextArea
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoSize={{ minRows: 1, maxRows: 6 }}
          disabled={sending}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={sending}
          disabled={!inputValue.trim()}
        >
          发送
        </Button>
      </div>
    </div>
  )
}
