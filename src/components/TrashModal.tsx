import { useState, useEffect } from 'react'
import {
  Modal,
  List,
  Button,
  Space,
  Tag,
  Popconfirm,
  message,
  Empty,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  RestOutlined,
  DeleteFilled,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore } from '../stores/sessionStore'

const { Text, Title } = Typography

interface TrashSession {
  id: string
  projectPath: string
  title: string
  sessionType: string
  color?: string
  isFavorite: boolean
  isActive: boolean
  createdAt: string
  lastActivityAt: string
  deletedAt?: string
  messageCount: number
  cliSessionId?: string
  description?: string
}

interface TrashModalProps {
  visible: boolean
  onClose: () => void
  theme: 'light' | 'dark'
}

function TrashModal({ visible, onClose, theme }: TrashModalProps) {
  const [sessions, setSessions] = useState<TrashSession[]>([])
  const [loading, setLoading] = useState(false)
  const { fetchSessions } = useSessionStore()

  // 加载回收站会话
  const loadTrashSessions = async () => {
    setLoading(true)
    try {
      const list = await invoke<TrashSession[]>('get_trash_sessions')
      setSessions(list)
    } catch (err) {
      console.error('加载回收站失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible) {
      loadTrashSessions()
    }
  }, [visible])

  // 恢复会话
  const handleRestore = async (sessionId: string) => {
    try {
      await invoke('restore_from_trash', { sessionId })
      message.success('会话已恢复')
      loadTrashSessions()
      fetchSessions() // 刷新主会话列表
    } catch (err) {
      message.error('恢复失败: ' + String(err))
    }
  }

  // 彻底删除
  const handlePermanentDelete = async (sessionId: string) => {
    try {
      await invoke('permanently_delete', { sessionId })
      message.success('会话已彻底删除')
      loadTrashSessions()
    } catch (err) {
      message.error('删除失败: ' + String(err))
    }
  }

  // 清空回收站
  const handleEmptyTrash = async () => {
    try {
      const count = await invoke<number>('empty_trash')
      message.success(`已清空回收站，删除了 ${count} 个会话`)
      loadTrashSessions()
    } catch (err) {
      message.error('清空失败: ' + String(err))
    }
  }

  // 格式化时间
  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN')
  }

  return (
    <Modal
      title={
        <Space>
          <DeleteOutlined />
          <span>回收站</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={
        sessions.length > 0 ? (
          <Popconfirm
            title="确定要清空回收站吗？"
            description="此操作不可恢复，所有会话将被彻底删除"
            onConfirm={handleEmptyTrash}
            okText="清空"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteFilled />}>
              清空回收站
            </Button>
          </Popconfirm>
        ) : null
      }
      width={600}
      className={theme === 'dark' ? 'dark' : ''}
    >
      <Title level={5}>已删除的会话</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        回收站中的会话可以恢复或彻底删除
      </Text>

      {sessions.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="回收站为空"
        />
      ) : (
        <List
          loading={loading}
          dataSource={sessions}
          renderItem={item => (
            <List.Item
              key={item.id}
              actions={[
                <Tooltip title="恢复到会话列表" key="restore">
                  <Button
                    type="text"
                    icon={<RestOutlined />}
                    onClick={() => handleRestore(item.id)}
                  >
                    恢复
                  </Button>
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title="确定彻底删除此会话？"
                  description="此操作不可恢复"
                  onConfirm={() => handlePermanentDelete(item.id)}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="text" danger icon={<DeleteFilled />}>
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Tag color={item.sessionType === 'claude' ? 'blue' : 'default'}>
                      {item.sessionType === 'claude' ? 'Claude' : '终端'}
                    </Tag>
                    <span>{item.title}</span>
                  </Space>
                }
                description={
                  <Space size="large">
                    <Text type="secondary">
                      删除时间: {item.deletedAt ? formatTime(item.deletedAt) : '未知'}
                    </Text>
                    <Text type="secondary">
                      项目: {item.projectPath}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  )
}

export default TrashModal
