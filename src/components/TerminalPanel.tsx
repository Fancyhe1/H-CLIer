import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import '@xterm/xterm/css/xterm.css'
import '../styles/TerminalPanel.css'

interface TerminalPanelProps {
  sessionId?: string
  projectPath?: string
}

function TerminalPanel({ sessionId, projectPath }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)

  // 创建PTY并启动终端
  const initTerminal = useCallback(async () => {
    if (!terminalRef.current) return

    // 初始化xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
      rows: 30,
      cols: 80,
      allowProposedApi: true,
      // 启用选择功能
      rightClickSelectsWord: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    // 创建PTY
    try {
      const dims = fitAddon.proposeDimensions()
      const ptyId = await invoke<string>('create_pty', {
        sessionId: sessionId || 'default',
        cols: dims?.cols || 80,
        rows: dims?.rows || 30,
      })
      ptyIdRef.current = ptyId

      // 监听PTY输出事件
      const unlisten = await listen<string>(`pty-output-${ptyId}`, (event) => {
        if (xtermRef.current) {
          xtermRef.current.write(event.payload)
        }
      })
      unlistenRef.current = unlisten

      // 启动命令提示符或Claude Code
      if (projectPath) {
        // 尝试启动Claude Code
        const hasClaude = await invoke<boolean>('check_claude_installation')
        if (hasClaude) {
          term.writeln('\x1b[1;32m正在启动 Claude Code...\x1b[0m')
          await invoke('spawn_command_in_pty', {
            ptyId,
            command: 'claude',
            args: [],
            cwd: projectPath,
          })
        } else {
          term.writeln('\x1b[33m提示: Claude Code 未安装，启动普通终端\x1b[0m')
          // 启动默认shell
          const shell = 'powershell.exe'
          await invoke('spawn_command_in_pty', {
            ptyId,
            command: shell,
            args: [],
            cwd: projectPath,
          })
        }
      } else {
        term.writeln('\x1b[1;32m欢迎使用 H CLIer\x1b[0m')
        term.writeln('\x1b[90m请选择一个会话或创建新会话开始\x1b[0m')
        term.writeln('')
      }
    } catch (err) {
      term.writeln(`\x1b[1;31m错误: ${err}\x1b[0m`)
    }

    // 处理输入
    term.onData((data) => {
      if (ptyIdRef.current) {
        invoke('write_to_pty', {
          ptyId: ptyIdRef.current,
          data,
        }).catch(console.error)
      }
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // 右键复制粘贴
    terminalRef.current.addEventListener('contextmenu', async (e) => {
      e.preventDefault()
      const selection = term.getSelection()
      if (selection) {
        // 有选中内容时复制
        try {
          await navigator.clipboard.writeText(selection)
          term.writeln('\x1b[90m已复制到剪贴板\x1b[0m')
        } catch {
          // 静默失败
        }
      } else {
        // 无选中内容时粘贴
        try {
          const text = await navigator.clipboard.readText()
          if (text && ptyIdRef.current) {
            await invoke('write_to_pty', {
              ptyId: ptyIdRef.current,
              data: text,
            })
          }
        } catch {
          // 静默失败
        }
      }
    })

    // 窗口大小改变时调整终端
    const handleResize = () => {
      fitAddon.fit()
      if (ptyIdRef.current && xtermRef.current) {
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          invoke('resize_pty', {
            ptyId: ptyIdRef.current,
            cols: dims.cols,
            rows: dims.rows,
          }).catch(console.error)
        }
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [sessionId, projectPath])

  useEffect(() => {
    const cleanupPromise = initTerminal()

    return () => {
      // 清理
      if (unlistenRef.current) {
        unlistenRef.current()
      }
      if (ptyIdRef.current) {
        invoke('close_pty', { ptyId: ptyIdRef.current }).catch(console.error)
      }
      xtermRef.current?.dispose()
      cleanupPromise?.catch(console.error)
    }
  }, [initTerminal])

  return (
    <div className="terminal-panel">
      <div ref={terminalRef} className="terminal-container" />
    </div>
  )
}

export default TerminalPanel
