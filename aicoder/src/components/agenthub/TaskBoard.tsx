import React, { useEffect, useState } from 'react'
import { Card, Badge, Button, Tag, Space, Tooltip, Empty, message } from 'antd'
import {
  PlusOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useAgentHubStore, type Task, type TaskStatus, type Priority } from '../../stores/agentHubStore'
import TaskCreateModal from './TaskCreateModal'
import TaskDetail from './TaskDetail'

const statusColumns: { key: TaskStatus; title: string; color: string }[] = [
  { key: 'pending', title: '待处理', color: '#8c8c8c' },
  { key: 'running', title: '进行中', color: '#1890ff' },
  { key: 'done', title: '已完成', color: '#52c41a' },
  { key: 'failed', title: '失败', color: '#ff4d4f' },
]

const priorityColors: Record<Priority, string> = {
  critical: '#ff4d4f',
  high: '#fa8c16',
  medium: '#1890ff',
  low: '#8c8c8c',
}

const TaskBoard: React.FC = () => {
  const { tasks, loadTasks, updateTask, deleteTask, isLoading } = useAgentHubStore()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)

  useEffect(() => {
    loadTasks()
  }, [])

  const handleRun = async (taskId: string) => {
    try {
      await updateTask(taskId, { status: 'running' })
      message.success('任务已启动')
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
              <div className="column-header" style={{ borderLeftColor: col.color }}>
                {col.title}
                <Badge count={columnTasks.length} style={{ backgroundColor: col.color }} />
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
                        task.status === 'pending' || task.status === 'assigned' || task.status === 'blocked' ? (
                          <Space size={4}>
                            <Tooltip title="运行">
                              <PlayCircleOutlined
                                style={{ color: '#1890ff' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRun(task.id)
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
        />
      )}
    </div>
  )
}

export default TaskBoard
