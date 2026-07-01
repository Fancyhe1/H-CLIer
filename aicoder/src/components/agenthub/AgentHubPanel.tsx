import React, { useEffect, useState, useMemo } from 'react'
import { Tabs, Spin, Alert, Button, Space, Select, Typography } from 'antd'
import {
  DashboardOutlined,
  ProjectOutlined,
  RobotOutlined,
  SettingOutlined,
  ReloadOutlined,
  FolderOpenOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import TaskBoard from './TaskBoard'
import BrainPanel from './BrainPanel'
import AgentMonitor from './AgentMonitor'
import AgentSettingsPanel from './AgentSettingsPanel'
import { useAgentHubStore } from '../../stores/agentHubStore'
import { useSessionStore } from '../../stores/sessionStore'
import '../../styles/AgentHub.css'

const { Text } = Typography

const AgentHubPanel: React.FC = () => {
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

  const { sessions } = useSessionStore()
  const [initChecked, setInitChecked] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // 从会话列表中提取唯一的工作区路径
  const workspaces = useMemo(() => {
    const paths = new Set<string>()
    sessions.forEach((s) => {
      if (s.projectPath) paths.add(s.projectPath)
    })
    return Array.from(paths).sort()
  }, [sessions])

  // 初始化时选择第一个工作区
  useEffect(() => {
    if (!selectedPath && workspaces.length > 0) {
      setSelectedPath(workspaces[0])
    }
  }, [workspaces])

  // 检查选中路径是否已初始化
  useEffect(() => {
    if (selectedPath) {
      checkInitialized(selectedPath).then((result) => {
        setInitChecked(true)
        if (result) {
          setProject(selectedPath)
        }
      })
    }
  }, [selectedPath])

  const handleInit = async () => {
    if (!selectedPath) return
    try {
      await initHub(selectedPath)
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

  const handleBrowse = async () => {
    try {
      const path = await invoke<string | null>('select_folder')
      if (path) {
        setSelectedPath(path)
        setInitChecked(false)
      }
    } catch (e) {
      console.error('选择文件夹失败:', e)
    }
  }

  const handleProjectChange = (value: string) => {
    setSelectedPath(value)
    setInitChecked(false)
  }

  // 项目选择器
  const projectSelector = (
    <div className="agenthub-project-selector">
      <Space>
        <FolderOpenOutlined />
        <Select
          value={selectedPath || undefined}
          onChange={handleProjectChange}
          placeholder="选择项目..."
          style={{ width: 300 }}
          options={workspaces.map((p) => ({
            value: p,
            label: p.split('\\').pop() || p.split('/').pop() || p,
          }))}
          showSearch
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
          }
          notFoundContent="暂无项目"
          dropdownRender={(menu) => (
            <>
              {menu}
              <div style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={handleBrowse}
                  block
                >
                  浏览文件夹...
                </Button>
              </div>
            </>
          )}
        />
        <Button
          icon={<FolderOpenOutlined />}
          size="small"
          onClick={handleBrowse}
        >
          浏览
        </Button>
      </Space>
    </div>
  )

  // 未选择项目
  if (!selectedPath) {
    return (
      <div className="agenthub-panel agenthub-empty">
        <div className="empty-content">
          {projectSelector}
          <RobotOutlined className="empty-icon" />
          <Text type="secondary">请从上方选择一个项目，或浏览文件夹</Text>
          <Button icon={<FolderOpenOutlined />} onClick={handleBrowse}>
            选择项目文件夹
          </Button>
        </div>
      </div>
    )
  }

  // 等待初始化检查
  if (!initChecked) {
    return (
      <div className="agenthub-panel agenthub-loading">
        {projectSelector}
        <Spin tip="检查 AgentHub 状态..." />
      </div>
    )
  }

  // 未初始化
  if (!isInitialized) {
    return (
      <div className="agenthub-panel agenthub-empty">
        <div className="empty-content">
          {projectSelector}
          <RobotOutlined className="empty-icon" />
          <Text strong style={{ fontSize: 16 }}>AgentHub 未初始化</Text>
          <Text type="secondary">当前项目尚未启用 AgentHub，初始化后可使用任务管理、项目大脑等功能</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{selectedPath}</Text>
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

  // 已初始化，显示主界面
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
      {projectSelector}

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
