import React, { useEffect, useState } from 'react'
import { Card, Badge, Button, Tag, Space, Tooltip, Empty, Modal, Radio, Checkbox, Typography, message } from 'antd'

const { Text } = Typography
import {
  PlusOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useAgentHubStore, type Task, type TaskStatus, type Priority } from '../../stores/agentHubStore'
import { useSessionStore } from '../../stores/sessionStore'
import TaskCreateModal from './TaskCreateModal'
import TaskDetail from './TaskDetail'

const statusColumns: { key: TaskStatus; title: string; tagColor: string; bgColor: string; borderColor: string }[] = [
  { key: 'pending', title: '待处理', tagColor: 'default', bgColor: '#6b7280', borderColor: '#6b7280' },
  { key: 'ready', title: '就绪', tagColor: 'purple', bgColor: '#a855f7', borderColor: '#a855f7' },
  { key: 'running', title: '进行中', tagColor: 'processing', bgColor: '#3b82f6', borderColor: '#3b82f6' },
  { key: 'done', title: '已完成', tagColor: 'success', bgColor: '#22c55e', borderColor: '#22c55e' },
  { key: 'failed', title: '失败', tagColor: 'error', bgColor: '#ef4444', borderColor: '#ef4444' },
]

const priorityColors: Record<Priority, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'default',
}

