import { useState, useEffect } from 'react'
import { Layout, theme, Button, Space, ConfigProvider, Spin } from 'antd'
import {
  SettingOutlined,
  MoonOutlined,
  SunOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
  PushpinOutlined,
  DesktopOutlined,
  LoadingOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { getCurrentWindow } from '@tauri-apps/api/window'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import MultiTerminal from './components/MultiTerminal'
import SettingsPanel from './components/SettingsPanel'
import TokenStatsPanel from './components/TokenStatsPanel'
import CommandPalette from './components/CommandPalette'
import CheckpointModal from './components/CheckpointModal'
import { useSettingsStore } from './stores/settingsStore'
import './styles/App.css'

const { Content, Sider } = Layout

// 定义内容面板类型
type PanelType = 'terminal' | 'stats'

// 主题模式类型
type ThemeMode = 'light' | 'dark' | 'system'

function App() {
  const [collapsed] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [currentTheme, setCurrentThemeLocal] = useState<'light' | 'dark'>('dark')
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [checkpointVisible, setCheckpointVisible] = useState(false)
  const [activePanel, setActivePanel] = useState<PanelType>('terminal')
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const { loadConfig, setCurrentTheme } = useSettingsStore()

  const antTheme = currentTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm

  // 应用启动时加载配置
  useEffect(() => {
    loadConfig().then(() => {
      // 从配置读取主题设置
      const savedConfig = useSettingsStore.getState().config
      if (savedConfig?.general?.theme) {
        setThemeMode(savedConfig.general.theme as ThemeMode)
      }
      // 加载完成后延迟一点显示主界面，避免闪烁
      setTimeout(() => setIsLoading(false), 100)
    }).catch(() => {
      setIsLoading(false)
    })
  }, [loadConfig])

  // 启动时检测 Claude 安装状态（异步，不阻塞 UI）
  useEffect(() => {
    const { checkClaudeInstallation, getClaudeVersion } = useSettingsStore.getState()
    checkClaudeInstallation()
    getClaudeVersion()
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

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K 打开命令面板
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteVisible(true)
      }
      // Ctrl+Shift+T 打开Token统计
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        setActivePanel('stats')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 切换置顶
  const toggleAlwaysOnTop = async () => {
    try {
      const appWindow = getCurrentWindow()
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

  const renderContent = () => {
    switch (activePanel) {
      case 'stats':
        return <TokenStatsPanel />
      case 'terminal':
      default:
        return <MultiTerminal />
    }
  }

  // 启动画面
  if (isLoading) {
    return (
      <div className={`app-splash ${currentTheme}`}>
        <div className="splash-content">
          <div className="splash-logo">🚀</div>
          <div className="splash-title">智码 AICoder</div>
          <div className="splash-subtitle">AI 驱动的智能编程助手</div>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: currentTheme === 'dark' ? '#69b1ff' : '#1677ff' }} spin />} />
        </div>
      </div>
    )
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
        >
          <Sidebar collapsed={collapsed} />
        </Sider>
        <Layout className="app-main">
          <div className="app-header">
            <TabBar />
            <Space className="header-actions">
              <Button
                type={activePanel === 'terminal' ? 'primary' : 'text'}
                icon={<ThunderboltOutlined />}
                onClick={() => setActivePanel('terminal')}
                title="终端"
              >
                终端
              </Button>
              <Button
                type={activePanel === 'stats' ? 'primary' : 'text'}
                icon={<BarChartOutlined />}
                onClick={() => setActivePanel('stats')}
                title="Token统计 (Ctrl+Shift+T)"
              >
                Token统计
              </Button>
              <Button
                type="text"
                icon={<SaveOutlined />}
                onClick={() => setCheckpointVisible(true)}
                title="检查点管理"
              >
                检查点
              </Button>
              <div className="header-divider" />
              <Button
                type={isAlwaysOnTop ? 'primary' : 'text'}
                icon={<PushpinOutlined />}
                onClick={toggleAlwaysOnTop}
                title={isAlwaysOnTop ? '取消置顶' : '置顶显示'}
              />
              <Button
                type="text"
                icon={getThemeIcon()}
                onClick={cycleTheme}
                title={getThemeTitle()}
              />
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => setSettingsVisible(true)}
                title="设置"
              />
            </Space>
          </div>
          <Content className="app-content">
            {renderContent()}
          </Content>
        </Layout>
      </Layout>

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

      <CommandPalette
        visible={commandPaletteVisible}
        onClose={() => setCommandPaletteVisible(false)}
        onOpenStats={() => setActivePanel('stats')}
      />

      <CheckpointModal
        visible={checkpointVisible}
        onClose={() => setCheckpointVisible(false)}
        theme={currentTheme}
      />
    </ConfigProvider>
  )
}

export default App
