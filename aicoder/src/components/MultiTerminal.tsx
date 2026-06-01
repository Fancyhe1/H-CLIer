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
  // 用于标记此终端是否应该在收到输出时标记未读
  shouldMarkUnread: boolean
}

// 剥离ANSI转义序列，检查是否包含有意义的可见文本
function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')   // CSI序列（颜色、光标移动等）
    .replace(/\x1b\][^\x07]*\x07/g, '')       // OSC序列
    .replace(/\x1b[()][AB012]/g, '')          // 字符集选择
    .replace(/\x1b\[\?25[hl]/g, '')           // 光标显示/隐藏
    .replace(/\x1b\[\?1049[hl]/g, '')         // 备选屏幕缓冲区
    .replace(/\x1b[>=]/g, '')                 // 应用/普通键盘模式
    .replace(/\x1b[78]/g, '')                 // 保存/恢复光标
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // 控制字符（保留\n和\r）
    .trim()
}

function MultiTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalsRef = useRef<Map<string, TerminalInstance>>(new Map())
  // 用于记录创建终端时的配置，避免配置变化时重新创建
  const createdSessionIdsRef = useRef<Set<string>>(new Set())

  const { sessions, activeSessionId, closedSessionId, setClosedSession } = useSessionStore()
  const { config, currentTheme } = useSettingsStore()

  // 销毁指定会话的终端（真正关闭会话时调用）
  const destroyTerminal = async (sessionId: string) => {
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

  // 监听关闭会话事件（真正销毁）
  useEffect(() => {
    if (closedSessionId) {
      destroyTerminal(closedSessionId)
      setClosedSession(null)  // 清除关闭标记
    }
  }, [closedSessionId])

  // 监听常用语追加事件
  useEffect(() => {
    const handleAppendToTerminal = (e: Event) => {
      const customEvent = e as CustomEvent
      const text = customEvent.detail?.text
      if (!text || !activeSessionId) return

      const instance = terminalsRef.current.get(activeSessionId)
      if (instance?.ptyId) {
        invoke('write_to_pty', { ptyId: instance.ptyId, data: text })
      }
    }

    window.addEventListener('append-to-terminal', handleAppendToTerminal)
    return () => window.removeEventListener('append-to-terminal', handleAppendToTerminal)
  }, [activeSessionId])

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

    // 从当前 sessions 获取会话信息
    const currentSessions = useSessionStore.getState().sessions
    const session = currentSessions.find(s => s.id === activeSessionId)
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
    // 新创建的终端默认应该追踪未读（只有当前会话不需要标记）
    terminalsRef.current.set(activeSessionId, { term, fitAddon, ptyId: '', unlisten: () => {}, sessionId: activeSessionId, shouldMarkUnread: true })

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

        // 监听 PTY 输出 - 使用延迟标记策略
        // 原理：输出开始时不标记，等输出停止3秒后才标记未读
        // 只有包含可见文本内容（非纯ANSI转义序列）的输出才触发标记
        let outputTimer: ReturnType<typeof setTimeout> | null = null
        const unlisten = await listen<string>(`pty-output-${ptyId}`, (event) => {
          term.write(event.payload)

          // 如果这个终端需要标记未读（后台运行），且有新输出
          const instance = terminalsRef.current.get(activeSessionId)
          if (instance && instance.shouldMarkUnread && event.payload) {
            // 剥离ANSI转义序列，检查是否包含有意义的可见文本
            const visibleContent = stripAnsi(event.payload)
            if (!visibleContent) return // 纯转义序列，忽略

            // 每次收到有意义的输出都重置定时器
            if (outputTimer) {
              clearTimeout(outputTimer)
            }
            // 输出停止3秒后才标记未读
            outputTimer = setTimeout(() => {
              const currentInstance = terminalsRef.current.get(activeSessionId)
              if (currentInstance && currentInstance.shouldMarkUnread) {
                useSessionStore.getState().setHasUnread(activeSessionId, true)
              }
            }, 3000)
          }
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

        // 键盘快捷键拦截
        // 使用 attachCustomKeyEventHandler 在 xterm 处理之前拦截按键
        let lastPasteTime = 0
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          // Ctrl+C 复制选中内容，无选中时发送中断信号
          if (e.ctrlKey && e.key === 'c') {
            const selection = term.getSelection()
            if (selection) {
              e.preventDefault()
              e.stopPropagation()
              navigator.clipboard.writeText(selection).catch(() => {})
              return false // 阻止 xterm 处理（不发送 \x03）
            }
            return true // 无选中时让 xterm 正常处理（发送中断信号）
          }

          // Ctrl+V 粘贴
          if (e.ctrlKey && e.key === 'v') {
            const now = Date.now()
            if (now - lastPasteTime < 400) return false
            lastPasteTime = now
            e.preventDefault()
            navigator.clipboard.readText().then((text) => {
              if (text) {
                invoke('write_to_pty', { ptyId, data: text })
              }
            }).catch(() => {})
            return false // 阻止 xterm 处理
          }

          // 全局快捷键：拦截需要在终端聚焦时也能工作的快捷键
          // 通过自定义事件转发给 App.tsx 的全局处理器
          const globalShortcuts = [
            { ctrl: true, shift: false, key: 'k' },  // 命令面板
            { ctrl: true, shift: false, key: 'n' },  // 新建会话
            { ctrl: true, shift: false, key: 'w' },  // 关闭会话
            { ctrl: true, shift: true, key: 'T' },   // Token 统计
            { ctrl: true, shift: true, key: 'P' },   // 窗口置顶
          ]

          for (const shortcut of globalShortcuts) {
            if (
              e.ctrlKey === shortcut.ctrl &&
              e.shiftKey === shortcut.shift &&
              e.key.toLowerCase() === shortcut.key.toLowerCase()
            ) {
              e.preventDefault()
              e.stopPropagation()
              window.dispatchEvent(
                new CustomEvent('global-shortcut', { detail: { originalEvent: e } })
              )
              return false // 阻止 xterm 处理
            }
          }

          return true
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

  }, [activeSessionId]) // 只依赖 activeSessionId，不依赖 sessions

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

  // 显示指定终端，隐藏其他（纯 DOM 操作，不触发状态更新）
  const showTerminal = (sessionId: string) => {
    if (!containerRef.current) return

    // 先把所有其他终端设置为"标记未读"模式（它们在后台运行）
    terminalsRef.current.forEach((instance, id) => {
      if (id !== sessionId) {
        instance.shouldMarkUnread = true
      }
    })

    const children = containerRef.current.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      child.style.display = child.id === `terminal-${sessionId}` ? 'block' : 'none'
    }

    // 调整大小
    const instance = terminalsRef.current.get(sessionId)
    if (instance) {
      instance.shouldMarkUnread = false  // 当前显示的终端不标记未读
      instance.fitAddon.fit()
    }
  }

  // 清除未读标记（在 useEffect 外调用，避免循环）
  const clearUnread = (sessionId: string) => {
    useSessionStore.getState().setHasUnread(sessionId, false)
  }

  // 切换终端显示
  useEffect(() => {
    if (activeSessionId) {
      showTerminal(activeSessionId)
      // 延迟清除未读，避免触发 sessions 更新导致循环
      setTimeout(() => clearUnread(activeSessionId), 0)
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
          <div className="terminal-empty-desc">AI-Powered CLI Coding Assistant</div>
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
