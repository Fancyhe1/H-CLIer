import React, { useEffect, useState, useMemo } from 'react'
import { Tabs, Alert, Button, Space, Typography, Tag, Select, Tooltip, message } from 'antd'
import {
  DashboardOutlined,
  ProjectOutlined,
  RobotOutlined,
  SettingOutlined,
  ReloadOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  MailOutlined,
  BranchesOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import TaskBoard from './TaskBoard'
import BrainPanel from './BrainPanel'
import AgentMonitor from './AgentMonitor'
import MessagePanel from './MessagePanel'
import WorkflowPanel from './WorkflowPanel'
import AgentSettingsPanel from './AgentSettingsPanel'
import { useAgentHubStore } from '../../stores/agentHubStore'
import { useSessionStore } from '../../stores/sessionStore'
import '../../styles/AgentHub.css'

const { Text } = Typography

interface ProjectInfo {
  path: string
  name: string
  sessionCount: number
  isInitialized: boolean
}

const AgentHubPanel: React.FC = () => {
  const {
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
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [initStatus, setInitStatus] = useState<Record<string, boolean>>({})
  const [checking, setChecking] = useState(false)

  // 从会话列表中提取项目（按 projectPath 分组）
  const projects = useMemo(() => {
    const map = new Map<string, { names: Set<string>; count: number }>()
    sessions.forEach((s) => {
      if (!s.projectPath) return
      const existing = map.get(s.projectPath)
      if (existing) {
        existing.names.add(s.title)
        existing.count++
      } else {
        map.set(s.projectPath, { names: new Set([s.title]), count: 1 })
      }
    })
    const result: ProjectInfo[] = []
    map.forEach((val, path) => {
      // 用第一个会话标题作为项目名，或者用文件夹名
      const folderName = path.split('\\').pop() || path.split('/').pop() || path
      const name = val.names.size === 1 ? Array.from(val.names)[0] : folderName
      result.push({
        path,
        name,
        sessionCount: val.count,
        isInitialized: initStatus[path] ?? false,
      })
    })
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [sessions, initStatus])

  // 检查所有项目的初始化状态
  useEffect(() => {
    if (projects.length === 0) return
    setChecking(true)
    Promise.all(
      projects.map(async (p) => {
        const result = await checkInitialized(p.path)
        return { path: p.path, result }
      })
    ).then((results) => {
      const status: Record<string, boolean> = {}
      results.forEach((r) => {
        status[r.path] = r.result
      })
      setInitStatus(status)
      setChecking(false)

      // 自动选择第一个已初始化的项目，或第一个项目
      if (!selectedPath) {
        const initialized = results.find((r) => r.result)
        if (initialized) {
          setSelectedPath(initialized.path)
          setProject(initialized.path)
        } else if (results.length > 0) {
          setSelectedPath(results[0].path)
        }
      }
    })
  }, [projects.length])

  // 选择项目时更新状态
  useEffect(() => {
    if (selectedPath && initStatus[selectedPath]) {
      setProject(selectedPath)
    }
  }, [selectedPath, initStatus])

  const handleInit = async () => {
    if (!selectedPath) return
    try {
      await initHub(selectedPath)
      setInitStatus((prev) => ({ ...prev, [selectedPath]: true }))
    } catch (e: any) {
      // 错误已在 store 中记录
    }
  }

  const handleRefresh = async () => {
    if (!selectedPath) return

    // 先检查目录是否存在
    const isInit = await checkInitialized(selectedPath)
    setInitStatus((prev) => ({ ...prev, [selectedPath]: isInit }))

    if (isInit) {
      // 目录正常，加载数据
      await setProject(selectedPath)
      await Promise.all([
        loadTasks(),
        loadAgentRoles(),
        loadActiveAgents(),
        loadEvents(),
      ])
    } else {
      // 目录不存在或不完整，重置状态，显示初始化按钮
      message.warning('AgentHub 目录不存在或不完整，请重新初始化')
    }
  }

  const handleBrowse = async () => {
    try {
      const path = await invoke<string | null>('select_folder')
      if (path) {
        setSelectedPath(path)
      }
    } catch (e) {
      console.error('选择文件夹失败:', e)
    }
  }

  const handleSelectProject = (path: string) => {
    setSelectedPath(path)
  }

  // 项目下拉选择器
  const projectSelector = (
    <div className="agenthub-project-selector">
      <Space>
        <FolderOpenOutlined />
        <Select
          value={selectedPath || undefined}
          onChange={handleSelectProject}
          placeholder="选择项目..."
          style={{ minWidth: 240, maxWidth: 400 }}
          loading={checking}
          showSearch
          filterOption={(input, option) => {
            const name = option?.label?.toString() || ''
            const path = option?.value?.toString() || ''
            return name.toLowerCase().includes(input.toLowerCase()) ||
                   path.toLowerCase().includes(input.toLowerCase())
          }}
          options={projects.map((p) => ({
            value: p.path,
            label: (
              <div className="project-option">
                <span className="project-option-name">
                  {p.isInitialized && <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} />}
                  {p.name}
                </span>
                <span className="project-option-meta">
                  <Tag>{p.sessionCount}</Tag>
                </span>
              </div>
            ),
          }))}
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
        <Tooltip title={selectedPath || '未选择'}>
          <Text type="secondary" className="project-path-hint" ellipsis>
            {selectedPath ? (selectedPath.split('\\').pop() || selectedPath.split('/').pop()) : ''}
          </Text>
        </Tooltip>
      </Space>
    </div>
  )

  // 未选择项目
  if (!selectedPath) {
    return (
      <div className="agenthub-panel agenthub-empty">
        {projectSelector}
        <div className="empty-content">
          <RobotOutlined className="empty-icon" />
          <Text type="secondary">请从上方选择一个项目</Text>
        </div>
      </div>
    )
  }

  // 选中的项目未初始化
  if (!initStatus[selectedPath]) {
    return (
      <div className="agenthub-panel">
        {projectSelector}
        <div className="agenthub-empty-inline">
          <RobotOutlined className="empty-icon" style={{ fontSize: 36 }} />
          <Text strong style={{ fontSize: 15 }}>AgentHub 未初始化</Text>
          <Text type="secondary">此项目尚未启用 AgentHub，初始化后可使用任务管理、项目大脑等功能</Text>
          <Button
            type="primary"
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
      key: 'messages',
      label: (
        <span>
          <MailOutlined /> 消息
        </span>
      ),
      children: <MessagePanel />,
    },
    {
      key: 'workflows',
      label: (
        <span>
          <BranchesOutlined /> 工作流
        </span>
      ),
      children: <WorkflowPanel />,
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
