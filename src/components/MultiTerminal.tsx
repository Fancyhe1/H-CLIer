import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useSessionStore } from '../stores/sessionStore'
import '@xterm/xterm/css/xterm.css'
import '../styles/TerminalPanel.css'

interface TerminalInstance {
  term: Terminal
  fitAddon: FitAddon
  ptyId: string
  unlisten: () => void
}

function MultiTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalsRef = useRef<Map<string, TerminalInstance>>(new Map())

  const { sessions, activeSessionId } = useSessionStore()

  // 创建终端
  useEffect(() => {
    if (!activeSessionId || !containerRef.current) return

    // 已存在则切换
    if (terminalsRef.current.has(activeSessionId)) {
      showTerminal(activeSessionId)
      return
    }

    const session = sessions.find(s => s.id === activeSessionId)
    if (!session) return

    // 创建终端容器
    const terminalDiv = document.createElement('div')
    terminalDiv.id = `terminal-${activeSessionId}`
    terminalDiv.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;'
    containerRef.current.appendChild(terminalDiv)

    // 初始化 xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
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
    terminalsRef.current.set(activeSessionId, { term, fitAddon, ptyId: '', unlisten: () => {} })

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

          // 新会话用 --session-id，重开用 --resume
          const cmd = isNewSession
            ? `claude --session-id "${cliSessionId}"\r`
            : `claude --resume "${cliSessionId}"\r`

          await invoke('write_to_pty', { ptyId, data: cmd })
        }

        showTerminal(activeSessionId)
      } catch (err) {
        console.error('Terminal init error:', err)
        term.writeln(`\x1b[1;31m错误: ${err}\x1b[0m`)
      }
    })()

  }, [activeSessionId, sessions])

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

  return (
    <div ref={containerRef} className="terminal-panel" style={{ position: 'relative' }}>
      {!activeSessionId && (
        <div className="terminal-empty-state">
          <div className="terminal-empty-icon">⌨️</div>
          <div className="terminal-empty-title">欢迎使用 智码 AICoder</div>
          <div className="terminal-empty-desc">请从左侧选择一个会话，或点击"新建会话"开始</div>
        </div>
      )}
    </div>
  )
}

export default MultiTerminal
