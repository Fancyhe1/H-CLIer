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

  const { sessions, activeSessionId, closedSessionId, setClosedSession } = useSessionStore()
  const { config, currentTheme } = useSettingsStore()

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
      createdSessionIdsRef.current.delete(sessionId)
    }
  }

  // 监听关闭会话事件
  useEffect(() => {
    if (closedSessionId) {
      disposeTerminal(closedSessionId)
      setClosedSession(null)  // 清除关闭标记
    }
  }, [closedSessionId])

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

    // 如果已有终端实例，直接显示
    const existingInstance = terminalsRef.current.get(activeSessionId)
    if (existingInstance) {
      showTerminal(activeSessionId)
      return
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

    // 初始化 xterm - 根据当前主题设置颜色
    const themeState = useSettingsStore.getState()
    const isDark = themeState.currentTheme === 'dark'
    const termTheme = isDark
      ? { background: '#000000', foreground: '#d4d4d4' }
      : { background: '#ffffff', foreground: '#333333' }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: termTheme,
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

    // 标记会话为运行状态
    useSessionStore.getState().setSessionRunning(activeSessionId, true)

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
          const cliSessionId = session.cliSessionId || activeSessionId

          // 保存 cliSessionId（标记会话已开启）
          if (!session.cliSessionId) {
            useSessionStore.getState().updateSession({ ...session, cliSessionId })
          }

          // 等待 PowerShell 启动
          await new Promise(r => setTimeout(r, 500))

          // 检查 Claude 会话是否存在
          const sessionExists = await invoke<boolean>('check_claude_session_exists', {
            sessionId: cliSessionId,
            projectPath: session.projectPath,
          })

          // 从当前配置获取 Claude 路径和参数
          const claudeCmd = currentConfig?.claude?.cli_path || 'claude'
          const claudeArgs = currentConfig?.claude?.default_args || []

          // 根据会话是否存在决定使用 --resume 还是 --session-id
          let cmd: string
          if (sessionExists) {
            // 会话已存在，使用 --resume 恢复
            cmd = claudeArgs.length > 0
              ? `${claudeCmd} --resume "${cliSessionId}" ${claudeArgs.join(' ')}\r`
              : `${claudeCmd} --resume "${cliSessionId}"\r`
          } else {
            // 会话不存在，使用 --session-id 创建
            cmd = claudeArgs.length > 0
              ? `${claudeCmd} --session-id "${cliSessionId}" ${claudeArgs.join(' ')}\r`
              : `${claudeCmd} --session-id "${cliSessionId}"\r`
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

  // 当主题变化时，更新所有已存在终端的颜色
  useEffect(() => {
    const isDark = currentTheme === 'dark'
    const termTheme = isDark
      ? { background: '#000000', foreground: '#d4d4d4' }
      : { background: '#ffffff', foreground: '#333333' }
    terminalsRef.current.forEach((instance) => {
      instance.term.options.theme = termTheme
    })
  }, [currentTheme])

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
          <div className="terminal-empty-title">H CLIer</div>
          <div className="terminal-empty-desc">Claude Code Session Manager & Workbench</div>
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
