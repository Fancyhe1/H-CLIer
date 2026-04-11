import { create } from 'zustand'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'

export interface TerminalInstance {
  id: string
  sessionId: string
  projectPath: string
  terminal: Terminal
  fitAddon: FitAddon
  ptyId: string
  unlisten: UnlistenFn
  container: HTMLDivElement
  isActive: boolean
}

// 配置类型定义
interface AppConfig {
  claude: {
    cli_path: string | null
    default_args: string[]
    env_vars: Array<[string, string]>
    api_config: {
      use_custom_api: boolean
      api_base_url: string | null
      api_key: string | null
    }
  }
  general: {
    theme: string
    terminal_font_size: number
    auto_start_claude: boolean
  }
}

interface TerminalState {
  terminals: Map<string, TerminalInstance>
  activeTerminalId: string | null

  // Actions
  createTerminal: (
    sessionId: string,
    projectPath: string,
    container: HTMLDivElement
  ) => Promise<TerminalInstance | null | undefined>

  getTerminal: (sessionId: string) => TerminalInstance | undefined

  switchTerminal: (sessionId: string) => void

  resizeTerminal: (sessionId: string) => void

  writeToTerminal: (sessionId: string, data: string) => void

  disposeTerminal: (sessionId: string) => Promise<void>

  disposeAll: () => Promise<void>
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: new Map(),
  activeTerminalId: null,

