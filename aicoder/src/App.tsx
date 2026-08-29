import { useState, useEffect, lazy, Suspense } from 'react'
import { Layout, Button, Space, ConfigProvider, Tooltip, Modal, Input, message, Badge, Spin } from 'antd'
import { theme } from 'antd'
import {
  SettingOutlined,
  MoonOutlined,
  SunOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
  PushpinOutlined,
  DesktopOutlined,
  SaveOutlined,
  MinusOutlined,
  ExpandOutlined,
  CompressOutlined,
  CloseOutlined,
  FolderOpenOutlined,
  QuestionCircleOutlined,
  DashboardOutlined,
  OrderedListOutlined,
  MacCommandOutlined,
  CloudOutlined,
  FileTextOutlined,
  CodeOutlined,
  RobotOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
// 关键组件：启动后立即需要
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import MultiTerminal from './components/MultiTerminal'
// 非关键组件：懒加载
const SettingsPanel = lazy(() => import('./components/SettingsPanel'))
const TokenStatsPanel = lazy(() => import('./components/TokenStatsPanel'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const ClaudeCommandsPanel = lazy(() => import('./components/ClaudeCommandsPanel'))
const CheckpointModal = lazy(() => import('./components/CheckpointModal'))
const FileBrowserModal = lazy(() => import('./components/FileBrowserModal'))
const DashboardModal = lazy(() => import('./components/DashboardModal'))
const MarkdownPanel = lazy(() => import('./components/MarkdownPanel'))
const AgentHubPanel = lazy(() => import('./components/agenthub/AgentHubPanel'))
const TeamPanel = lazy(() => import('./components/team/TeamPanel'))
const OnboardingModal = lazy(() => import('./components/OnboardingModal'))
import { useSettingsStore } from './stores/settingsStore'
import { useSessionStore } from './stores/sessionStore'
import { useKeybindingStore } from './stores/keybindingStore'
import { useTokenPolling } from './hooks/useTokenPolling'
import './styles/App.css'

const { Content, Sider } = Layout

// 定义内容面板类型
type PanelType = 'terminal' | 'stats' | 'markdown'

// 主题模式类型
type ThemeMode = 'light' | 'dark' | 'system'

function App() {
  const [collapsed] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [currentTheme, setCurrentThemeLocal] = useState<'light' | 'dark'>('dark')
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [claudeCommandsVisible, setClaudeCommandsVisible] = useState(false)
  const [activePanel, setActivePanel] = useState<PanelType>('terminal')
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)

  // 底部工具栏状态
  const [claudeMdVisible, setClaudeMdVisible] = useState(false)
  const [claudeMdContent, setClaudeMdContent] = useState('')
  const [claudeMdPath, setClaudeMdPath] = useState('')
  const [fileBrowserVisible, setFileBrowserVisible] = useState(false)
  const [dashboardVisible, setDashboardVisible] = useState(false)
  const [agentHubVisible, setAgentHubVisible] = useState(false)
  const [teamVisible, setTeamVisible] = useState(false)
  const [onboardingVisible, setOnboardingVisible] = useState(false)

  // 从 store 获取版本和更新状态
  const { appVersion, updateStatus, getAppVersion, claudeInstalled } = useSettingsStore()

  // 响应式获取当前会话的工作空间
  const { sessions, activeSessionId } = useSessionStore()
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const currentProjectName = activeSession?.projectPath.split('\\').pop() || null

  // Token 用量轮询
  useTokenPolling()

  // 窗口控制
  const appWindow = getCurrentWindow()

  const handleMinimize = () => appWindow.minimize()
  const handleMaximize = async () => {
    if (isMaximized) {
      await appWindow.unmaximize()
    } else {
      await appWindow.maximize()
    }
    setIsMaximized(!isMaximized)
  }
  const handleClose = () => appWindow.close()

  // 检测窗口最大化状态
  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await appWindow.isMaximized()
      setIsMaximized(maximized)
    }
    checkMaximized()

    // 监听窗口大小变化
    const unlisten = appWindow.onResized(() => {
      checkMaximized()
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const { loadConfig, setCurrentTheme, checkpointVisible, setCheckpointVisible } = useSettingsStore()

  // 打开文件管理器
  const openInExplorer = async () => {
    const { sessions, activeSessionId } = useSessionStore.getState()
    const activeSession = sessions.find(s => s.id === activeSessionId)
    const projectPath = activeSession?.projectPath || ''

    console.log('[openInExplorer] 准备打开路径:', projectPath)

    if (projectPath) {
      try {
        await tauriInvoke('open_in_explorer', { projectPath })
      } catch (err) {
        console.error('打开文件管理器失败:', err)
        message.error('打开文件管理器失败: ' + String(err))
      }
    } else {
      message.warning('请先选择一个会话')
    }
  }

  // 打开/保存 claude.md
  const openClaudeMd = async () => {
    try {
      // 获取当前工作目录（如果有活跃会话的话）
      const { sessions, activeSessionId } = useSessionStore.getState()
      const activeSession = sessions.find(s => s.id === activeSessionId)
      const projectPath = activeSession?.projectPath || ''

      if (projectPath) {
        const claudeMdFile = `${projectPath}\\claude.md`
        setClaudeMdPath(claudeMdFile)
        try {
          const content = await tauriInvoke<string>('read_text_file', { path: claudeMdFile })
          setClaudeMdContent(content)
        } catch {
          // 文件不存在，使用默认内容
          setClaudeMdContent('# CLAUDE.md\n\nWrite your project instructions here.\n')
        }
      } else {
        setClaudeMdContent('# CLAUDE.md\n\nWrite your project instructions here.\n')
        setClaudeMdPath('')
        message.warning('请先选择一个项目目录')
      }
      setClaudeMdVisible(true)
    } catch (err) {
      console.error('读取 claude.md 失败:', err)
      message.error('读取 claude.md 失败')
    }
  }

  const saveClaudeMd = async () => {
    if (claudeMdPath) {
      try {
        await tauriInvoke('write_text_file', { path: claudeMdPath, content: claudeMdContent })
        message.success('claude.md 已保存')
        setClaudeMdVisible(false)
      } catch (err) {
        message.error('保存失败: ' + String(err))
      }
    } else {
      message.warning('请先选择一个项目目录')
    }
  }

  const antTheme = currentTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm

  // 应用启动时：并行加载配置 + 检测 Claude 安装状态
  useEffect(() => {
    const { checkClaudeInstallation, getClaudeVersion } = useSettingsStore.getState()

    // 并行发起所有启动任务
    const configPromise = loadConfig().then(() => {
      const savedConfig = useSettingsStore.getState().config
      if (savedConfig?.general?.theme) {
        setThemeMode(savedConfig.general.theme as ThemeMode)
      }
    })

    // Claude 检测不阻塞 UI，fire-and-forget
    Promise.all([
      checkClaudeInstallation(),
      getClaudeVersion(),
      getAppVersion(),
    ])

    // 配置加载完成后立即显示主界面
    configPromise.then(() => {
      setIsLoading(false)
      // 移除 index.html 中的内联 splash
      ;(window as any).__removeSplash?.()

      // 首次启动检测：如果未完成引导，显示引导弹窗
      const savedConfig = useSettingsStore.getState().config
      if (!savedConfig?.general?.has_completed_onboarding) {
        setTimeout(() => setOnboardingVisible(true), 500)
      }
    }).catch(() => {
      setIsLoading(false)
      ;(window as any).__removeSplash?.()
    })
  }, [])

  // 监听网页端发来的会话切换请求
  useEffect(() => {
    const unlistenPromise = listen<string>('web-activate-session', (event) => {
      const sessionId = event.payload
      console.log('[Web] Received activate session request:', sessionId)
      useSessionStore.getState().setActiveSession(sessionId)
    })
    return () => { unlistenPromise.then(fn => fn()) }
  }, [])

  // 启动时自动检查更新（延迟 3 秒避免阻塞启动）+ 每小时自动检查
  useEffect(() => {
    const { checkForUpdates } = useSettingsStore.getState()

    // 启动时检查
    const startupTimer = setTimeout(() => {
      checkForUpdates()
    }, 3000)

    // 每小时检查一次
    const hourlyTimer = setInterval(() => {
      checkForUpdates()
    }, 60 * 60 * 1000)

    return () => {
      clearTimeout(startupTimer)
      clearInterval(hourlyTimer)
    }
  }, [])

  // 根据主题模式获取实际主题
  const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return mode
  }

  // 监听系统主题变化
  useEffect(() => {
    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        setCurrentThemeLocal(e.matches ? 'dark' : 'light')
        setCurrentTheme(e.matches ? 'dark' : 'light')
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [themeMode])

  // 初始化主题
  useEffect(() => {
    const resolved = resolveTheme(themeMode)
    setCurrentThemeLocal(resolved)
    setCurrentTheme(resolved)
  }, [themeMode])

  // 快捷键初始化：从配置加载自定义绑定
  useEffect(() => {
    useKeybindingStore.getState().loadBindings()
  }, [])

  // 快捷键处理函数（全局 keydown 和终端转发事件共用）
  const handleShortcut = (e: KeyboardEvent) => {
    const { matchesKeybinding, getKeybinding } = useKeybindingStore.getState()

    // 命令面板
    if (matchesKeybinding(e, getKeybinding('command-palette'))) {
      e.preventDefault()
      setCommandPaletteVisible(true)
      return
    }
    // 新建会话
    if (matchesKeybinding(e, getKeybinding('new-session'))) {
      e.preventDefault()
      const btn = document.querySelector('[data-testid="new-session-btn"]') as HTMLButtonElement
      btn?.click()
      return
    }
    // 关闭当前会话
    if (matchesKeybinding(e, getKeybinding('close-session'))) {
      e.preventDefault()
      const { activeSessionId, setClosedSession } = useSessionStore.getState()
      if (activeSessionId) {
        setClosedSession(activeSessionId)
      }
      return
    }
    // 上一个标签
    if (matchesKeybinding(e, getKeybinding('prev-session'))) {
      e.preventDefault()
      const { sessions, activeSessionId, setActiveSession } = useSessionStore.getState()
      if (sessions.length > 1 && activeSessionId) {
        const idx = sessions.findIndex(s => s.id === activeSessionId)
        const prevIdx = idx > 0 ? idx - 1 : sessions.length - 1
        setActiveSession(sessions[prevIdx].id)
      }
      return
    }
    // 下一个标签
    if (matchesKeybinding(e, getKeybinding('next-session'))) {
      e.preventDefault()
      const { sessions, activeSessionId, setActiveSession } = useSessionStore.getState()
      if (sessions.length > 1 && activeSessionId) {
        const idx = sessions.findIndex(s => s.id === activeSessionId)
        const nextIdx = idx < sessions.length - 1 ? idx + 1 : 0
        setActiveSession(sessions[nextIdx].id)
      }
      return
    }
    // 打开设置
    if (matchesKeybinding(e, getKeybinding('open-settings'))) {
      e.preventDefault()
      setSettingsVisible(true)
      return
    }
    // Token 统计
    if (matchesKeybinding(e, getKeybinding('token-stats'))) {
      e.preventDefault()
      setActivePanel('stats')
      return
    }
    // 窗口置顶
    if (matchesKeybinding(e, getKeybinding('toggle-pin'))) {
      e.preventDefault()
      toggleAlwaysOnTop()
      return
    }
  }

  // 键盘快捷键监听（全局）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框中的快捷键
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      handleShortcut(e)
    }

    window.addEventListener('keydown', handleKeyDown)

    // 监听终端转发的全局快捷键事件
    const handleTerminalShortcut = (e: Event) => {
      const originalEvent = (e as CustomEvent).detail?.originalEvent
      if (originalEvent) {
        handleShortcut(originalEvent)
      }
    }
    window.addEventListener('global-shortcut', handleTerminalShortcut)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('global-shortcut', handleTerminalShortcut)
    }
  }, [])

  // 切换置顶
  const toggleAlwaysOnTop = async () => {
    try {
      await appWindow.setAlwaysOnTop(!isAlwaysOnTop)
      setIsAlwaysOnTop(!isAlwaysOnTop)
    } catch (err) {
      console.error('置顶切换失败:', err)
    }
  }

  // 循环切换主题：light -> dark -> system -> light
  const cycleTheme = () => {
    const nextMode: ThemeMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light'
    setThemeMode(nextMode)
    // 保存到配置
    const { config, updateGeneralConfig } = useSettingsStore.getState()
    updateGeneralConfig({ ...config.general, theme: nextMode })
  }

  // 获取主题图标
  const getThemeIcon = () => {
    if (themeMode === 'system') {
      return <DesktopOutlined />
    }
    return currentTheme === 'dark' ? <MoonOutlined /> : <SunOutlined />
  }

  // 获取主题提示文字
  const getThemeTitle = () => {
    if (themeMode === 'light') return '浅色模式 (点击切换: 深色)'
    if (themeMode === 'dark') return '深色模式 (点击切换: 跟随系统)'
    return '跟随系统 (点击切换: 浅色)'
  }

  // 面板始终挂载，用 CSS display 切换可见性，避免卸载导致会话丢失

  // 加载期间返回 null，由 index.html 内联 splash 负责显示
  if (isLoading) {
    return null
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: antTheme,
        token: {
          colorPrimary: '#1677ff',
        },
      }}
    >
      <Layout className={`app-layout ${currentTheme}`}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={280}
          theme={currentTheme}
          className="app-sidebar"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <Sidebar collapsed={collapsed} theme={currentTheme} />
        </Sider>
        <Layout className="app-main">
          {/* 顶部工具栏 */}
          <div
            className={`app-toolbar ${currentTheme}`}
          >
            <div className="toolbar-left" />
            <div className="toolbar-right">
              <Space size={1}>
                <Tooltip title="终端">
                  <Button
                    type={activePanel === 'terminal' ? 'primary' : 'text'}
                    icon={<ThunderboltOutlined />}
                    onClick={() => setActivePanel('terminal')}
                    className="toolbar-btn"
                    size="small"
                  />
                </Tooltip>
                <Tooltip title="Markdown视图">
                  <Button
                    type={activePanel === 'markdown' ? 'primary' : 'text'}
                    icon={<FileTextOutlined />}
                    onClick={() => setActivePanel('markdown')}
                    className="toolbar-btn"
                    size="small"
                  />
                </Tooltip>
                <Tooltip title="Token统计">
                  <Button
                    type={activePanel === 'stats' ? 'primary' : 'text'}
                    icon={<BarChartOutlined />}
                    onClick={() => setActivePanel('stats')}
                    className="toolbar-btn"
                    size="small"
                  />
                </Tooltip>
                <Tooltip title="检查点">
                  <Button
                    type="text"
                    icon={<SaveOutlined />}
                    onClick={() => setCheckpointVisible(true)}
                    className="toolbar-btn"
                    size="small"
                  />
                </Tooltip>
                <Tooltip title={getThemeTitle()}>
                  <Button
                    type="text"
                    icon={getThemeIcon()}
                    onClick={cycleTheme}
                    className="toolbar-btn"
                    size="small"
                  />
                </Tooltip>
                <Tooltip title="设置">
                  <Button
                    type="text"
                    icon={<SettingOutlined />}
                    onClick={() => setSettingsVisible(true)}
                    className="toolbar-btn"
                    size="small"
                  />
                </Tooltip>
              </Space>
              <Tooltip title={isAlwaysOnTop ? '取消置顶' : '置顶显示'}>
                <Button
                  type={isAlwaysOnTop ? 'primary' : 'text'}
                  icon={<PushpinOutlined />}
                  onClick={toggleAlwaysOnTop}
                  className="toolbar-btn"
                  size="small"
                />
              </Tooltip>
              <Tooltip title="最小化">
                <Button
                  type="text"
                  icon={<MinusOutlined />}
                  onClick={handleMinimize}
                  className="window-btn"
                  size="small"
                />
              </Tooltip>
              <Tooltip title={isMaximized ? "还原" : "最大化"}>
                <Button
                  type="text"
                  icon={isMaximized ? <CompressOutlined /> : <ExpandOutlined />}
                  onClick={handleMaximize}
                  className="window-btn"
                  size="small"
                />
              </Tooltip>
              <Tooltip title="关闭">
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={handleClose}
                  className="window-btn window-close"
                  size="small"
                />
              </Tooltip>
            </div>
          </div>
          {/* 标签栏 */}
          <TabBar />
          <Content className="app-content">
            <div style={{ display: activePanel === 'terminal' ? 'block' : 'none', width: '100%', height: '100%' }}>
              <MultiTerminal />
            </div>
            <div style={{ display: activePanel === 'stats' ? 'block' : 'none', width: '100%', height: '100%', overflow: 'auto' }}>
              <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spin /></div>}>
                <TokenStatsPanel />
              </Suspense>
            </div>
            <div style={{ display: activePanel === 'markdown' ? 'block' : 'none', width: '100%', height: '100%' }}>
              <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Spin /></div>}>
                <MarkdownPanel
                  sessionId={activeSession?.cliSessionId || activeSession?.id}
                  projectPath={activeSession?.projectPath}
                />
              </Suspense>
            </div>
          </Content>
          {/* 底部状态栏 */}
          <div className={`status-bar ${currentTheme}`}>
            <div className="status-left">
              <div
                className="status-item file-browser"
                onClick={() => setFileBrowserVisible(true)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  openInExplorer()
                }}
              >
                <FolderOpenOutlined />
                <span className="status-text">{currentProjectName || '未选择文件'}</span>
              </div>
              <div className="status-divider" />
              <Tooltip title="编辑 CLAUDE.md 配置">
                <Button
                  type="text"
                  icon={<QuestionCircleOutlined />}
                  onClick={openClaudeMd}
                  className="status-btn"
                  size="small"
                >
                  CLAUDE.md
                </Button>
              </Tooltip>
              <div className="status-divider" />
              <Tooltip title="Claude Code 内置指令">
                <Button
                  type="text"
                  icon={<CodeOutlined />}
                  onClick={() => setClaudeCommandsVisible(true)}
                  className="status-btn"
                  size="small"
                >
                  Claude指令
                </Button>
              </Tooltip>
            </div>
            <div className="status-right">
              <Tooltip title="快捷指令 (Ctrl+K)">
                <Button
                  type="text"
                  icon={<MacCommandOutlined />}
                  onClick={() => setCommandPaletteVisible(true)}
                  className="status-btn"
                  size="small"
                >
                  快捷键
                </Button>
              </Tooltip>
              <Tooltip title="任务队列">
                <Button
                  type="text"
                  icon={<OrderedListOutlined />}
                  className="status-btn"
                  size="small"
                >
                  任务
                </Button>
              </Tooltip>
              <Tooltip title="AgentHub - AI Agent 协作管理">
                <Button
                  type="text"
                  icon={<RobotOutlined />}
                  className="status-btn"
                  size="small"
                  onClick={() => setAgentHubVisible(true)}
                >
                  AgentHub
                </Button>
              </Tooltip>
              <Tooltip title="Team - 多 Agent 协作监控">
                <Button
                  type="text"
                  icon={<TeamOutlined />}
                  className="status-btn"
                  size="small"
                  onClick={() => setTeamVisible(true)}
                >
                  Team
                </Button>
              </Tooltip>
              <Tooltip title="仪表盘">
                <Button
                  type="text"
                  icon={<DashboardOutlined />}
                  className="status-btn"
                  size="small"
                  onClick={() => setDashboardVisible(true)}
                >
                  仪表盘
                </Button>
              </Tooltip>
              <div className="status-divider" />
              <Tooltip title={updateStatus === 'available' ? '有新版本可用，点击设置查看' : `v${appVersion}`}>
                <span
                  className="status-info"
                  style={{ cursor: updateStatus === 'available' ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (updateStatus === 'available') {
                      setSettingsVisible(true)
                    }
                  }}
                >
                  {updateStatus === 'available' ? (
                    <Badge dot color="orange" offset={[4, 0]}>
                      <CloudOutlined style={{ marginRight: 4 }} />
                      v{appVersion}
                    </Badge>
                  ) : (
                    <>v{appVersion || '...'} </>
                  )}
                </span>
              </Tooltip>
            </div>
          </div>
        </Layout>
      </Layout>

      {/* CLAUDE.md 编辑器 */}
      <Modal
        title="编辑 CLAUDE.md"
        open={claudeMdVisible}
        onOk={saveClaudeMd}
        onCancel={() => setClaudeMdVisible(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Input.TextArea
          value={claudeMdContent}
          onChange={(e) => setClaudeMdContent(e.target.value)}
          rows={15}
          className="claude-md-editor"
          placeholder="输入 CLAUDE.md 内容..."
        />
      </Modal>

      <Suspense fallback={null}>
        <SettingsPanel
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          theme={currentTheme}
          onThemeChange={(t) => {
            setThemeMode(t as ThemeMode)
            // 保存到配置
            const { config, updateGeneralConfig } = useSettingsStore.getState()
            updateGeneralConfig({ ...config.general, theme: t as string })
          }}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CommandPalette
          visible={commandPaletteVisible}
          onClose={() => setCommandPaletteVisible(false)}
          onNewSession={() => {
            const btn = document.querySelector('[data-testid="new-session-btn"]') as HTMLButtonElement
            btn?.click()
          }}
          onCloseSession={() => {
            const { activeSessionId, setClosedSession } = useSessionStore.getState()
            if (activeSessionId) setClosedSession(activeSessionId)
          }}
          onPrevSession={() => {
            const { sessions, activeSessionId, setActiveSession } = useSessionStore.getState()
            if (sessions.length > 1 && activeSessionId) {
              const idx = sessions.findIndex(s => s.id === activeSessionId)
              const prevIdx = idx > 0 ? idx - 1 : sessions.length - 1
              setActiveSession(sessions[prevIdx].id)
            }
          }}
          onNextSession={() => {
            const { sessions, activeSessionId, setActiveSession } = useSessionStore.getState()
            if (sessions.length > 1 && activeSessionId) {
              const idx = sessions.findIndex(s => s.id === activeSessionId)
              const nextIdx = idx < sessions.length - 1 ? idx + 1 : 0
              setActiveSession(sessions[nextIdx].id)
            }
          }}
          onOpenStats={() => setActivePanel('stats')}
          onOpenSettings={() => setSettingsVisible(true)}
          onTogglePin={toggleAlwaysOnTop}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ClaudeCommandsPanel
          visible={claudeCommandsVisible}
          onClose={() => setClaudeCommandsVisible(false)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CheckpointModal
          visible={checkpointVisible}
          onClose={() => setCheckpointVisible(false)}
          theme={currentTheme}
        />
      </Suspense>

      <Suspense fallback={null}>
        <FileBrowserModal
          visible={fileBrowserVisible}
          onClose={() => setFileBrowserVisible(false)}
          projectPath={activeSession?.projectPath || ''}
          theme={currentTheme}
        />
      </Suspense>

      <Suspense fallback={null}>
        <DashboardModal
          visible={dashboardVisible}
          onClose={() => setDashboardVisible(false)}
          theme={currentTheme}
        />
      </Suspense>

      {/* AgentHub 面板 */}
      <Modal
        title={
          <Space>
            <RobotOutlined />
            <span>AgentHub - AI Agent 协作管理</span>
          </Space>
        }
        open={agentHubVisible}
        onCancel={() => setAgentHubVisible(false)}
        footer={null}
        width="85vw"
        style={{ top: 10 }}
        styles={{ body: { height: 'calc(100vh - 80px)', padding: 0, overflow: 'hidden' } }}
        className="agenthub-modal"
        destroyOnClose={false}
        maskClosable={false}
        centered
      >
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>}>
          <AgentHubPanel />
        </Suspense>
      </Modal>

      {/* Team 面板 */}
      <Modal
        title={
          <Space>
            <TeamOutlined />
            <span>Team - 多 Agent 协作监控</span>
          </Space>
        }
        open={teamVisible}
        onCancel={() => setTeamVisible(false)}
        footer={null}
        width="85vw"
        style={{ top: 10 }}
        styles={{ body: { height: 'calc(100vh - 80px)', padding: 0, overflow: 'hidden' } }}
        className="team-modal"
        destroyOnClose={false}
        maskClosable={false}
        centered
      >
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>}>
          <TeamPanel />
        </Suspense>
      </Modal>

      {/* 新手引导 */}
      <Suspense fallback={null}>
        <OnboardingModal
          visible={onboardingVisible}
          onClose={() => setOnboardingVisible(false)}
          claudeInstalled={claudeInstalled}
        />
      </Suspense>
    </ConfigProvider>
  )
}

export default App
