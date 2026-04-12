import { useState, useEffect } from 'react'
import { Layout, theme, Button, Space, ConfigProvider, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  SettingOutlined,
  MoonOutlined,
  SunOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
  PushpinOutlined,
  DesktopOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { getCurrentWindow } from '@tauri-apps/api/window'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import MultiTerminal from './components/MultiTerminal'
import SettingsPanel from './components/SettingsPanel'
import TokenStatsPanel from './components/TokenStatsPanel'
import CommandPalette from './components/CommandPalette'
import './styles/App.css'

const { Content, Sider } = Layout

// 定义内容面板类型
type PanelType = 'terminal' | 'stats'

// 主题模式类型
type ThemeMode = 'light' | 'dark' | 'system'

function App() {
  const [collapsed] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark')
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [activePanel, setActivePanel] = useState<PanelType>('terminal')
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)

  const antTheme = currentTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm

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
        setCurrentTheme(e.matches ? 'dark' : 'light')
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [themeMode])

  // 初始化主题
  useEffect(() => {
    setCurrentTheme(resolveTheme(themeMode))
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

  // 主题菜单
  const themeMenuItems: MenuProps['items'] = [
    {
      key: 'light',
      icon: currentTheme === 'light' ? <CheckOutlined /> : <SunOutlined />,
      label: '浅色',
      onClick: () => setThemeMode('light'),
    },
    {
      key: 'dark',
      icon: currentTheme === 'dark' ? <CheckOutlined /> : <MoonOutlined />,
      label: '深色',
      onClick: () => setThemeMode('dark'),
    },
    {
      key: 'system',
      icon: themeMode === 'system' ? <CheckOutlined /> : <DesktopOutlined />,
      label: '跟随系统',
      onClick: () => setThemeMode('system'),
    },
  ]

  const renderContent = () => {
    switch (activePanel) {
      case 'stats':
        return <TokenStatsPanel />
      case 'terminal':
      default:
        return <MultiTerminal />
    }
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
              <div className="header-divider" />
              <Button
                type={isAlwaysOnTop ? 'primary' : 'text'}
                icon={<PushpinOutlined />}
                onClick={toggleAlwaysOnTop}
                title={isAlwaysOnTop ? '取消置顶' : '置顶显示'}
              />
              <Dropdown
                menu={{ items: themeMenuItems, selectedKeys: [themeMode] }}
                trigger={['click']}
              >
                <Button
                  type="text"
                  icon={currentTheme === 'dark' ? <MoonOutlined /> : <SunOutlined />}
                  title="切换主题"
                />
              </Dropdown>
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
        }}
      />

      <CommandPalette
        visible={commandPaletteVisible}
        onClose={() => setCommandPaletteVisible(false)}
        onOpenStats={() => setActivePanel('stats')}
      />
    </ConfigProvider>
  )
}

export default App