  createTerminal: async (sessionId, projectPath, container) => {
    const { terminals } = get()

    // 如果该会话已有终端，直接返回
    if (terminals.has(sessionId)) {
      return terminals.get(sessionId)
    }

    try {
      // 读取配置
      let config: AppConfig
      try {
        config = await invoke<AppConfig>('get_config')
      } catch {
        config = {
          claude: { cli_path: null, default_args: [], env_vars: [], api_config: { use_custom_api: false, api_base_url: null, api_key: null } },
          general: { theme: 'dark', terminal_font_size: 14, auto_start_claude: false }
        }
      }

      const fontSize = config.general.terminal_font_size || 14

      // 初始化xterm
      const term = new Terminal({
        cursorBlink: true,
        fontSize: fontSize,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
        },
        rows: 30,
        cols: 80,
        scrollback: 50000,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(container)
      fitAddon.fit()

      // 先恢复历史内容到终端滚动缓冲区（在启动新进程之前）
      try {
        const history = await invoke<string>('read_terminal_history', { sessionId })
        if (history && history.length > 0) {
          // 过滤掉可能导致问题的控制字符
          const filteredHistory = history
            .replace(/\x00/g, '')
            .replace(/\x1b\[\?25[hl]/g, '')
            .replace(/\x1b\[\?1049[hl]/g, '')

          // 写入历史内容到终端
          term.write(filteredHistory)
          term.write('\x1b[90m\r\n─── 会话继续 ───\r\n\x1b[0m')
        }
      } catch (err) {
        console.log('无历史记录:', err)
      }

      // 创建PTY
      const dims = fitAddon.proposeDimensions()
      const ptyId = await invoke<string>('create_pty', {
        sessionId,
        cols: dims?.cols || 80,
        rows: dims?.rows || 30,
      })

      // 监听PTY输出事件
      const unlisten = await listen<string>(`pty-output-${ptyId}`, (event) => {
        term.write(event.payload)
      })

      // 根据会话类型决定启动什么命令
      if (projectPath) {
        // 从会话存储获取会话类型
        const { useSessionStore } = await import('./sessionStore')
        const sessions = useSessionStore.getState().sessions
        const session = sessions.find(s => s.id === sessionId)
        const sessionType = session?.sessionType || 'claude'

        if (sessionType === 'claude') {
          // Claude 会话：自动启动/恢复 Claude
          const hasClaude = await invoke<boolean>('check_claude_installation')
          const claudeArgs = config.claude.default_args || []

          if (hasClaude) {
            const isWindows = navigator.platform.toLowerCase().includes('win')
            let claudeCmd = config.claude.cli_path || (isWindows ? 'claude.cmd' : 'claude')

            // 检测是否需要恢复
            const wasRunningClaude = await invoke<boolean>('was_running_claude', { sessionId })
            let args: string[] = []
            if (wasRunningClaude) {
              args = ['--resume', ...claudeArgs]
            } else {
              args = [...claudeArgs]
            }

            await invoke('spawn_command_in_pty', {
              ptyId,
              command: claudeCmd,
              args: args,
              cwd: projectPath,
            })
          } else {
            // Claude 未安装，启动 PowerShell
            await invoke('spawn_command_in_pty', {
              ptyId,
              command: 'powershell.exe',
              args: [],
              cwd: projectPath,
            })
          }
        } else {
          // 普通终端会话：只启动 PowerShell
          await invoke('spawn_command_in_pty', {
            ptyId,
            command: 'powershell.exe',
            args: [],
            cwd: projectPath,
          })
        }
      }

      // 处理输入
      term.onData((data) => {
        invoke('write_to_pty', { ptyId, data }).catch(console.error)
      })

      const terminalInstance: TerminalInstance = {
        id: `${sessionId}_${Date.now()}`,
        sessionId,
        projectPath,
        terminal: term,
        fitAddon,
        ptyId,
        unlisten,
        container,
        isActive: false,
      }

      set((state) => ({
        terminals: new Map(state.terminals).set(sessionId, terminalInstance),
      }))

      return terminalInstance
    } catch (err) {
      console.error('创建终端失败:', err)
      return null
    }
  },

  getTerminal: (sessionId) => {
    return get().terminals.get(sessionId)
  },

  switchTerminal: (sessionId) => {
    const { terminals, activeTerminalId } = get()

    // 隐藏当前活动的终端
    if (activeTerminalId) {
      const currentTerminal = terminals.get(activeTerminalId)
      if (currentTerminal) {
        currentTerminal.container.style.display = 'none'
        currentTerminal.isActive = false
      }
    }

    // 显示目标终端
    const targetTerminal = terminals.get(sessionId)
    if (targetTerminal) {
      targetTerminal.container.style.display = 'block'
      targetTerminal.isActive = true

      // 触发resize以适应新容器
      setTimeout(() => {
        targetTerminal.fitAddon.fit()
        const dims = targetTerminal.fitAddon.proposeDimensions()
        if (dims) {
          invoke('resize_pty', {
            ptyId: targetTerminal.ptyId,
            cols: dims.cols,
            rows: dims.rows,
          }).catch(console.error)
        }
      }, 0)
    }

    set({ activeTerminalId: sessionId })
  },

  resizeTerminal: (sessionId) => {
    const terminal = get().terminals.get(sessionId)
    if (terminal && terminal.isActive) {
      terminal.fitAddon.fit()
      const dims = terminal.fitAddon.proposeDimensions()
      if (dims) {
        invoke('resize_pty', {
          ptyId: terminal.ptyId,
          cols: dims.cols,
          rows: dims.rows,
        }).catch(console.error)
      }
    }
  },

  writeToTerminal: (sessionId, data) => {
    const terminal = get().terminals.get(sessionId)
    if (terminal) {
      terminal.terminal.write(data)
    }
  },

  disposeTerminal: async (sessionId) => {
    const { terminals } = get()
    const terminal = terminals.get(sessionId)

    if (terminal) {
      // 取消事件监听
      terminal.unlisten()

      // 关闭PTY
      await invoke('close_pty', { ptyId: terminal.ptyId }).catch(console.error)

      // 销毁xterm
      terminal.terminal.dispose()

      // 从map中移除
      const newTerminals = new Map(terminals)
      newTerminals.delete(sessionId)

      set((state) => ({
        terminals: newTerminals,
        activeTerminalId: state.activeTerminalId === sessionId ? null : state.activeTerminalId,
      }))
    }
  },

  disposeAll: async () => {
    const { terminals } = get()

    for (const [, terminal] of terminals) {
      terminal.unlisten()
      await invoke('close_pty', { ptyId: terminal.ptyId }).catch(console.error)
      terminal.terminal.dispose()
    }

    set({ terminals: new Map(), activeTerminalId: null })
  },
}))
