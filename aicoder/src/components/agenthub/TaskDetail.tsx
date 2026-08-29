import React, { useEffect, useState } from 'react'
import {
  Drawer,
  Descriptions,
  Tag,
  Button,
  Space,
  Input,
  Select,
  message,
  Popconfirm,
  Typography,
  Divider,
  List,
  Modal,
} from 'antd'
import {
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useAgentHubStore, type Priority, type TaskStatus } from '../../stores/agentHubStore'
import ContextPreviewModal from './ContextPreviewModal'

const { Text, Paragraph } = Typography

interface TaskDetailProps {
  taskId: string
  onClose: () => void
  onRun?: (taskId: string) => void
}

const priorityColors: Record<Priority, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'default',
}

const statusLabels: Record<TaskStatus, { text: string; color: string }> = {
  pending: { text: '待处理', color: 'default' },
  assigned: { text: '已分配', color: 'purple' },
  running: { text: '进行中', color: 'processing' },
  ready: { text: '就绪', color: 'purple' },
  done: { text: '已完成', color: 'success' },
  failed: { text: '失败', color: 'error' },
  blocked: { text: '阻塞', color: 'warning' },
}

const TaskDetail: React.FC<TaskDetailProps> = ({ taskId, onClose, onRun }) => {
  const { tasks, updateTask, deleteTask, buildContext } = useAgentHubStore()
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  const task = tasks.find((t) => t.id === taskId)

  useEffect(() => {
    if (task) {
      setEditTitle(task.title)
      setEditDesc(task.description)
    }
  }, [task])

  if (!task) {
    return null
  }

  // 检查是否有未保存的修改
  const hasUnsavedChanges = editing && (editTitle !== task.title || editDesc !== task.description)

  const handleSave = async () => {
    try {
      await updateTask(taskId, {
        title: editTitle,
        description: editDesc,
      })
      setEditing(false)
      message.success('已保存')
    } catch (e: any) {
      message.error(`保存失败: ${e}`)
    }
  }

  const handleRun = async () => {
    // 如果有未保存的修改，先确认保存
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: '未保存的修改',
        content: '你有未保存的标题或描述修改，是否先保存？',
        okText: '保存',
        cancelText: '不保存',
        onOk: async () => {
          await handleSave()
        },
        onCancel: () => {
          setEditing(false)
        },
      })
      return
    }
    onRun?.(taskId)
  }

  const handleStatusChange = async (status: TaskStatus) => {
    try {
      await updateTask(taskId, { status })
      message.success(`状态已更新为 ${statusLabels[status].text}`)
    } catch (e: any) {
      message.error(`更新失败: ${e}`)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteTask(taskId)
      message.success('任务已删除')
      onClose()
    } catch (e: any) {
      message.error(`删除失败: ${e}`)
    }
  }

  const handleCopyContext = async () => {
    try {
      const context = await buildContext(taskId)
      await navigator.clipboard.writeText(context)
      message.success('上下文已复制到剪贴板')
    } catch (e: any) {
      message.error(`复制失败: ${e}`)
    }
  }

  const stInfo = statusLabels[task.status]

  return (
    <>
    <Drawer
      title={
        editing ? (
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            size="small"
            style={{ width: 300 }}
          />
        ) : (
          <Space>
            <span>{task.id}</span>
            <span>{task.title}</span>
          </Space>
        )
      }
      open
      onClose={onClose}
      width={480}
      maskClosable={false}
      extra={
        <Space>
          {editing ? (
            <>
              <Button size="small" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button size="small" type="primary" onClick={handleSave}>
                保存
              </Button>
            </>
          ) : (
            <>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
              >
                编辑
              </Button>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopyContext}
              >
                复制上下文
              </Button>
            </>
          )}
        </Space>
      }
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="状态">
          <Tag color={stInfo.color}>{stInfo.text}</Tag>
          <Select
            value={task.status}
            onChange={handleStatusChange}
            size="small"
            style={{ width: 100, marginLeft: 8 }}
            options={Object.entries(statusLabels).map(([key, val]) => ({
              value: key,
              label: val.text,
            }))}
          />
        </Descriptions.Item>

        <Descriptions.Item label="优先级">
          <Tag color={priorityColors[task.priority]}>{task.priority}</Tag>
        </Descriptions.Item>

        <Descriptions.Item label="标签">
          {task.tags.length > 0 ? (
            task.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
          ) : (
            <Text type="secondary">无</Text>
          )}
        </Descriptions.Item>

        <Descriptions.Item label="分配Agent">
          {task.assignedAgent || <Text type="secondary">未分配</Text>}
        </Descriptions.Item>

        <Descriptions.Item label="创建时间">{task.created}</Descriptions.Item>

        {task.startedAt && (
          <Descriptions.Item label="开始时间">{task.startedAt}</Descriptions.Item>
        )}

        {task.completedAt && (
          <Descriptions.Item label="完成时间">{task.completedAt}</Descriptions.Item>
        )}

        {task.result && (
          <Descriptions.Item label="结果">
            <Text type="success">{task.result}</Text>
          </Descriptions.Item>
        )}

        {task.error && (
          <Descriptions.Item label="错误">
            <Text type="danger">{task.error}</Text>
          </Descriptions.Item>
        )}
      </Descriptions>

      <Divider />

      <div className="task-detail-section">
        <Text strong>描述</Text>
        {editing ? (
          <Input.TextArea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={4}
            style={{ marginTop: 8 }}
          />
        ) : (
          <Paragraph style={{ marginTop: 8 }}>
            {task.description || <Text type="secondary">暂无描述</Text>}
          </Paragraph>
        )}
      </div>

      {task.subtasks.length > 0 && (
        <>
          <Divider />
          <div className="task-detail-section">
            <Text strong>子任务</Text>
            <List
              size="small"
              dataSource={task.subtasks}
              renderItem={(sub) => (
                <List.Item>
                  <Space>
                    <Tag color={sub.status === 'done' ? 'green' : 'default'}>
                      {sub.status === 'done' ? '✓' : '○'}
                    </Tag>
                    <Text>{sub.title}</Text>
                  </Space>
                </List.Item>
              )}
              style={{ marginTop: 8 }}
            />
          </div>
        </>
      )}

      {task.dependencies.length > 0 && (
        <>
          <Divider />
          <div className="task-detail-section">
            <Text strong>依赖任务</Text>
            <div style={{ marginTop: 8 }}>
              {task.dependencies.map((dep) => (
                <Tag key={dep}>{dep}</Tag>
              ))}
            </div>
          </div>
        </>
      )}

      <Divider />

      <div className="task-detail-actions">
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => setPreviewOpen(true)}
          >
            预览上下文
          </Button>
          {(task.status === 'pending' || task.status === 'assigned' || task.status === 'blocked' || task.status === 'failed') && (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRun}
            >
              启动任务
            </Button>
          )}
          {(task.status === 'running' || task.status === 'ready') && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => handleStatusChange('done')}
            >
              标记完成
            </Button>
          )}
          <Popconfirm
            title="确定删除此任务？"
            onConfirm={handleDelete}
            okText="删除"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />}>
              删除任务
            </Button>
          </Popconfirm>
        </Space>
      </div>
    </Drawer>

    <ContextPreviewModal
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      taskId={taskId}
    />
    </>
  )
}

export default TaskDetail