const TaskBoard: React.FC = () => {
  const { tasks, loadTasks, deleteTask, runTask, agentRoles, claudeCodeAgents, loadAgentRoles, loadClaudeCodeAgents, currentProjectPath, isLoading } = useAgentHubStore()
  const { setActiveSession, fetchSessions } = useSessionStore()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [runTaskId, setRunTaskId] = useState<string | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [selectedBrainSections, setSelectedBrainSections] = useState<string[]>([
    'architecture', 'conventions', 'state/current',
  ])

  useEffect(() => {
    loadTasks()
    loadAgentRoles()
    loadClaudeCodeAgents()
  }, [])

  // 点击运行按钮 → 弹出角色选择
  const handleRunClick = (taskId: string) => {
    setRunTaskId(taskId)
    setSelectedRoleId(null)
    setRunModalOpen(true)
  }

  // 确认运行 → 执行完整流程
  const handleRunConfirm = async () => {
    if (!runTaskId) return

    try {
      setRunModalOpen(false)

      // 1. 获取当前项目路径
      const { sessions, activeSessionId } = useSessionStore.getState()
      const activeSession = sessions.find(s => s.id === activeSessionId)
      const projectPath = currentProjectPath || activeSession?.projectPath || ''

      if (!projectPath) {
        message.warning('未检测到项目路径，请先打开一个项目')
        return
      }

      // 2. 判断是 Claude Code Agent 还是 AgentHub 角色
      const isClaudeCodeAgent = selectedRoleId?.startsWith('cc-')
      const agentRoleId = isClaudeCodeAgent ? undefined : (selectedRoleId || undefined)
      const ccAgentName = isClaudeCodeAgent && selectedRoleId
        ? selectedRoleId.replace('cc-', '')
        : null

      // 3. 调用后端 run_task，获取构建的上下文
      const context = await runTask(runTaskId, agentRoleId, selectedBrainSections)

      message.success('任务已启动，正在创建会话...')

      // 4. 创建新的 HCLIer 会话（用任务标题作为会话名称）
      const taskTitle = tasks.find(t => t.id === runTaskId)?.title || runTaskId
      const session = await invoke<{ id: string; title: string }>('create_session', {
        projectPath,
        title: `AgentHub: ${taskTitle}`,
        sessionType: 'claude',
      })

      // 5. 更新 Agent 记录的 sessionId
      const { activeAgents } = useAgentHubStore.getState()
      const newAgent = activeAgents.find(a => a.taskId === runTaskId)
      if (newAgent) {
        await useAgentHubStore.getState().updateAgentSession(newAgent.agentId, session.id)
      }

      // 6. 刷新会话列表
      await fetchSessions()

      // 7. 切换到新会话
      setActiveSession(session.id)

      // 8. 存储上下文（MultiTerminal 会在 PTY 就绪后读取并注入）
      sessionStorage.setItem(`agenthub-context-${session.id}`, context)
      if (ccAgentName) {
        sessionStorage.setItem(`agenthub-agent-${session.id}`, ccAgentName)
        console.log('[AgentHub] 存储 agent:', ccAgentName, 'session:', session.id)
      }
    } catch (e: any) {
      message.error(`启动失败: ${e}`)
    }
  }

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId)
      message.success('任务已删除')
    } catch (e: any) {
      message.error(`删除失败: ${e}`)
    }
  }

  // 按状态分组，blocked 和 assigned 归入 pending
  const getColumnTasks = (status: TaskStatus): Task[] => {
    return tasks.filter((t) => {
      if (status === 'pending') return t.status === 'pending' || t.status === 'assigned' || t.status === 'blocked'
      return t.status === status
    })
  }

  return (
    <div className="task-board">
      <div className="task-board-header">
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            新建任务
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadTasks} loading={isLoading}>
            刷新
          </Button>
        </Space>
      </div>

      <div className="task-columns">
        {statusColumns.map((col) => {
          const columnTasks = getColumnTasks(col.key)
          return (
            <div key={col.key} className="task-column">
              <div className="column-header" style={{ borderLeftColor: col.borderColor }}>
                {col.title}
                <Badge count={columnTasks.length} style={{ backgroundColor: col.bgColor }} />
              </div>
              <div className="column-body">
                {columnTasks.length === 0 ? (
                  <Empty description="暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  columnTasks.map((task) => (
                    <Card
                      key={task.id}
                      size="small"
                      hoverable
                      className="task-card"
                      onClick={() => setSelectedTask(task.id)}
                      extra={
                        task.status === 'pending' || task.status === 'assigned' || task.status === 'blocked' || task.status === 'failed' ? (
                          <Space size={4}>
                            <Tooltip title="运行">
                              <PlayCircleOutlined
                                style={{ color: '#1890ff' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRunClick(task.id)
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="删除">
                              <DeleteOutlined
                                style={{ color: '#ff4d4f' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(task.id)
                                }}
                              />
                            </Tooltip>
                          </Space>
                        ) : task.status === 'running' ? (
                          <Badge status="processing" />
                        ) : task.status === 'ready' ? (
                          <Space size={4}>
                            <Badge status="warning" text="就绪" />
                            <Tooltip title="删除">
                              <DeleteOutlined
                                style={{ color: '#ff4d4f', fontSize: 12 }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(task.id)
                                }}
                              />
                            </Tooltip>
                          </Space>
                        ) : null
                      }
                    >
                      <div className="task-card-id">{task.id}</div>
                      <div className="task-card-title">{task.title}</div>
                      <div className="task-card-meta">
                        <Tag color={priorityColors[task.priority]}>{task.priority}</Tag>
                        {task.tags?.map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </div>
                      {task.subtasks && task.subtasks.length > 0 && (
                        <div className="task-card-subtasks">
                          {task.subtasks.filter((s) => s.status === 'done').length}/
                          {task.subtasks.length} 子任务
                        </div>
                      )}
                    </Card>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <TaskCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      {selectedTask && (
        <TaskDetail
          taskId={selectedTask}
          onClose={() => setSelectedTask(null)}
          onRun={(taskId) => {
            setSelectedTask(null)
            handleRunClick(taskId)
          }}
        />
      )}

      {/* 选择 Agent 角色弹窗 */}
      <Modal
        title={
          <Space>
            <RobotOutlined />
            <span>运行任务</span>
          </Space>
        }
        open={runModalOpen}
        onOk={handleRunConfirm}
        onCancel={() => setRunModalOpen(false)}
        okText="启动任务"
        cancelText="取消"
        destroyOnClose
        maskClosable={false}
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择 Agent 角色</div>
          <Radio.Group
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Radio value={null}>
                <Space>
                  <span>默认角色</span>
                  <Tag>通用</Tag>
                </Space>
              </Radio>
              {agentRoles.map((role) => (
                <Radio key={role.name} value={role.name}>
                  <Space>
                    <span>{role.name}</span>
                    <Tag color="blue">{role.model}</Tag>
                    {role.tags?.slice(0, 2).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </Space>
                </Radio>
              ))}
              {claudeCodeAgents.length > 0 && (
                <>
                  <div style={{ marginTop: 8, marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Claude Code 内置 Agent</Text>
                  </div>
                  {claudeCodeAgents.map((agent) => (
                    <Radio key={`cc-${agent.name}`} value={`cc-${agent.name}`}>
                      <Space>
                        <span>{agent.name}</span>
                        <Tag color="cyan">Claude Code</Tag>
                        {agent.tools?.length > 0 && (
                          <Tag>{agent.tools.length} 工具</Tag>
                        )}
                      </Space>
                    </Radio>
                  ))}
                </>
              )}
            </Space>
          </Radio.Group>
        </div>

        <div style={{ marginBottom: 8, fontWeight: 500 }}>注入项目大脑内容</div>
        <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>
          选择要注入到会话中的项目知识，让 Agent 了解项目背景
        </div>
        <Checkbox.Group
          value={selectedBrainSections}
          onChange={(values) => setSelectedBrainSections(values as string[])}
        >
          <Space direction="vertical">
            <Checkbox value="architecture">架构概述</Checkbox>
            <Checkbox value="structure">目录结构</Checkbox>
            <Checkbox value="conventions">代码规范</Checkbox>
            <Checkbox value="decisions">技术决策</Checkbox>
            <Checkbox value="other">其他补充</Checkbox>
            <Checkbox value="state/current">当前状态</Checkbox>
          </Space>
        </Checkbox.Group>
        <div style={{ marginTop: 4 }}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0, fontSize: 12 }}
            onClick={() => setSelectedBrainSections([])}
          >
            全部取消
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default TaskBoard
