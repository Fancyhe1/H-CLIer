import { useState, useEffect, useMemo } from 'react'
import {
  Modal,
  Input,
  List,
  Typography,
  Tag,
  Empty,
} from 'antd'
import {
  SearchOutlined,
  ThunderboltOutlined,
  StarOutlined,
  MessageOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { useSessionStore } from '../stores/sessionStore'
import type { Session } from '../types/session'
import '../styles/CommandPalette.css'

const { Text } = Typography

interface CommandItem {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  type: 'session' | 'action'
  action: () => void
  keywords: string[]
  shortcut?: string
}

interface CommandPaletteProps {
  visible: boolean
  onClose: () => void
  onOpenSession?: (sessionId: string) => void
  onOpenStats?: () => void
}

function CommandPalette({
  visible,
  onClose,
  onOpenSession,
  onOpenStats,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { sessions, setActiveSession } = useSessionStore()

  // 构建命令列表
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    // 最近会话
    sessions.slice(0, 5).forEach((session: Session) => {
      items.push({
        id: `session-${session.id}`,
        title: session.title,
        description: `打开会话 - ${session.projectPath}`,
        icon: <MessageOutlined />,
        type: 'session',
        action: () => {
          setActiveSession(session.id)
          onOpenSession?.(session.id)
          onClose()
        },
        keywords: [session.title, session.projectPath, '会话', 'session'],
      })
    })

    // 收藏的会话
    sessions
      .filter(s => s.isFavorite)
      .forEach((session: Session) => {
        items.push({
          id: `favorite-${session.id}`,
          title: session.title,
          description: `收藏会话 - ${session.projectPath}`,
          icon: <StarOutlined style={{ color: '#faad14' }} />,
          type: 'session',
          action: () => {
            setActiveSession(session.id)
            onOpenSession?.(session.id)
            onClose()
          },
          keywords: [session.title, '收藏', 'favorite'],
        })
      })

    // 全局操作
    items.push(
      {
        id: 'action-new-session',
        title: '新建会话',
        description: '创建一个新的 AI 对话会话',
        icon: <ThunderboltOutlined />,
        type: 'action',
        action: () => {
          // 触发新建会话
          const btn = document.querySelector('[data-testid="new-session-btn"]') as HTMLButtonElement
          btn?.click()
          onClose()
        },
        keywords: ['新建', '创建', '会话', 'new', 'session'],
        shortcut: 'Ctrl+N',
      },
      {
        id: 'action-stats',
        title: 'Token 统计',
        description: '查看您的 API 使用统计',
        icon: <BarChartOutlined />,
        type: 'action',
        action: () => {
          onOpenStats?.()
          onClose()
        },
        keywords: ['统计', 'token', '用量'],
        shortcut: 'Ctrl+Shift+T',
      }
    )

    return items
  }, [sessions, onClose, onOpenSession, onOpenStats, setActiveSession])

  // 过滤命令
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands

    const query = search.toLowerCase()
    return commands.filter(cmd =>
      cmd.title.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.keywords.some(k => k.toLowerCase().includes(query))
    )
  }, [commands, search])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action()
          }
          break
        case 'Escape':
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, filteredCommands, selectedIndex, onClose])

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // 清理搜索
  useEffect(() => {
    if (!visible) {
      setSearch('')
      setSelectedIndex(0)
    }
  }, [visible])

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      className="command-palette-modal"
      closable={false}
      maskClosable
    >
      <div className="command-palette">
        <div className="command-input-wrapper">
          <SearchOutlined className="command-search-icon" />
          <Input
            placeholder="输入命令或搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="command-input"
            variant="borderless"
            autoFocus
          />
          <Tag className="command-shortcut-hint">ESC 关闭</Tag>
        </div>

        <div className="command-list">
          {filteredCommands.length === 0 ? (
            <Empty
              description="未找到命令"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: '40px 0' }}
            />
          ) : (
            <List
              dataSource={filteredCommands}
              renderItem={(item, index) => (
                <List.Item
                  className={`command-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="command-item-icon">{item.icon}</div>
                  <div className="command-item-content">
                    <div className="command-item-title">
                      <Text strong>{item.title}</Text>
                    </div>
                    <div className="command-item-desc">
                      <Text type="secondary" ellipsis>
                        {item.description}
                      </Text>
                    </div>
                  </div>
                  <div className="command-item-meta">
                    <Tag className={`command-type-${item.type}`}>
                      {item.type === 'session' ? '会话' : '操作'}
                    </Tag>
                    {item.shortcut && (
                      <kbd className="command-shortcut">{item.shortcut}</kbd>
                    )}
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>

        <div className="command-footer">
          <Text type="secondary" style={{ fontSize: 12 }}>
            <kbd>↑</kbd> <kbd>↓</kbd> 选择 <kbd>Enter</kbd> 执行
          </Text>
        </div>
      </div>
    </Modal>
  )
}

export default CommandPalette
