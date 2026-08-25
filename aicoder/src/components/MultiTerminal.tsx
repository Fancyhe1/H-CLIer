import { useEffect, useRef, useCallback } from 'react'
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
  // 用于标记此终端是否在后台运行（hook 通知时据此决定是否标记未读）
  shouldMarkUnread: boolean
  // shouldMarkUnread 变为 true 的时间戳（用于过滤旧输出）
  unreadMarkedAt?: number
  // 初始化状态：pending=等待中, initializing=初始化中, ready=就绪, error=错误, destroying=销毁中
  initializationState: 'pending' | 'initializing' | 'ready' | 'error' | 'destroying'
  // 初始化超时定时器
  initTimeout?: ReturnType<typeof setTimeout>
}

// 检测 /branch 创建的新会话并自动导入
async function detectBranchSession(projectPath: string, sessionTitle: string) {
  try {
    // 获取当前会话文件列表（快照）
    const existingFiles = await invoke<string[]>('list_session_files', { projectPath })
    console.log('[Branch] 当前会话文件:', existingFiles.length, '个')

    // 轮询检测新文件（每 2 秒，最多 30 秒）
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const currentFiles = await invoke<string[]>('list_session_files', { projectPath })
      const newFiles = currentFiles.filter(id => !existingFiles.includes(id))

      if (newFiles.length > 0) {
        const newSessionId = newFiles[newFiles.length - 1]
        console.log('[Branch] 发现新会话:', newSessionId)

        // 自动创建会话并切换
        const { createSession } = useSessionStore.getState()
        const newSession = await createSession({
          projectPath,
          title: `分支: ${sessionTitle}`,
          sessionType: 'claude',
          cliSessionId: newSessionId,
        })

        if (newSession) {
          console.log('[Branch] 已自动导入分支会话:', newSession.id)
        }
        return
      }
    }

    console.log('[Branch] 未检测到新会话文件（超时）')
  } catch (err) {
    console.error('[Branch] 检测失败:', err)
  }
}

function MultiTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalsRef = useRef<Map<string, TerminalInstance>>(new Map())
  // 用于记录创建终端时的配置，避免配置变化时重新创建
  const createdSessionIdsRef = useRef<Set<string>>(new Set())
  // 窗口焦点状态（用于 Stop hook 判断是否需要标记未读）
  const windowFocusedRef = useRef(true)
  // Stop 事件防抖（防止 recap 等重复触发）
  const lastStopTimeRef = useRef<Map<string, number>>(new Map())
  // 分支检测：每个会话独立的输入缓冲区
  const branchInputBuffersRef = useRef<Map<string, string>>(new Map())

  const { sessions, activeSessionId, closedSessionId, setClosedSession } = useSessionStore()
  const { config, currentTheme } = useSettingsStore()

  // 销毁指定会话的终端（真正关闭会话时调用）
  const destroyTerminal = async (sessionId: string) => {
    const instance = terminalsRef.current.get(sessionId)
    if (!instance) return

    // 标记为销毁中，防止重复销毁
    if (instance.initializationState === 'destroying') return
    instance.initializationState = 'destroying'

    // 清除初始化超时定时器
    if (instance.initTimeout) {
      clearTimeout(instance.initTimeout)
      instance.initTimeout = undefined
    }

    // 先取消事件监听，防止新的事件处理
    try {
      instance.unlisten()
    } catch (e) {
      console.warn('取消事件监听失败:', e)
    }

    // 关闭 PTY（带超时保护，避免卡死）
    if (instance.ptyId) {
      try {
        // 使用 Promise.race 添加超时保护
        await Promise.race([
          invoke('close_pty', { ptyId: instance.ptyId }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('关闭 PTY 超时')), 3000)
          )
        ])
      } catch (err) {
        console.warn('关闭 PTY 失败或超时:', err)
      }
    }

    // 销毁 xterm 实例
    try {
      instance.term.dispose()
    } catch (e) {
      console.warn('销毁终端实例失败:', e)
    }

    // 移除 DOM 元素
    const terminalDiv = document.getElementById(`terminal-${sessionId}`)
    if (terminalDiv && terminalDiv.parentNode) {
      terminalDiv.parentNode.removeChild(terminalDiv)
    }

    // 从 Map 中移除
    terminalsRef.current.delete(sessionId)
    createdSessionIdsRef.current.delete(sessionId)
  }

  // 监听关闭会话事件（真正销毁）
  useEffect(() => {
    if (closedSessionId) {
      // 异步销毁终端，但不阻塞 UI
      destroyTerminal(closedSessionId).catch(err => {
        console.error('销毁终端失败:', err)
      }).finally(() => {
        // 无论成功失败，都清除关闭标记
        setClosedSession(null)
      })
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

  // 监听 AgentHub 上下文注入事件
  useEffect(() => {
    const handleInjectContext = (e: Event) => {
      const customEvent = e as CustomEvent
      const { sessionId, context } = customEvent.detail || {}
      if (!sessionId || !context) return

      const instance = terminalsRef.current.get(sessionId)
      if (instance?.ptyId) {
        invoke('write_to_pty', { ptyId: instance.ptyId, data: context + '\n' })
        sessionStorage.removeItem(`agenthub-context-${sessionId}`)
      }
      // 如果 PTY 还没就绪，等终端初始化时会检查 sessionStorage
    }

    window.addEventListener('agenthub-inject-context', handleInjectContext)
    return () => window.removeEventListener('agenthub-inject-context', handleInjectContext)
  }, [])

  // 监听 Claude Code hook 通知（权限请求、选项选择等需要用户操作的场景）
  useEffect(() => {
    const unlisten = listen('claude-hook-notification', (event) => {
      const payload = event.payload as {
        hook_event_name?: string
        matcher?: string
        message?: string
        session_id?: string
      }

      // 只处理需要用户操作的事件
      if (payload.matcher === 'permission_prompt' || payload.matcher === 'elicitation_dialog') {
        // 如果有 session_id，标记对应会话为未读
        if (payload.session_id) {
          // 查找匹配的会话（通过 PTY 日志中的 session ID 匹配）
          const sessions = useSessionStore.getState().sessions
          const matchedSession = sessions.find(s =>
            s.cliSessionId === payload.session_id ||
            s.id === payload.session_id
          )
          if (matchedSession) {
            useSessionStore.getState().setHasUnread(matchedSession.id, true)
            return
          }
        }

        // 如果无法匹配具体会话，标记所有后台会话为未读
        // （用户需要手动检查哪个会话需要操作）
        const terminals = terminalsRef.current
        terminals.forEach((instance, sessionId) => {
          if (instance.shouldMarkUnread) {
            useSessionStore.getState().setHasUnread(sessionId, true)
          }
        })
      }
    })

    return () => { unlisten.then(fn => fn()) }
  }, [])

  // 监听 Claude Code hook 通知
  useEffect(() => {
    const unlisten = listen('claude-hook-notification', (event) => {
      const payload = event.payload as {
        hook_event_name?: string
        matcher?: string
        message?: string
        session_id?: string
      }

      const isPermissionEvent = payload.matcher === 'permission_prompt' || payload.matcher === 'elicitation_dialog'
      const isStopEvent = payload.hook_event_name === 'Stop'

      if (!isPermissionEvent && !isStopEvent) return

      const activeSessionId = useSessionStore.getState().activeSessionId

      // Notification 事件：匹配到会话就标记未读
      if (isPermissionEvent) {
        if (payload.session_id) {
          const sessions = useSessionStore.getState().sessions
          const matchedSession = sessions.find(s =>
            s.cliSessionId === payload.session_id ||
            s.id === payload.session_id
          )
          if (matchedSession) {
            // 窗口聚焦 + 前台会话 → 跳过（用户正在看）
            if (windowFocusedRef.current && matchedSession.id === activeSessionId) return
            useSessionStore.getState().setHasUnread(matchedSession.id, true)
            return
          }
        }
        // 如果没有 session_id 或者没匹配到，标记所有后台会话
        const terminals = terminalsRef.current
        terminals.forEach((instance, sessionId) => {
          if (instance.shouldMarkUnread) {
            useSessionStore.getState().setHasUnread(sessionId, true)
          }
        })
      }
      // Stop 事件：窗口聚焦且是前台会话时跳过，其他情况都标记
      // 防抖：30 秒内同一会话只触发一次（防止 recap 等重复触发）
      else if (isStopEvent && payload.session_id) {
        const now = Date.now()
        const lastStop = lastStopTimeRef.current.get(payload.session_id) || 0
        if (now - lastStop < 30000) return  // 30 秒防抖
        lastStopTimeRef.current.set(payload.session_id, now)

        const sessions = useSessionStore.getState().sessions
        const matchedSession = sessions.find(s =>
          s.cliSessionId === payload.session_id ||
          s.id === payload.session_id
        )
        if (matchedSession) {
          // 窗口聚焦 + 前台会话 → 跳过（用户正在看）
          // 窗口失焦 或 可见但失焦 → 标记未读
          if (windowFocusedRef.current && matchedSession.id === activeSessionId) return
          useSessionStore.getState().setHasUnread(matchedSession.id, true)
        }
      }
    })

    return () => { unlisten.then(fn => fn()) }
  }, [])

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

  // 辅助函数：更新终端的监控状态
  // 当前显示的会话不监控（用户正在看），其他会话都监控
  // 延迟 2 秒启动检测，避免切后台时残留输出误触发
  const updateTerminalMonitoring = () => {
    const current = useSessionStore.getState().activeSessionId
    terminalsRef.current.forEach((instance, id) => {
      if (id === current) {
        // 当前显示的会话：停止监控
        instance.shouldMarkUnread = false
        instance.unreadMarkedAt = undefined
      } else if (!instance.shouldMarkUnread) {
        // 后台会话：延迟启动监控
        instance.shouldMarkUnread = true
        instance.unreadMarkedAt = Date.now() + 2000  // 2 秒后才开始检测
      }
    })
  }

  // 监听窗口焦点变化
  useEffect(() => {
    const unlisten = listen<boolean>('tauri://focus-changed', (event) => {
      windowFocusedRef.current = event.payload
      if (event.payload) {
        const current = useSessionStore.getState().activeSessionId
        if (current) useSessionStore.getState().setHasUnread(current, false)
      }
      updateTerminalMonitoring()
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // 监听页面可见性变化
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const current = useSessionStore.getState().activeSessionId
        if (current) useSessionStore.getState().setHasUnread(current, false)
      }
      updateTerminalMonitoring()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // 监听浏览器焦点变化（补充 Tauri 事件）
  useEffect(() => {
    const handleFocus = () => {
      windowFocusedRef.current = true
      // 窗口获得焦点时，清除当前会话未读
      const current = useSessionStore.getState().activeSessionId
      if (current) {
        useSessionStore.getState().setHasUnread(current, false)
      }
    }
    const handleBlur = () => { windowFocusedRef.current = false }
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  // 定时检查：窗口有焦点时自动清除当前会话未读（兜底机制）
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden && windowFocusedRef.current) {
        const current = useSessionStore.getState().activeSessionId
        if (current) {
          const session = useSessionStore.getState().sessions.find(s => s.id === current)
          if (session?.hasUnread) {
            useSessionStore.getState().setHasUnread(current, false)
          }
        }
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // 等待容器有正确尺寸的辅助函数
  const waitForContainerReady = useCallback(async (container: HTMLDivElement, maxWait = 10000): Promise<boolean> => {
    const startTime = Date.now()
    while (Date.now() - startTime < maxWait) {
      const rect = container.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        // 额外等待一帧，确保布局稳定
        await new Promise(resolve => setTimeout(resolve, 100))
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return false
  }, [])

  // 创建终端
  useEffect(() => {
    if (!activeSessionId || !containerRef.current) return

    // 从当前 sessions 获取会话信息
    const currentSessions = useSessionStore.getState().sessions
    const session = currentSessions.find(s => s.id === activeSessionId)
    if (!session) return

    // 如果已有终端实例且状态正常，直接显示
    const existingInstance = terminalsRef.current.get(activeSessionId)
    if (existingInstance) {
      // 如果正在销毁中，不处理
      if (existingInstance.initializationState === 'destroying') return
      // 如果已就绪或初始化中，直接显示
      if (existingInstance.initializationState === 'ready' || existingInstance.initializationState === 'initializing') {
        showTerminal(activeSessionId)
        return
      }
      // 如果是错误状态，强制清理后重新创建
      if (existingInstance.initializationState === 'error') {
        // 同步清理资源（不等待异步完成）
        if (existingInstance.initTimeout) {
          clearTimeout(existingInstance.initTimeout)
        }
        try {
          existingInstance.unlisten()
        } catch (e) { /* ignore */ }
        if (existingInstance.ptyId) {
          invoke('close_pty', { ptyId: existingInstance.ptyId }).catch(console.error)
        }
        try {
          existingInstance.term.dispose()
        } catch (e) { /* ignore */ }
        // 移除 DOM 元素
        const terminalDiv = document.getElementById(`terminal-${activeSessionId}`)
        if (terminalDiv && terminalDiv.parentNode) {
          terminalDiv.parentNode.removeChild(terminalDiv)
        }
        terminalsRef.current.delete(activeSessionId)
        createdSessionIdsRef.current.delete(activeSessionId)
      }
    }

    // 标记为已创建（防止重复创建）
    if (createdSessionIdsRef.current.has(activeSessionId)) return
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
      cols: 120,  // 使用较大的默认尺寸，避免在隐藏状态下使用 80 列
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // 创建终端实例（先保存，后续填充ptyId和unlisten）
    // 新创建的终端默认应该追踪未读（只有当前会话不需要标记）
    const instance: TerminalInstance = {
      term,
      fitAddon,
      ptyId: '',
      unlisten: () => {},
      sessionId: activeSessionId,
      shouldMarkUnread: true,
      initializationState: 'pending',
    }
    terminalsRef.current.set(activeSessionId, instance)

    // 设置初始化超时（15秒）
    const initTimeout = setTimeout(() => {
      const currentInstance = terminalsRef.current.get(activeSessionId)
      if (currentInstance && currentInstance.initializationState !== 'ready') {
        console.error('终端初始化超时:', activeSessionId)
        currentInstance.initializationState = 'error'
        term.writeln('\x1b[1;31m错误: 终端初始化超时\x1b[0m')
      }
    }, 15000)
    instance.initTimeout = initTimeout

    // 标记会话为运行状态
    useSessionStore.getState().setSessionRunning(activeSessionId, true)

    // 异步初始化终端
    ;(async () => {
      try {
        // 标记为初始化中
        instance.initializationState = 'initializing'

        // 等待容器有正确尺寸
        const containerReady = await waitForContainerReady(containerRef.current!)
        if (!containerReady) {
          instance.initializationState = 'error'
          term.writeln('\x1b[1;31m错误: 容器尺寸未就绪，请关闭会话后重试\x1b[0m')
          return
        }

        // 检查是否已被销毁（在等待过程中可能被关闭）
        const currentState = terminalsRef.current.get(activeSessionId)
        if (!currentState || currentState.initializationState === 'destroying') {
          return
        }

        // 打开终端到容器
        term.open(terminalDiv)

        // 等待 DOM 更新稳定
        await new Promise(resolve => setTimeout(resolve, 100))

        // 尝试 fit（可能失败，但不阻塞）
        try {
          fitAddon.fit()
        } catch (e) {
          // 忽略 fit 错误
        }

        // 生成 PTY ID（使用 session ID）
        const ptyId = activeSessionId

        // 设置 PTY 输出监听器
        const unlisten = await listen<string>(`pty-output-${ptyId}`, (event) => {
          // 解码 hex 编码的数据
          let data = event.payload
          if (data && data.startsWith('hex:')) {
            try {
              const hexStr = data.substring(4)
              const bytes: number[] = []
              for (let i = 0; i < hexStr.length; i += 2) {
                const hexByte = hexStr.substring(i, i + 2)
                const byte = parseInt(hexByte, 16)
                if (!isNaN(byte)) bytes.push(byte)
              }
              if (bytes.length > 0) {
                data = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
              } else {
                return
              }
            } catch (e) {
              return
            }
          }

          if (!data) return

          term.write(data)
        })

        // 更新实例的 unlisten
        instance.unlisten = unlisten

        // 检查是否已被销毁
        const currentInstance = terminalsRef.current.get(activeSessionId)
        if (!currentInstance || currentInstance.initializationState === 'destroying') {
          unlisten()
          return
        }

        // 创建 PTY
        const dims = fitAddon.proposeDimensions()
        const actualPtyId = await invoke<string>('create_pty', {
          sessionId: activeSessionId,
          cols: dims?.cols || 80,
          rows: dims?.rows || 30,
        })

        // 再次检查是否已被销毁
        const instanceAfterPty = terminalsRef.current.get(activeSessionId)
        if (!instanceAfterPty || instanceAfterPty.initializationState === 'destroying') {
          unlisten()
          await invoke('close_pty', { ptyId: actualPtyId }).catch(console.error)
          return
        }

        // 更新实例的 ptyId
        instanceAfterPty.ptyId = actualPtyId

        // 启动 PowerShell
        try {
          await invoke('spawn_command_in_pty', {
            ptyId: actualPtyId,
            command: 'powershell.exe',
            args: [],
            cwd: session.projectPath,
          })
        } catch (spawnErr) {
          term.writeln(`\x1b[1;31m错误: PowerShell 启动失败 - ${spawnErr}\x1b[0m`)
          instance.initializationState = 'error'
          return
        }

        // 检查是否有 AgentHub 待注入的上下文
        const pendingContext = sessionStorage.getItem(`agenthub-context-${session.id}`)
        if (pendingContext) {
          sessionStorage.removeItem(`agenthub-context-${session.id}`)

          // 等 Claude Code 完全启动后注入上下文（分段发送）
          setTimeout(() => {
            const chunks = pendingContext.match(/.{1,500}/g) || [pendingContext]
            let delay = 0
            for (const chunk of chunks) {
              setTimeout(() => {
                invoke('write_to_pty', { ptyId: actualPtyId, data: chunk })
                  .catch(e => console.error('注入上下文块失败:', e))
              }, delay)
              delay += 100
            }
            // 最后发送回车提交
            setTimeout(() => {
              invoke('write_to_pty', { ptyId: actualPtyId, data: '\r' })
                .catch(e => console.error('发送回车失败:', e))
            }, delay + 500)
          }, 10000)
        }

        // 处理用户输入（含 /branch 检测）
        term.onData((data) => {
          invoke('write_to_pty', { ptyId: actualPtyId, data }).catch(console.error)

          // /branch 检测：缓冲用户输入，Enter 时检查
          const buffer = branchInputBuffersRef.current.get(session.id) || ''
          if (data === '\r' || data === '\n') {
            // Enter 按下，检查缓冲区
            const trimmed = buffer.trim()
            if (trimmed === '/branch' || trimmed.startsWith('/branch ')) {
              console.log('[Branch] 检测到 /branch 命令，开始监控新会话文件')
              detectBranchSession(session.projectPath, session.title)
            }
            branchInputBuffersRef.current.set(session.id, '')
          } else if (data === '\x7f' || data === '\b') {
            // Backspace
            branchInputBuffersRef.current.set(session.id, buffer.slice(0, -1))
          } else if (data.length === 1 && data >= ' ') {
            // 普通可打印字符
            branchInputBuffersRef.current.set(session.id, buffer + data)
          }
        })

        // 键盘快捷键拦截
        // 使用 attachCustomKeyEventHandler 在 xterm 处理之前拦截按键
        let lastPasteTime = 0
        let lastShiftEnterTime = 0
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          // Shift+Enter: 发送换行符（\n）而非回车符（\r），支持多行输入
          if (e.key === 'Enter' && e.shiftKey) {
            const now = Date.now()
            if (now - lastShiftEnterTime < 300) return false // 防抖：300ms 内不重复触发
            lastShiftEnterTime = now
            e.preventDefault()
            e.stopPropagation()
            invoke('write_to_pty', { ptyId, data: '\n' }).catch(console.error)
            return false // 阻止 xterm 处理（不发送 \r）
          }

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
            { ctrl: true, shift: false, key: ',' },  // 打开设置
            { ctrl: true, shift: false, key: 'PageUp' },   // 上一个标签
            { ctrl: true, shift: false, key: 'PageDown' }, // 下一个标签
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

          // 等待 PowerShell 完全启动
          await new Promise(r => setTimeout(r, 500))

          // 检查是否已被销毁
          const checkInstance = terminalsRef.current.get(activeSessionId)
          if (!checkInstance || checkInstance.initializationState === 'destroying') {
            return
          }

          // 检查 Claude 会话是否存在
          let sessionExists = false
          try {
            sessionExists = await invoke<boolean>('check_claude_session_exists', {
              sessionId: cliSessionId,
              projectPath: session.projectPath,
            })
          } catch (checkErr) {
            // 忽略错误
          }

          // 从当前配置获取 Claude 路径和参数
          const claudeCmd = currentConfig?.claude?.cli_path || 'claude'
          const claudeArgs = currentConfig?.claude?.default_args || []

          // 检查是否有 AgentHub 的 agent 参数
          const pendingAgent = sessionStorage.getItem(`agenthub-agent-${activeSessionId}`)
          if (pendingAgent) {
            sessionStorage.removeItem(`agenthub-agent-${activeSessionId}`)
          }
          const agentArg = pendingAgent ? `--agent ${pendingAgent}` : ''

          // 根据会话是否存在决定使用 --resume 还是 --session-id
          let cmd: string
          if (sessionExists) {
            // 会话已存在，使用 --resume 恢复
            const parts = [claudeCmd, '--resume', `"${cliSessionId}"`, agentArg, ...claudeArgs].filter(Boolean)
            cmd = parts.join(' ') + '\r'
          } else {
            // 会话不存在，使用 --session-id 创建
            const parts = [claudeCmd, '--session-id', `"${cliSessionId}"`, agentArg, ...claudeArgs].filter(Boolean)
            cmd = parts.join(' ') + '\r'
          }

          await invoke('write_to_pty', { ptyId: actualPtyId, data: cmd })
        }

        // 标记为就绪
        instance.initializationState = 'ready'
        // 清除超时定时器
        if (instance.initTimeout) {
          clearTimeout(instance.initTimeout)
          instance.initTimeout = undefined
        }

        showTerminal(activeSessionId)
      } catch (err) {
        console.error('Terminal init error:', err)
        instance.initializationState = 'error'
        // 清除超时定时器
        if (instance.initTimeout) {
          clearTimeout(instance.initTimeout)
          instance.initTimeout = undefined
        }
        term.writeln(`\x1b[1;31m错误: ${err}\x1b[0m`)
      }
    })()

  }, [activeSessionId]) // 只依赖 activeSessionId，不依赖 sessions

  // 调整所有终端大小并同步 PTY（跳过隐藏的终端，避免破坏 xterm 内部状态）
  const fitAllTerminals = useCallback(async () => {
    for (const [sessionId, instance] of terminalsRef.current) {
      try {
        // 跳过未就绪的终端
        if (instance.initializationState !== 'ready') {
          continue
        }

        // 检查终端容器是否真正可见（包括父容器的 display:none 情况）
        // offsetWidth 在元素或父元素 display:none 时为 0
        const termDiv = document.getElementById(`terminal-${sessionId}`)
        if (!termDiv || termDiv.offsetWidth === 0) {
          continue
        }

        // 先检查尺寸是否真的变了，没变则跳过 fit 避免 reflow 破坏缓冲区内容
        const proposedDims = instance.fitAddon.proposeDimensions()
        if (proposedDims && proposedDims.cols === instance.term.cols && proposedDims.rows === instance.term.rows) {
          continue  // 尺寸没变，跳过
        }

        instance.fitAddon.fit()

        const cols = instance.term.cols
        const rows = instance.term.rows

        // 刷新显示
        instance.term.refresh(0, rows - 1)

        // 同步 PTY 尺寸
        if (instance.ptyId) {
          await invoke('resize_pty', {
            ptyId: instance.ptyId,
            cols: cols,
            rows: rows
          })
        }
      } catch (e) {
        // 忽略 fit 错误（可能终端还未完全初始化）
      }
    }
  }, [])

  // 当字体大小配置变化时，更新所有已存在终端的字体大小
  useEffect(() => {
    const fontSize = config?.general?.terminal_font_size || 14
    terminalsRef.current.forEach((instance) => {
      instance.term.options.fontSize = fontSize
    })
    fitAllTerminals()
  }, [config?.general?.terminal_font_size, fitAllTerminals])

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
  const showTerminal = useCallback((sessionId: string) => {
    if (!containerRef.current) return

    // 更新监控状态（当前显示的停止监控，后台的开始监控）
    updateTerminalMonitoring()

    const children = containerRef.current.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      child.style.display = child.id === `terminal-${sessionId}` ? 'block' : 'none'
    }

    // 调整大小 - 使用多重延迟确保容器已有正确尺寸
    const instance = terminalsRef.current.get(sessionId)
    if (instance && instance.initializationState === 'ready') {
      // 定义一个函数来 fit 并同步 PTY 尺寸
      const fitAndSync = async () => {
        try {
          // 先检查容器尺寸
          const container = containerRef.current
          if (!container) return
          const containerRect = container.getBoundingClientRect()

          // 如果容器尺寸为 0，延迟重试（最多重试3次）
          if (containerRect.width === 0 || containerRect.height === 0) {
            // 使用指数退避策略，避免频繁重试
            setTimeout(() => fitAndSync(), 300)
            return
          }

          // 先检查尺寸是否真的变了，没变则跳过 fit 避免 reflow 破坏缓冲区内容
          const proposedDims = instance.fitAddon.proposeDimensions()
          if (proposedDims && proposedDims.cols === instance.term.cols && proposedDims.rows === instance.term.rows) {
            // 尺寸没变，只需滚动到底部
            instance.term.scrollToBottom()
            return
          }

          // fit 获取正确的尺寸
          instance.fitAddon.fit()

          const cols = instance.term.cols
          const rows = instance.term.rows

          // 刷新显示
          instance.term.refresh(0, rows - 1)

          // 同步 PTY 尺寸
          if (instance.ptyId) {
            await invoke('resize_pty', {
              ptyId: instance.ptyId,
              cols: cols,
              rows: rows
            })

            // 滚动到底部
            instance.term.scrollToBottom()
          }
        } catch (e) {
          console.error('Fit and sync error:', e)
        }
      }

      // 使用 setTimeout 确保 DOM 已更新
      setTimeout(() => fitAndSync(), 100)
    }
  }, [])

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
  }, [activeSessionId, showTerminal])

  // 监听容器尺寸变化，自动调整终端大小
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let fitTimeout: ReturnType<typeof setTimeout> | null = null

    const resizeObserver = new ResizeObserver((entries) => {
      // 检查容器是否有有效尺寸
      const entry = entries[0]
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        // 清除之前的延迟
        if (fitTimeout) {
          clearTimeout(fitTimeout)
        }
        // 使用延迟确保布局稳定（切换视图时需要足够时间让 DOM 更新完成）
        fitTimeout = setTimeout(() => {
          fitAllTerminals()
        }, 50)
      }
    })

    resizeObserver.observe(container)

    // 初始 fit - 使用较长延迟确保组件完全挂载
    const initialFitTimeout = setTimeout(() => {
      fitAllTerminals()
    }, 100)

    return () => {
      resizeObserver.disconnect()
      if (fitTimeout) {
        clearTimeout(fitTimeout)
      }
      clearTimeout(initialFitTimeout)
    }
  }, [fitAllTerminals])

  // 清理
  useEffect(() => {
    return () => {
      terminalsRef.current.forEach((instance) => {
        // 清除初始化超时定时器
        if (instance.initTimeout) {
          clearTimeout(instance.initTimeout)
        }
        // 取消事件监听
        try {
          instance.unlisten()
        } catch (e) {
          console.warn('清理时取消事件监听失败:', e)
        }
        // 关闭 PTY
        if (instance.ptyId) {
          invoke('close_pty', { ptyId: instance.ptyId }).catch(console.error)
        }
        // 销毁终端
        try {
          instance.term.dispose()
        } catch (e) {
          console.warn('清理时销毁终端失败:', e)
        }
      })
      terminalsRef.current.clear()
      createdSessionIdsRef.current.clear()
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
          <img className="terminal-empty-icon" src="/icon.png" alt="H CLIer" width="64" height="64" />
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
