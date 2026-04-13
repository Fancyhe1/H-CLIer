import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import '@xterm/xterm/css/xterm.css'
import '../styles/TerminalPanel.css'

interface TerminalInstance {
  term: Terminal
  fitAddon: FitAddon
  ptyId: string
  unlisten: () => void
  sessionId: string
}

function MultiTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalsRef = useRef<Map<string, TerminalInstance>>(new Map())
  // 用于记录创建终端时的配置，避免配置变化时重新创建
  const createdSessionIdsRef = useRef<Set<string>>(new Set())
  // 记录上一次的会话 cliSessionId 状态
  const prevSessionsStateRef = useRef<Map<string, string | undefined>>(new Map())

  const { sessions, activeSessionId } = useSessionStore()
  const { config } = useSettingsStore()

  // 销毁指定会话的终端
  const disposeTerminal = async (sessionId: string) => {
    const instance = terminalsRef.current.get(sessionId)
    if (instance) {
      instance.unlisten()
      if (instance.ptyId) {
        await invoke('close_pty', { ptyId: instance.ptyId }).catch(console.error)
      }
      instance.term.dispose()

      // 移除 DOM 元素
      const terminalDiv = document.getElementById(`terminal-${sessionId}`)
      if (terminalDiv && terminalDiv.parentNode) {
        terminalDiv.parentNode.removeChild(terminalDiv)
      }

      terminalsRef.current.delete(sessionId)
    }
  }

  // 监听会话关闭状态变化，销毁已关闭会话的终端
  useEffect(() => {
    const prevStates = prevSessionsStateRef.current
    const currentStates = new Map<string, string | undefined>()

    sessions.forEach(session => {
      currentStates.set(session.id, session.cliSessionId)

      // 检测 cliSessionId 从有到无（会话被关闭）
      const prevCliSessionId = prevStates.get(session.id)
      if (prevCliSessionId && !session.cliSessionId) {
        // 会话被关闭，销毁终端
        disposeTerminal(session.id)
        createdSessionIdsRef.current.delete(session.id)
      }
    })

    prevSessionsStateRef.current = currentStates
  }, [sessions])

  // 当 activeSessionId 变为 null 时，确保没有终端显示
  useEffect(() => {
    if (!activeSessionId) {
      // 隐藏所有终端
      if (containerRef.current) {
        const children = containerRef.current.children
        for (let i = 0; i < children.length; i++) {
          const child = children[i] as HTMLElement
          child.style.display = 'none'
        }
      }
    }
  }, [activeSessionId])

  // 创建终端
  useEffect(() => {
    if (!activeSessionId || !containerRef.current) return

    const session = sessions.find(s => s.id === activeSessionId)
    if (!session) return

    // 如果已有终端实例
    const existingInstance = terminalsRef.current.get(activeSessionId)
    if (existingInstance) {
      // 检查会话是否已关闭（cliSessionId 被清除）
      if (session.sessionType === 'claude' && !session.cliSessionId) {
        // 销毁旧终端，准备创建新终端（重新启动会话）
        disposeTerminal(activeSessionId)
        createdSessionIdsRef.current.delete(activeSessionId)
        // 继续往下执行，创建新终端
      } else {
        // 会话仍然活跃，只切换显示
        showTerminal(activeSessionId)
        return
      }
    }

    // 如果终端存在且没有被销毁，不再重复创建
    if (terminalsRef.current.has(activeSessionId)) {
      showTerminal(activeSessionId)
      return
    }

    // 标记为已创建
    createdSessionIdsRef.current.add(activeSessionId)

    // 从 store 获取当前配置（只在创建时读取一次）
    const currentConfig = useSettingsStore.getState().config
    const fontSize = currentConfig?.general?.terminal_font_size || 14

    // 创建终端容器
    const terminalDiv = document.createElement('div')
    terminalDiv.id = `terminal-${activeSessionId}`
    terminalDiv.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;'
    containerRef.current.appendChild(terminalDiv)

    // 初始化 xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
      rows: 30,
      cols: 80,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalDiv)
    fitAddon.fit()

    // 创建终端实例（先保存，后续填充ptyId和unlisten）
    terminalsRef.current.set(activeSessionId, { term, fitAddon, ptyId: '', unlisten: () => {}, sessionId: activeSessionId })

    // 异步初始化PTY
    ;(async () => {
      try {
        // 创建 PTY
        const dims = fitAddon.proposeDimensions()
        const ptyId = await invoke<string>('create_pty', {
          sessionId: activeSessionId,
          cols: dims?.cols || 80,
          rows: dims?.rows || 30,
        })

        // 监听 PTY 输出
        const unlisten = await listen<string>(`pty-output-${ptyId}`, (event) => {
          term.write(event.payload)
        })

        // 更新实例
        const instance = terminalsRef.current.get(activeSessionId)
        if (instance) {
          instance.ptyId = ptyId
          instance.unlisten = unlisten
        }

        // 启动 PowerShell
        await invoke('spawn_command_in_pty', {
          ptyId,
          command: 'powershell.exe',
          args: [],
          cwd: session.projectPath,
        })

        // 处理用户输入
        term.onData((data) => {
          invoke('write_to_pty', { ptyId, data }).catch(console.error)
        })

        // Claude 会话：自动启动
        if (session.sessionType === 'claude') {
          const isNewSession = !session.cliSessionId
          const cliSessionId = session.cliSessionId || activeSessionId

          // 保存 cliSessionId（标记会话已开启）
          if (isNewSession) {
            useSessionStore.getState().updateSession({ ...session, cliSessionId })
          }

          // 等待 PowerShell 启动
          await new Promise(r => setTimeout(r, 500))

          // 从当前配置获取 Claude 路径和参数
          const claudeCmd = currentConfig?.claude?.cli_path || 'claude'
          const claudeArgs = currentConfig?.claude?.default_args || []

          // 新会话用 --session-id，重开用 --resume
          let cmd: string
          if (isNewSession) {
            cmd = claudeArgs.length > 0
              ? `${claudeCmd} --session-id "${cliSessionId}" ${claudeArgs.join(' ')}\r`
              : `${claudeCmd} --session-id "${cliSessionId}"\r`
          } else {
            cmd = claudeArgs.length > 0
              ? `${claudeCmd} --resume "${cliSessionId}" ${claudeArgs.join(' ')}\r`
              : `${claudeCmd} --resume "${cliSessionId}"\r`
          }

          await invoke('write_to_pty', { ptyId, data: cmd })
        }

        showTerminal(activeSessionId)
      } catch (err) {
        console.error('Terminal init error:', err)
        term.writeln(`\x1b[1;31m错误: ${err}\x1b[0m`)
      }
    })()

  }, [activeSessionId, sessions]) // 移除 config 依赖

  // 当字体大小配置变化时，更新所有已存在终端的字体大小
  useEffect(() => {
    const fontSize = config?.general?.terminal_font_size || 14
    terminalsRef.current.forEach((instance) => {
      instance.term.options.fontSize = fontSize
      instance.fitAddon.fit()
    })
  }, [config?.general?.terminal_font_size])

  // 显示指定终端，隐藏其他
  const showTerminal = (sessionId: string) => {
    if (!containerRef.current) return
    const children = containerRef.current.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      child.style.display = child.id === `terminal-${sessionId}` ? 'block' : 'none'
    }

    // 调整大小
    const instance = terminalsRef.current.get(sessionId)
    if (instance) {
      instance.fitAddon.fit()
    }
  }

  // 切换终端显示
  useEffect(() => {
    if (activeSessionId) {
      showTerminal(activeSessionId)
    }
  }, [activeSessionId])

  // 清理
  useEffect(() => {
    return () => {
      terminalsRef.current.forEach((instance) => {
        instance.unlisten()
        if (instance.ptyId) {
          invoke('close_pty', { ptyId: instance.ptyId }).catch(console.error)
        }
        instance.term.dispose()
      })
      terminalsRef.current.clear()
    }
  }, [])

  // 点击新建会话
  const handleNewSession = () => {
    const btn = document.querySelector(
      '[data-testid="new-session-btn"]'
    ) as HTMLButtonElement
    btn?.click()
  }

  // 判断是否应该显示空状态
  const showEmptyState = !activeSessionId || sessions.length === 0

  return (
    <div className="terminal-panel" style={{ position: 'relative' }}>
      <div ref={containerRef} className="terminals-container" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {showEmptyState && (
        <div className="terminal-empty-state">
          <div className="terminal-empty-icon">🚀</div>
          <div className="terminal-empty-title">智码 AICoder</div>
          <div className="terminal-empty-desc">AI 驱动的智能编程助手</div>
          <div className="terminal-empty-hint" onClick={handleNewSession}>
            <span className="terminal-empty-hint-icon">+</span>
            <span className="terminal-empty-hint-text">新建会话</span>
          </div>
          <div className="terminal-empty-shortcut">
            快捷键：<kbd>Ctrl</kbd> + <kbd>K</kbd>
          </div>
        </div>
      )}
    </div>
  )
}

export default MultiTerminal
