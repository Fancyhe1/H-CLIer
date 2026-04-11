import { useState, useEffect } from 'react'
import { Layout, theme, Button, Space, ConfigProvider } from 'antd'
import {
  SettingOutlined,
  MoonOutlined,
  SunOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
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

function App() {
  const [collapsed] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark')
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [activePanel, setActivePanel] = useState<PanelType>('terminal')

  const antTheme = currentTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm

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
                title="终端 (Ctrl+K)"
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
                type="text"
                icon={currentTheme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={() => setCurrentTheme(currentTheme === 'dark' ? 'light' : 'dark')}
              />
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => setSettingsVisible(true)}
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
        onThemeChange={setCurrentTheme}
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
