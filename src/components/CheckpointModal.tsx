import { useState, useEffect } from 'react'
import {
  Modal,
  List,
  Button,
  Input,
  Space,
  Tag,
  Popconfirm,
  message,
  Empty,
  Tooltip,
  Descriptions,
  Typography,
} from 'antd'
import {
  SaveOutlined,
  RollbackOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  FileOutlined,
  EyeOutlined,
  DiffOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore } from '../stores/sessionStore'

const { Text, Title } = Typography
const { TextArea } = Input

interface Checkpoint {
  id: string
  sessionId: string
  name: string
  description?: string
  createdAt: string
  fileCount: number
  sizeBytes: number
}

interface CheckpointDiff {
  path: string
  status: string
}

interface CheckpointModalProps {
  visible: boolean
  onClose: () => void
  theme: 'light' | 'dark'
}

function CheckpointModal({ visible, onClose, theme }: CheckpointModalProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [diffVisible, setDiffVisible] = useState(false)
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null)
  const [diffList, setDiffList] = useState<CheckpointDiff[]>([])

  const { sessions, activeSessionId } = useSessionStore()

  // 获取当前会话的项目路径
  const currentSession = sessions.find(s => s.id === activeSessionId)

  // 加载检查点列表
  const loadCheckpoints = async () => {
    if (!activeSessionId) return

    setLoading(true)
    try {
      const list = await invoke<Checkpoint[]>('list_checkpoints', {
        sessionId: activeSessionId,
      })
      setCheckpoints(list)
    } catch (err) {
      console.error('加载检查点失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible && activeSessionId) {
      loadCheckpoints()
    }
  }, [visible, activeSessionId])

  // 创建检查点
  const handleCreate = async () => {
    if (!activeSessionId || !currentSession?.projectPath) {
      message.warning('请先选择一个会话')
      return
    }

    if (!newName.trim()) {
      message.warning('请输入检查点名称')
      return
    }

    setCreating(true)
    try {
      await invoke('create_checkpoint', {
        sessionId: activeSessionId,
        projectPath: currentSession.projectPath,
        name: newName.trim(),
        description: newDesc.trim() || null,
      })
      message.success('检查点创建成功')
      setNewName('')
      setNewDesc('')
      setShowCreateForm(false)
      loadCheckpoints()
    } catch (err) {
      message.error('创建失败: ' + String(err))
    } finally {
      setCreating(false)
    }
  }

  // 恢复检查点
  const handleRestore = async (checkpoint: Checkpoint) => {
    if (!currentSession?.projectPath) {
      message.warning('请先选择一个会话')
      return
    }

    try {
      await invoke<CheckpointDiff>('restore_checkpoint', {
        sessionId: activeSessionId,
        checkpointId: checkpoint.id,
        projectPath: currentSession.projectPath,
      })
      message.success('检查点已恢复')
    } catch (err) {
      message.error('恢复失败: ' + String(err))
    }
  }

  // 删除检查点
  const handleDelete = async (checkpointId: string) => {
    try {
      await invoke('delete_checkpoint', {
        sessionId: activeSessionId,
        checkpointId,
      })
      message.success('检查点已删除')
      loadCheckpoints()
    } catch (err) {
      message.error('删除失败: ' + String(err))
    }
  }

  // 查看差异
  const handleViewDiff = async (checkpoint: Checkpoint) => {
    if (!currentSession?.projectPath) {
      message.warning('请先选择一个会话')
      return
    }

    try {
      const diff = await invoke<CheckpointDiff[]>('get_checkpoint_diff', {
        sessionId: activeSessionId,
        checkpointId: checkpoint.id,
        projectPath: currentSession.projectPath,
      })
      setSelectedCheckpoint(checkpoint)
      setDiffList(diff)
      setDiffVisible(true)
    } catch (err) {
      message.error('获取差异失败: ' + String(err))
    }
  }

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // 格式化时间
  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 获取状态标签颜色
  const getStatusTag = (status: string) => {
    switch (status) {
      case 'added':
        return <Tag color="green">新增</Tag>
      case 'modified':
        return <Tag color="orange">修改</Tag>
      case 'deleted':
        return <Tag color="red">删除</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  return (
    <Modal
      title={
        <Space>
          <SaveOutlined />
          <span>检查点管理</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
      className={theme === 'dark' ? 'dark' : ''}
    >
      <div style={{ marginBottom: 16 }}>
        {!currentSession ? (
          <Text type="secondary">请先在左侧选择一个会话</Text>
        ) : (
          <>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="项目路径">
                <Text ellipsis style={{ maxWidth: 300 }}>
                  {currentSession.projectPath}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            {showCreateForm ? (
              <div style={{ marginTop: 16, padding: 16, background: theme === 'dark' ? '#2a2a2a' : '#f5f5f5', borderRadius: 8 }}>
                <Input
                  placeholder="检查点名称 (必填)"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <TextArea
                  placeholder="描述 (可选)"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={2}
                  style={{ marginBottom: 8 }}
                />
                <Space>
                  <Button type="primary" onClick={handleCreate} loading={creating}>
                    保存检查点
                  </Button>
                  <Button onClick={() => setShowCreateForm(false)}>
                    取消
                  </Button>
                </Space>
              </div>
            ) : (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => setShowCreateForm(true)}
                style={{ marginTop: 8 }}
              >
                创建检查点
              </Button>
            )}
          </>
        )}
      </div>

      <Title level={5}>检查点列表</Title>

      {checkpoints.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无检查点"
        />
      ) : (
        <List
          loading={loading}
          dataSource={checkpoints}
          renderItem={item => (
            <List.Item
              key={item.id}
              actions={[
                <Tooltip title="查看与当前文件的差异" key="diff">
                  <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => handleViewDiff(item)}
                  />
                </Tooltip>,
                <Tooltip title="恢复到该检查点" key="restore">
                  <Button
                    type="text"
                    icon={<RollbackOutlined />}
                    onClick={() => handleRestore(item)}
                  />
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title="确定删除此检查点？"
                  onConfirm={() => handleDelete(item.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <SaveOutlined />
                    <span>{item.name}</span>
                    {item.description && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        - {item.description}
                      </Text>
                    )}
                  </Space>
                }
                description={
                  <Space size="large">
                    <Text type="secondary">
                      <ClockCircleOutlined /> {formatTime(item.createdAt)}
                    </Text>
                    <Text type="secondary">
                      <FileOutlined /> {item.fileCount} 个文件
                    </Text>
                    <Text type="secondary">
                      {formatSize(item.sizeBytes)}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      {/* 差异查看弹窗 */}
      <Modal
        title={
          <Space>
            <DiffOutlined />
            <span>差异对比 - {selectedCheckpoint?.name}</span>
          </Space>
        }
        open={diffVisible}
        onCancel={() => setDiffVisible(false)}
        footer={
          <Button onClick={() => setDiffVisible(false)}>
            关闭
          </Button>
        }
        width={600}
      >
        {diffList.length === 0 ? (
          <Empty description="当前文件与检查点一致，没有变化" />
        ) : (
          <>
            <Descriptions size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="新增">
                {diffList.filter(d => d.status === 'added').length}
              </Descriptions.Item>
              <Descriptions.Item label="修改">
                {diffList.filter(d => d.status === 'modified').length}
              </Descriptions.Item>
              <Descriptions.Item label="删除">
                {diffList.filter(d => d.status === 'deleted').length}
              </Descriptions.Item>
            </Descriptions>
            <List
              size="small"
              dataSource={diffList}
              style={{ maxHeight: 400, overflow: 'auto' }}
              renderItem={item => (
                <List.Item key={item.path}>
                  <Space>
                    {getStatusTag(item.status)}
                    <Text code>{item.path}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>
    </Modal>
  )
}

export default CheckpointModal
