import React from 'react'
import { Tabs, Spin, Alert, Button, Space, Typography } from 'antd'
import {
  DashboardOutlined,
  ProjectOutlined,
  RobotOutlined,
  SettingOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import TaskBoard from './TaskBoard'
import BrainPanel from './BrainPanel'
import AgentMonitor from './AgentMonitor'
import AgentSettingsPanel from './AgentSettingsPanel'
import { useAgentHubStore } from '../../stores/agentHubStore'
import '../../styles/AgentHub.css'

const { Text } = Typography

interface AgentHubPanelProps {
  projectPath: string | null
}

const AgentHubPanel: React.FC<AgentHubPanelProps> = ({ projectPath }) => {
  const {
    isInitialized,
    isLoading,
    error,
    activeSubPanel,
    setActiveSubPanel,
    initHub,
    checkInitialized,
    setProject,
    loadTasks,
    loadAgentRoles,
    loadActiveAgents,
    loadEvents,
  } = useAgentHubStore()

  const [initChecked, setInitChecked] = React.useState(false)

  // 检查是否已初始化
  React.useEffect(() => {
    if (projectPath) {
      checkInitialized(projectPath).then((result) => {
        setInitChecked(true)
        if (result) {
          setProject(projectPath)
        }
      })
    }
  }, [projectPath])

  const handleInit = async () => {
    if (!projectPath) return
    try {
      await initHub(projectPath)
    } catch (e: any) {
      // 错误已在 store 中记录
    }
  }

  const handleRefresh = async () => {
    await Promise.all([
      loadTasks(),
      loadAgentRoles(),
      loadActiveAgents(),
      loadEvents(),
    ])
  }

  // 等待初始化检查
  if (!initChecked && projectPath) {
    return (
      <div className="agenthub-panel agenthub-loading">
        <Spin tip="检查 AgentHub 状态..." />
      </div>
    )
  }

  // 未选择项目
  if (!projectPath) {
    return (
      <div className="agenthub-panel agenthub-empty">
        <div className="empty-content">
          <RobotOutlined className="empty-icon" />
          <Text type="secondary">请先选择一个项目文件夹</Text>
        </div>
      </div>
    )
  }

  // 未初始化
  if (!isInitialized) {
    return (
      <div className="agenthub-panel agenthub-empty">
        <div className="empty-content">
          <RobotOutlined className="empty-icon" />
          <Text strong style={{ fontSize: 16 }}>AgentHub 未初始化</Text>
          <Text type="secondary">初始化后可使用任务管理、项目大脑等功能</Text>
          <Button
            type="primary"
            size="large"
            loading={isLoading}
            onClick={handleInit}
          >
            初始化 AgentHub
          </Button>
        </div>
      </div>
    )
  }

  const tabItems = [
    {
      key: 'tasks',
      label: (
        <span>
          <DashboardOutlined /> 任务面板
        </span>
      ),
      children: <TaskBoard />,
    },
    {
      key: 'brain',
      label: (
        <span>
          <ProjectOutlined /> 项目大脑
        </span>
      ),
      children: <BrainPanel />,
    },
    {
      key: 'monitor',
      label: (
        <span>
          <RobotOutlined /> Agent监控
        </span>
      ),
      children: <AgentMonitor />,
    },
    {
      key: 'settings',
      label: (
        <span>
          <SettingOutlined /> 设置
        </span>
      ),
      children: <AgentSettingsPanel />,
    },
  ]

  return (
    <div className="agenthub-panel">
      {error && (
        <Alert
          message={error}
          type="error"
          closable
          showIcon
          className="agenthub-error"
        />
      )}

      <div className="agenthub-header">
        <Space>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={handleRefresh}
            loading={isLoading}
          >
            刷新
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeSubPanel}
        onChange={(key) => setActiveSubPanel(key as any)}
        items={tabItems}
        size="small"
        className="agenthub-tabs"
      />
    </div>
  )
}

export default AgentHubPanel
