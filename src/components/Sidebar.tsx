import { useState, useEffect } from 'react'
import {
  PlusOutlined,
  SearchOutlined,
  FolderOutlined,
  StarOutlined,
  StarFilled,
  MoreOutlined,
  EditOutlined,
  ExportOutlined,
  DeleteOutlined,
  CodeOutlined,
  DesktopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Input,
  Tree,
  Dropdown,
  Tag,
  Modal,
} from 'antd'
import type { MenuProps } from 'antd'
import { useSessionStore } from '../stores/sessionStore'
import CreateSessionModal from './CreateSessionModal'
import { handleExportSession } from '../utils/export'
import type { SessionType } from '../types/session'
import '../styles/Sidebar.css'

interface SidebarProps {
  collapsed?: boolean
}

const COLORS = [
  { name: '红色', value: 'red' },
  { name: '橙色', value: 'orange' },
  { name: '黄色', value: 'gold' },
  { name: '绿色', value: 'green' },
  { name: '青色', value: 'cyan' },
  { name: '蓝色', value: 'blue' },
  { name: '紫色', value: 'purple' },
  { name: '无', value: undefined },
]

function Sidebar(_props: SidebarProps) {
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState<SessionType>('claude')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editingSession, setEditingSession] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const {
    sessions,
    activeSessionId,
    fetchSessions,
    setActiveSession,
    toggleFavorite,
    setSessionColor,
    deleteSession,
    claudeSessions,
    terminalSessions,
  } = useSessionStore()

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // 处理导出
  const handleExportClick = async (sessionId: string, format: 'md' | 'html') => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return
    await handleExportSession(session, format)
  }

  // 创建右键菜单
  const createMenuItems = (sessionId: string, isFavorite: boolean): MenuProps['items'] => [
    {
      key: 'rename',
      icon: <EditOutlined />,
      label: '重命名',
      onClick: () => {
        const session = sessions.find((s) => s.id === sessionId)
        if (session) {
          setEditingSession(sessionId)
          setNewTitle(session.title)
        }
      },
    },
    {
      key: 'favorite',
      icon: isFavorite ? <StarFilled /> : <StarOutlined />,
      label: isFavorite ? '取消收藏' : '收藏',
      onClick: () => toggleFavorite(sessionId),
    },
    {
      key: 'color',
      label: '标记颜色',
      children: COLORS.map((c) => ({
        key: `color-${c.value}`,
        label: (
          <span>
            {c.value && <Tag color={c.value} style={{ marginRight: 8 }} />}
            {c.name}
          </span>
        ),
        onClick: () => setSessionColor(sessionId, c.value || ''),
      })),
    },
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: '导出',
      children: [
        {
          key: 'export-md',
          label: '导出为 Markdown',
          onClick: () => handleExportClick(sessionId, 'md'),
        },
        {
          key: 'export-html',
          label: '导出为 HTML',
          onClick: () => handleExportClick(sessionId, 'html'),
        },
      ],
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '确认删除',
          content: '确定要删除这个会话吗？',
          onOk: () => deleteSession(sessionId),
        })
      },
    },
  ]

  // 渲染会话项
  const renderSessionItem = (session: (typeof sessions)[0]) => (
    <div
      className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
      onClick={() => setActiveSession(session.id)}
    >
      <div className="session-info">
        {session.color && <Tag color={session.color} className="color-tag" />}
        {session.isFavorite && <StarFilled className="favorite-icon" />}
        <span className="session-title">{session.title}</span>
      </div>
      <Dropdown
        menu={{ items: createMenuItems(session.id, session.isFavorite) }}
        trigger={['click']}
      >
        <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
      </Dropdown>
    </div>
  )

  // 构建会话列表树
  const buildTreeData = (sessionList: typeof sessions) => {
    const favoriteSessions = sessionList.filter((s) => s.isFavorite)
    const normalSessions = sessionList.filter((s) => !s.isFavorite)

    const groupedSessions = normalSessions.reduce(
      (acc, session) => {
        const path = session.projectPath
        if (!acc[path]) acc[path] = []
        acc[path].push(session)
        return acc
      },
      {} as Record<string, typeof normalSessions>
    )

    const treeData = []

    if (favoriteSessions.length > 0) {
      treeData.push({
        title: (
          <span className="group-title">
            <StarFilled style={{ color: '#faad14' }} /> 收藏
          </span>
        ),
        key: 'favorites',
        children: favoriteSessions.map((session) => ({
          title: renderSessionItem(session),
          key: session.id,
          isLeaf: true,
        })),
      })
    }

    Object.entries(groupedSessions).forEach(([path, pathSessions]) => {
      treeData.push({
        title: (
          <span className="group-title">
            <FolderOutlined /> {path.split('/').pop()}
          </span>
        ),
        key: path,
        children: pathSessions.map((session) => ({
          title: renderSessionItem(session),
          key: session.id,
          isLeaf: true,
        })),
      })
    })

    return treeData
  }

  const handleRename = () => {
    if (!editingSession || !newTitle.trim()) return
    const session = sessions.find((s) => s.id === editingSession)
    if (session) {
      useSessionStore.getState().updateSession({
        ...session,
        title: newTitle.trim(),
      })
    }
    setEditingSession(null)
    setNewTitle('')
  }

  // 过滤会话
  const filteredSessions = searchValue.trim()
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(searchValue.toLowerCase()) ||
          s.projectPath.toLowerCase().includes(searchValue.toLowerCase())
      )
    : null

  const claudeSessionList = filteredSessions ? filteredSessions.filter(s => s.sessionType === 'claude') : claudeSessions()
  const terminalSessionList = filteredSessions ? filteredSessions.filter(s => s.sessionType === 'terminal') : terminalSessions()

  // 当前 Tab 的会话列表
  const currentSessionList = activeTab === 'claude' ? claudeSessionList : terminalSessionList

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3 className="logo">智码 AICoder</h3>
      </div>

      {/* Tab 切换 */}
      <div className="sidebar-tabs">
        <div
          className={`sidebar-tab ${activeTab === 'claude' ? 'active' : ''}`}
          onClick={() => setActiveTab('claude')}
        >
          <CodeOutlined />
          <span>Claude Code</span>
          <span className="tab-count">{claudeSessionList.length}</span>
        </div>
        <div
          className={`sidebar-tab ${activeTab === 'terminal' ? 'active' : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          <DesktopOutlined />
          <span>普通终端</span>
          <span className="tab-count">{terminalSessionList.length}</span>
        </div>
      </div>

      <div className="sidebar-actions">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          block
          onClick={() => setCreateModalVisible(true)}
        >
          新建{activeTab === 'claude' ? ' Claude' : '终端'}会话
        </Button>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索会话..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="search-input"
          allowClear
        />
      </div>

      <div className="sidebar-content">
        {currentSessionList.length === 0 ? (
          <div className="empty-state">
            <p>暂无{activeTab === 'claude' ? ' Claude' : '终端'}会话</p>
            <p className="empty-hint">点击上方按钮创建新会话</p>
          </div>
        ) : (
          <Tree
            treeData={buildTreeData(currentSessionList)}
            defaultExpandAll
            showLine={{ showLeafIcon: false }}
            className="session-tree"
            selectable={false}
          />
        )}
      </div>

      <CreateSessionModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        sessionType={activeTab}
      />

      <Modal
        title="重命名会话"
        open={!!editingSession}
        onOk={handleRename}
        onCancel={() => {
          setEditingSession(null)
          setNewTitle('')
        }}
        okText="确认"
        cancelText="取消"
      >
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="输入新标题"
          onPressEnter={handleRename}
        />
      </Modal>
    </div>
  )
}

export default Sidebar
