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
  BarChartOutlined,
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  SettingOutlined,
  PushpinOutlined,
  FontSizeOutlined,
} from '@ant-design/icons'
import { useKeybindingStore } from '../stores/keybindingStore'
import { usePhraseStore } from '../stores/phraseStore'
import '../styles/CommandPalette.css'

const { Text } = Typography

interface CommandItem {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  type: 'action' | 'phrase'
  action: () => void
  keywords: string[]
  shortcut?: string
}

interface CommandPaletteProps {
  visible: boolean
  onClose: () => void
  onNewSession?: () => void
  onCloseSession?: () => void
  onPrevSession?: () => void
  onNextSession?: () => void
  onOpenStats?: () => void
  onOpenSettings?: () => void
  onTogglePin?: () => void
}

function CommandPalette({
  visible,
  onClose,
  onNewSession,
  onCloseSession,
  onPrevSession,
  onNextSession,
  onOpenStats,
  onOpenSettings,
  onTogglePin,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { getKeybinding, formatKey } = useKeybindingStore()
  const { phrases, loadPhrases } = usePhraseStore()

  // 打开时加载常用语
  useEffect(() => {
    if (visible) {
      loadPhrases()
    }
  }, [visible])

  // 构建命令列表（常用语固定在最上方）
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    // 常用语命令（固定在最上方）
    phrases.forEach(phrase => {
      items.push({
        id: `phrase-${phrase.id}`,
        title: phrase.label,
        description: phrase.content.length > 50 ? phrase.content.slice(0, 50) + '...' : phrase.content,
        icon: <FontSizeOutlined />,
        type: 'phrase',
        action: () => {
          // 触发自定义事件，通知终端追加文本
          window.dispatchEvent(new CustomEvent('append-to-terminal', {
            detail: { text: phrase.content }
          }))
          onClose()
        },
        keywords: [phrase.label, phrase.content, '常用语', 'phrase'],
      })
    })

    // 操作命令
    items.push(
      {
        id: 'action-new-session',
        title: '新建会话',
        description: '创建一个新的 AI 对话会话',
        icon: <ThunderboltOutlined />,
        type: 'action',
        action: () => {
          onNewSession?.()
          onClose()
        },
        keywords: ['新建', '创建', '会话', 'new', 'session'],
        shortcut: formatKey(getKeybinding('new-session')),
      },
      {
        id: 'action-close-session',
        title: '关闭会话',
        description: '关闭当前活跃的会话标签',
        icon: <CloseOutlined />,
        type: 'action',
        action: () => {
          onCloseSession?.()
          onClose()
        },
        keywords: ['关闭', '会话', 'close', 'session'],
        shortcut: formatKey(getKeybinding('close-session')),
      },
      {
        id: 'action-prev-session',
        title: '上一个标签',
        description: '切换到左侧的会话标签',
        icon: <LeftOutlined />,
        type: 'action',
        action: () => {
          onPrevSession?.()
          onClose()
        },
        keywords: ['上一个', '标签', '切换', 'prev', 'tab'],
        shortcut: formatKey(getKeybinding('prev-session')),
      },
      {
        id: 'action-next-session',
        title: '下一个标签',
        description: '切换到右侧的会话标签',
        icon: <RightOutlined />,
        type: 'action',
        action: () => {
          onNextSession?.()
          onClose()
        },
        keywords: ['下一个', '标签', '切换', 'next', 'tab'],
        shortcut: formatKey(getKeybinding('next-session')),
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
        shortcut: formatKey(getKeybinding('token-stats')),
      },
      {
        id: 'action-settings',
        title: '打开设置',
        description: '打开应用设置面板',
        icon: <SettingOutlined />,
        type: 'action',
        action: () => {
          onOpenSettings?.()
          onClose()
        },
        keywords: ['设置', '配置', 'settings'],
        shortcut: formatKey(getKeybinding('open-settings')),
      },
      {
        id: 'action-toggle-pin',
        title: '窗口置顶',
        description: '切换窗口置顶状态',
        icon: <PushpinOutlined />,
        type: 'action',
        action: () => {
          onTogglePin?.()
          onClose()
        },
        keywords: ['置顶', '窗口', 'pin', 'always', 'top'],
        shortcut: formatKey(getKeybinding('toggle-pin')),
      },
    )

    return items
  }, [onClose, onNewSession, onCloseSession, onPrevSession, onNextSession, onOpenStats, onOpenSettings, onTogglePin, getKeybinding, formatKey, phrases])

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
                  style={{
                    background: index === selectedIndex ? '#eeeeee' : 'transparent',
                  }}
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
          <Text type="secondary" style={{ fontSize: 12 }} className="command-footer-text">
            <kbd>↑</kbd> <kbd>↓</kbd> 选择 <kbd>Enter</kbd> 执行
          </Text>
        </div>
      </div>
    </Modal>
  )
}

export default CommandPalette
