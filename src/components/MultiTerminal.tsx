import { useEffect, useRef } from 'react'
import { useTerminalStore } from '../stores/terminalStore'
import { useSessionStore } from '../stores/sessionStore'
import '../styles/TerminalPanel.css'

function MultiTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalsContainerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef<Set<string>>(new Set())

  const { sessions, activeSessionId } = useSessionStore()
  const {
    createTerminal,
    switchTerminal,
    resizeTerminal,
    activeTerminalId,
    getTerminal,
  } = useTerminalStore()

  // 为活跃会话创建终端
  useEffect(() => {
    if (!activeSessionId || !terminalsContainerRef.current) return

    const initTerminal = async () => {
      // 检查是否已初始化
      const existingTerminal = getTerminal(activeSessionId)
      if (existingTerminal) {
        // 已存在，只需切换
        switchTerminal(activeSessionId)
        return
      }

      // 创建新的容器div
      const terminalDiv = document.createElement('div')
      terminalDiv.style.width = '100%'
      terminalDiv.style.height = '100%'
      terminalDiv.id = `terminal-${activeSessionId}`
      terminalsContainerRef.current?.appendChild(terminalDiv)

      // 创建终端
      const session = sessions.find((s) => s.id === activeSessionId)
      if (session) {
        try {
          console.log('Creating terminal for session:', session.id)
          await createTerminal(session.id, session.projectPath, terminalDiv)
          initializedRef.current.add(activeSessionId)
          // 直接显示这个终端
          terminalDiv.style.display = 'block'
          console.log('Terminal created successfully')
        } catch (err) {
          console.error('Failed to create terminal:', err)
          terminalDiv.innerHTML = `
            <div style="color: red; padding: 20px;">
              终端创建失败: ${err}
              <br><br>
              请确保 Claude Code 已安装，或检查控制台日志。
            </div>
          `
        }
      }
    }

    initTerminal()
  }, [activeSessionId, sessions, createTerminal, switchTerminal, getTerminal])

  // 切换终端显示
  useEffect(() => {
    if (!activeSessionId) return

    // 隐藏所有终端，显示当前活跃的
    const containers = terminalsContainerRef.current?.children
    if (containers) {
      Array.from(containers).forEach((container) => {
        (container as HTMLElement).style.display =
          container.id === `terminal-${activeSessionId}` ? 'block' : 'none'
      })
    }
  }, [activeSessionId])

  // 窗口大小改变时调整当前终端
  useEffect(() => {
    const handleResize = () => {
      if (activeTerminalId) {
        resizeTerminal(activeTerminalId)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTerminalId, resizeTerminal])

  // 显示提示信息（当没有活跃会话时）
  const renderEmptyState = () => {
    if (activeSessionId) return null

    return (
      <div className="terminal-empty-state">
        <div className="terminal-empty-icon">⌨️</div>
        <div className="terminal-empty-title">欢迎使用 智码 AICoder</div>
        <div className="terminal-empty-desc">请从左侧选择一个会话，或点击"新建会话"开始</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="terminal-panel">
      <div
        ref={terminalsContainerRef}
        className="terminals-container"
      />
      {renderEmptyState()}
    </div>
  )
}

export default MultiTerminal
