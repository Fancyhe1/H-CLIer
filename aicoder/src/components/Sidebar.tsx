import { useState, useEffect, useRef, useCallback } from 'react'
import {
  PlusOutlined,
  SearchOutlined,
  FolderOutlined,
  StarOutlined,
  StarFilled,
  EditOutlined,
  ExportOutlined,
  DeleteOutlined,
  CodeOutlined,
  DesktopOutlined,
  HistoryOutlined,
  FileTextOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  CloudDownloadOutlined,
  CompressOutlined,
  RocketOutlined,
  UserOutlined,
  RobotOutlined,
  CloseOutlined,
  ImportOutlined,
  SettingOutlined,
  CodeFilled,
  IdcardOutlined,
  RightOutlined,
  InboxOutlined,
  UndoOutlined,
  CheckSquareOutlined,
  MinusSquareOutlined,
  BgColorsOutlined,
} from '@ant-design/icons'
import {
  Button,
  Input,
  Tree,
  Modal,
  message,
  Empty,
  Tooltip,
  Checkbox,
  Spin,
  Descriptions,
  Tag,
  Divider,
  Dropdown,
  Popover,
} from 'antd'
import type { MenuProps } from 'antd'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import CreateSessionModal from './CreateSessionModal'
import ImportSessionByIdModal from './ImportSessionByIdModal'
import TrashModal from './TrashModal'
import { handleExportSession } from '../utils/export'
import { extractAIMemorySummary } from '../utils/summaryExtractor'
import type { SessionType, Session } from '../types/session'
import type { ChatMessage } from '../types/history'
import type { SessionTotalUsage } from '../types/token'
import type { SessionSummaryData, AIMemorySummary } from '../types/summary'
import ContextMenu from './ContextMenu'
import '../styles/Sidebar.css'

interface SidebarProps {
  collapsed?: boolean
  theme?: 'light' | 'dark'
}

const COLORS = [
  { name: '红色', value: '#ff4d4f' },
  { name: '橙色', value: '#fa8c16' },
  { name: '黄色', value: '#fadb14' },
  { name: '绿色', value: '#52c41a' },
  { name: '青色', value: '#13c2c2' },
  { name: '蓝色', value: '#1890ff' },
  { name: '紫色', value: '#722ed1' },
  { name: '无', value: undefined },
]

// 格式化时间为"**分钟前"或"**小时前"
const formatTimeAgo = (timestamp: string): string => {
  const now = Date.now()
  const time = new Date(timestamp).getTime()
  const diff = now - time

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  return `${days}天前`
}

function Sidebar(props: SidebarProps) {
  const { theme = 'dark' } = props
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState<SessionType>('claude')
  const [showArchived, setShowArchived] = useState(false)  // 是否显示归档视图
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [defaultProjectPath, setDefaultProjectPath] = useState<string | undefined>(undefined)
  const [editingSession, setEditingSession] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [historyModalVisible, setHistoryModalVisible] = useState(false)
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])
  const [showThinking, setShowThinking] = useState(false)
  const [showToolUse, setShowToolUse] = useState(false)
  const [showToolResult, setShowToolResult] = useState(false)
  const [historySearchValue, setHistorySearchValue] = useState('')
  const [summaryModalVisible, setSummaryModalVisible] = useState(false)
  const [trashModalVisible, setTrashModalVisible] = useState(false)
  const [sessionIdModalVisible, setSessionIdModalVisible] = useState(false)
  const [importByIdModalVisible, setImportByIdModalVisible] = useState(false)
  const [importByIdProjectPath, setImportByIdProjectPath] = useState('')
  const [summaryData, setSummaryData] = useState<SessionSummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [aiSummaryModalVisible, setAiSummaryModalVisible] = useState(false)
  const [aiSummaryData, setAiSummaryData] = useState<AIMemorySummary | null>(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  // 批量操作相关状态
  const [batchMode, setBatchMode] = useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [colorPopoverVisible, setColorPopoverVisible] = useState(false)

  // 拖拽相关状态
  const sidebarContentRef = useRef<HTMLDivElement>(null)
  const sessionDragRef = useRef<{
    startX: number
    startY: number
    sessionId: string
    projectPath: string
    started: boolean
  } | null>(null)
  const sessionDragJustEnded = useRef(false)
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null)
  const [sessionDropGroupId, setSessionDropGroupId] = useState<string | null>(null)
  const [sessionDropInsertIndex, setSessionDropInsertIndex] = useState<number | null>(null)

  const workspaceDragRef = useRef<{
    startX: number
    startY: number
    path: string
    started: boolean
  } | null>(null)
  const workspaceDragJustEnded = useRef(false)
  const [draggedWorkspacePath, setDraggedWorkspacePath] = useState<string | null>(null)
  const [workspaceDropInsertIndex, setWorkspaceDropInsertIndex] = useState<number | null>(null)

  const isDragging = draggedSessionId !== null || draggedWorkspacePath !== null

  const {
    sessions,
    archivedSessions,
    activeSessionId,
    runningSessionIds,
    fetchSessions,
    fetchArchivedSessions,
    setActiveSession,
    toggleFavorite,
    setSessionColor,
    deleteSession,
    createSession,
    archiveSession,
    claudeSessions,
    terminalSessions,
    claudeArchivedSessions,
    terminalArchivedSessions,
    workspaceOrder,
    reorderSessions,
    reorderWorkspaceFolders,
  } = useSessionStore()

  useEffect(() => {
    fetchSessions()
    fetchArchivedSessions()
  }, [fetchSessions, fetchArchivedSessions])

  // 初始化展开状态
  useEffect(() => {
    const sessionList = activeTab === 'claude' ? claudeSessions() : terminalSessions()
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

    // 默认展开所有分组
    const keys: string[] = []
    if (favoriteSessions.length > 0) {
      keys.push('favorites')
    }
    Object.keys(groupedSessions).forEach(path => keys.push(path))

    setExpandedKeys(keys)
  }, [activeTab, sessions])

  // 切换分组展开/收起
  const toggleExpand = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (expandedKeys.includes(key)) {
      setExpandedKeys(expandedKeys.filter(k => k !== key))
    } else {
      setExpandedKeys([...expandedKeys, key])
    }
  }

  // 获取会话插入位置（基于鼠标位置，找最近的间隙）
  const getInsertIndexFromPoint = useCallback((_x: number, y: number, projectPath: string): number | null => {
    const container = sidebarContentRef.current
    if (!container) return null

    const allEls = container.querySelectorAll('[data-session-id]')
    const sessionEls = Array.from(allEls).filter(
      el => el.getAttribute('data-workspace-path') === projectPath
    )
    if (sessionEls.length === 0) return 0

    // 先看鼠标是否在某个会话上
    for (let i = 0; i < sessionEls.length; i++) {
      const rect = sessionEls[i].getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) {
        const midY = (rect.top + rect.bottom) / 2
        return y < midY ? i : i + 1
      }
    }

    // 鼠标不在任何会话上，找最近的
    let closestIndex = 0
    let closestDistance = Infinity
    for (let i = 0; i < sessionEls.length; i++) {
      const rect = sessionEls[i].getBoundingClientRect()
      const distTop = Math.abs(y - rect.top)
      const distBottom = Math.abs(y - rect.bottom)
      const dist = Math.min(distTop, distBottom)
      if (dist < closestDistance) {
        closestDistance = dist
        closestIndex = distTop < distBottom ? i : i + 1
      }
    }

    return closestIndex
  }, [])

  // 会话拖拽开始
  const handleSessionMouseDown = useCallback((sessionId: string, projectPath: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    sessionDragRef.current = { startX: e.clientX, startY: e.clientY, sessionId, projectPath, started: false }
  }, [])

  // 获取工作区插入位置
  const getWorkspaceInsertIndex = useCallback((_x: number, y: number): number | null => {
    const container = sidebarContentRef.current
    if (!container) return null

    const groupEls = Array.from(container.querySelectorAll('[data-workspace-group]'))
    if (groupEls.length === 0) return 0

    // 先看鼠标是否在某个工作区上
    for (let i = 0; i < groupEls.length; i++) {
      const rect = groupEls[i].getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) {
        const midY = (rect.top + rect.bottom) / 2
        return y < midY ? i : i + 1
      }
    }

    // 鼠标不在任何工作区上，找最近的
    let closestIndex = 0
    let closestDistance = Infinity
    for (let i = 0; i < groupEls.length; i++) {
      const rect = groupEls[i].getBoundingClientRect()
      const distTop = Math.abs(y - rect.top)
      const distBottom = Math.abs(y - rect.bottom)
      const dist = Math.min(distTop, distBottom)
      if (dist < closestDistance) {
        closestDistance = dist
        closestIndex = distTop < distBottom ? i : i + 1
      }
    }

    return closestIndex
  }, [])

  // 工作区拖拽开始
  const handleWorkspaceMouseDown = useCallback((path: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    workspaceDragRef.current = { startX: e.clientX, startY: e.clientY, path, started: false }
  }, [])

  // 文档级别的 mousemove/mouseup 处理会话拖拽
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 会话拖拽
      if (sessionDragRef.current) {
        const dx = e.clientX - sessionDragRef.current.startX
        const dy = e.clientY - sessionDragRef.current.startY
        if (!sessionDragRef.current.started) {
          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            sessionDragRef.current.started = true
            setDraggedSessionId(sessionDragRef.current.sessionId)
            setSessionDropGroupId(sessionDragRef.current.projectPath)
          }
          return
        }
        const insertIndex = getInsertIndexFromPoint(e.clientX, e.clientY, sessionDragRef.current.projectPath)
        setSessionDropInsertIndex(insertIndex)
      }

      // 工作区拖拽
      if (workspaceDragRef.current) {
        const dx = e.clientX - workspaceDragRef.current.startX
        const dy = e.clientY - workspaceDragRef.current.startY
        if (!workspaceDragRef.current.started) {
          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            workspaceDragRef.current.started = true
            setDraggedWorkspacePath(workspaceDragRef.current.path)
          }
          return
        }
        const insertIndex = getWorkspaceInsertIndex(e.clientX, e.clientY)
        setWorkspaceDropInsertIndex(insertIndex)
      }
    }

    const handleMouseUp = () => {
      // 会话拖拽结束
      if (sessionDragRef.current?.started) {
        sessionDragJustEnded.current = true
        const { sessionId, projectPath } = sessionDragRef.current
        if (sessionDropInsertIndex !== null) {
          const groupSessions = sessions
            .filter(s => s.projectPath === projectPath && !s.isFavorite)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          const currentIdx = groupSessions.findIndex(s => s.id === sessionId)
          if (currentIdx !== -1) {
            const newOrder = [...groupSessions.map(s => s.id)]
            const [removed] = newOrder.splice(currentIdx, 1)
            const insertAt = sessionDropInsertIndex > currentIdx ? sessionDropInsertIndex - 1 : sessionDropInsertIndex
            newOrder.splice(insertAt, 0, removed)
            reorderSessions(newOrder)
          }
        }
        setDraggedSessionId(null)
        setSessionDropGroupId(null)
        setSessionDropInsertIndex(null)
      }
      sessionDragRef.current = null

      // 工作区拖拽结束
      if (workspaceDragRef.current?.started) {
        workspaceDragJustEnded.current = true
        const { path } = workspaceDragRef.current
        if (workspaceDropInsertIndex !== null) {
          const normalSessions = sessions.filter(s => !s.isFavorite && s.sessionType === activeTab)
          const groupedPaths = [...new Set(normalSessions.map(s => s.projectPath))]
          const orderedPaths = [...(workspaceOrder[activeTab] || []), ...groupedPaths.filter(p => !(workspaceOrder[activeTab] || []).includes(p))]
          const currentIdx = orderedPaths.indexOf(path)
          if (currentIdx !== -1) {
            const newOrder = [...orderedPaths]
            const [removed] = newOrder.splice(currentIdx, 1)
            const insertAt = workspaceDropInsertIndex > currentIdx ? workspaceDropInsertIndex - 1 : workspaceDropInsertIndex
            newOrder.splice(insertAt, 0, removed)
            reorderWorkspaceFolders(activeTab, newOrder)
          }
        }
        setDraggedWorkspacePath(null)
        setWorkspaceDropInsertIndex(null)
      }
      workspaceDragRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [sessions, activeTab, workspaceOrder, sessionDropInsertIndex, workspaceDropInsertIndex, getInsertIndexFromPoint, getWorkspaceInsertIndex, reorderSessions, reorderWorkspaceFolders])

  // 处理导出
  const handleExportClick = async (sessionId: string, format: 'md' | 'html' | 'json') => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return
    await handleExportSession(session, format)
  }

  // 复制项目路径
  const handleCopyProjectPath = (projectPath: string) => {
    navigator.clipboard.writeText(projectPath)
    message.success('项目路径已复制到剪贴板')
  }

  // 以此项目新建会话
  const handleNewFromProject = (projectPath: string) => {
    setDefaultProjectPath(projectPath)
    setCreateModalVisible(true)
  }

  // 通过 VS Code 打开项目
  const handleOpenInVSCode = async (projectPath: string) => {
    try {
      await invoke('open_in_vscode', { projectPath })
      message.success('正在打开 VS Code...')
    } catch (err) {
      message.error('打开失败: ' + String(err))
    }
  }

  // 在资源管理器中打开
  const handleOpenInExplorer = async (projectPath: string) => {
    try {
      await invoke('open_in_explorer', { projectPath })
    } catch (err) {
      message.error('打开失败: ' + String(err))
    }
  }

  // 通过 IDEA 打开项目
  const handleOpenInIDEA = async (projectPath: string) => {
    try {
      await invoke('open_in_idea', { projectPath })
      message.success('正在打开 IntelliJ IDEA...')
    } catch (err) {
      message.error(String(err))
    }
  }

  // 导入会话
  const handleImportSession = async (projectPath: string) => {
    try {
      const filePath = await invoke<string | null>('select_file', {
        filters: [['JSON 文件', ['json']]],
      })

      if (!filePath) return

      const content = await invoke<string>('read_text_file', { path: filePath })
      const data = JSON.parse(content)

      // 验证数据格式
      if (!data.session || !data.session.title) {
        message.error('无效的会话文件格式')
        return
      }

      // 创建新会话
      const newSession = await createSession({
        projectPath: projectPath,
        title: data.session.title,
        sessionType: data.session.sessionType || 'claude',
      })

      if (newSession && data.messages && data.messages.length > 0) {
        // 写入历史记录
        const historyContent = data.messages.join('\n\n---\n\n')
        await invoke('write_terminal_history', {
          sessionId: newSession.id,
          content: historyContent,
        })
      }

      message.success('会话导入成功')
    } catch (err) {
      message.error('导入失败: ' + String(err))
    }
  }

  // 通过编号导入会话
  const handleImportById = (projectPath: string) => {
    setImportByIdProjectPath(projectPath)
    setImportByIdModalVisible(true)
  }

  // 批量导出会话（一个一个弹出）
  const handleBatchExport = async (
    projectPath: string,
    format: 'md' | 'html' | 'json'
  ) => {
    const sessionsToExport = sessions.filter(s => s.projectPath === projectPath)

    if (sessionsToExport.length === 0) {
      message.info('该目录下没有会话')
      return
    }

    for (let i = 0; i < sessionsToExport.length; i++) {
      const session = sessionsToExport[i]
      message.loading({
        content: `正在导出 (${i + 1}/${sessionsToExport.length}): ${session.title}`,
        key: 'batch-export',
        duration: 0,
      })

      try {
        await handleExportSession(session, format)
      } catch (err) {
        console.error(`导出 ${session.title} 失败:`, err)
      }

      // 给用户一点时间看到保存对话框关闭
      if (i < sessionsToExport.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }

    message.destroy('batch-export')
    message.success(`已导出 ${sessionsToExport.length} 个会话`)
  }

  // ========== 批量操作函数 ==========

  const toggleSessionSelection = useCallback((id: string) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    const list = activeTab === 'claude' ? claudeSessions() : terminalSessions()
    const filtered = searchValue
      ? list.filter(s => s.title.toLowerCase().includes(searchValue.toLowerCase()) || s.projectPath.toLowerCase().includes(searchValue.toLowerCase()))
      : list
    setSelectedSessionIds(new Set(filtered.map(s => s.id)))
  }, [activeTab, searchValue, claudeSessions, terminalSessions])

  const deselectAll = useCallback(() => {
    setSelectedSessionIds(new Set())
  }, [])

  const invertSelection = useCallback(() => {
    const list = activeTab === 'claude' ? claudeSessions() : terminalSessions()
    const filtered = searchValue
      ? list.filter(s => s.title.toLowerCase().includes(searchValue.toLowerCase()) || s.projectPath.toLowerCase().includes(searchValue.toLowerCase()))
      : list
    setSelectedSessionIds(prev => {
      const next = new Set<string>()
      filtered.forEach(s => { if (!prev.has(s.id)) next.add(s.id) })
      return next
    })
  }, [activeTab, searchValue, claudeSessions, terminalSessions])

  const toggleBatchMode = useCallback(() => {
    setBatchMode(prev => {
      if (prev) {
        setSelectedSessionIds(new Set())
        setColorPopoverVisible(false)
      }
      return !prev
    })
  }, [])

  useEffect(() => {
    setBatchMode(false)
    setSelectedSessionIds(new Set())
    setColorPopoverVisible(false)
  }, [activeTab, showArchived])

  const handleBatchDelete = useCallback(() => {
    if (selectedSessionIds.size === 0) return
    Modal.confirm({
      title: '批量删除',
      content: `确定要将选中的 ${selectedSessionIds.size} 个会话移入回收站吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        let successCount = 0
        for (const id of selectedSessionIds) {
          try { await deleteSession(id); successCount++ } catch (err) { console.error(`删除会话 ${id} 失败:`, err) }
        }
        message.success(`已删除 ${successCount} 个会话`)
        setSelectedSessionIds(new Set())
        setBatchMode(false)
      },
    })
  }, [selectedSessionIds, deleteSession])

  const handleBatchArchive = useCallback(async () => {
    if (selectedSessionIds.size === 0) return
    let successCount = 0
    for (const id of selectedSessionIds) {
      try { await archiveSession(id); successCount++ } catch (err) { console.error(`归档会话 ${id} 失败:`, err) }
    }
    message.success(`已归档 ${successCount} 个会话`)
    setSelectedSessionIds(new Set())
    setBatchMode(false)
  }, [selectedSessionIds, archiveSession])

  const handleBatchExportSelected = useCallback(async (format: 'md' | 'html' | 'json') => {
    if (selectedSessionIds.size === 0) return
    const selectedSessions = sessions.filter(s => selectedSessionIds.has(s.id))
    for (let i = 0; i < selectedSessions.length; i++) {
      const session = selectedSessions[i]
      message.loading({ content: `正在导出 (${i + 1}/${selectedSessions.length}): ${session.title}`, key: 'batch-export-selected', duration: 0 })
      try { await handleExportSession(session, format) } catch (err) { console.error(`导出 ${session.title} 失败:`, err) }
      if (i < selectedSessions.length - 1) await new Promise(resolve => setTimeout(resolve, 300))
    }
    message.destroy('batch-export-selected')
    message.success(`已导出 ${selectedSessions.length} 个会话`)
  }, [selectedSessionIds, sessions])

  const handleBatchSetColor = useCallback(async (color: string | undefined) => {
    if (selectedSessionIds.size === 0) return
    for (const id of selectedSessionIds) {
      try { await setSessionColor(id, color || '') } catch (err) { console.error(`设置颜色 ${id} 失败:`, err) }
    }
    message.success(`已标记 ${selectedSessionIds.size} 个会话`)
    setColorPopoverVisible(false)
  }, [selectedSessionIds, setSessionColor])

  const handleBatchToggleFavorite = useCallback(async () => {
    if (selectedSessionIds.size === 0) return
    const selectedSessions = sessions.filter(s => selectedSessionIds.has(s.id))
    const hasUnfavorited = selectedSessions.some(s => !s.isFavorite)
    for (const id of selectedSessionIds) {
      const session = sessions.find(s => s.id === id)
      if (session && session.isFavorite !== hasUnfavorited) {
        try { await toggleFavorite(id) } catch (err) { console.error(`切换收藏 ${id} 失败:`, err) }
      }
    }
    message.success(hasUnfavorited ? `已收藏 ${selectedSessionIds.size} 个会话` : `已取消收藏 ${selectedSessionIds.size} 个会话`)
  }, [selectedSessionIds, sessions, toggleFavorite])

  // 移除整个目录
  const handleRemoveDirectory = (projectPath: string, sessionCount: number) => {
    Modal.confirm({
      title: '确认移除目录',
      content: `确定要移除此目录吗？将删除 ${sessionCount} 个会话，此操作不可恢复。`,
      okText: '移除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await invoke('delete_sessions_by_path', { projectPath })
          message.success(`已移除 ${sessionCount} 个会话`)
          fetchSessions()
        } catch (err) {
          message.error('移除失败: ' + String(err))
        }
      },
    })
  }

  // 归档会话
  const handleArchiveSession = (sessionId: string) => {
    Modal.confirm({
      title: '确认归档',
      content: '确定要归档这个会话吗？归档后可在归档会话栏中查看和恢复。',
      okText: '归档',
      cancelText: '取消',
      onOk: async () => {
        try {
          await useSessionStore.getState().archiveSession(sessionId)
          message.success('会话已归档')
        } catch (err) {
          message.error('归档失败: ' + String(err))
        }
      },
    })
  }

  // 归档整个目录
  const handleArchiveDirectory = (projectPath: string, sessionCount: number) => {
    Modal.confirm({
      title: '确认归档目录',
      content: `确定要归档此目录下的所有会话吗？将归档 ${sessionCount} 个会话。`,
      okText: '归档',
      cancelText: '取消',
      onOk: async () => {
        try {
          await useSessionStore.getState().archiveSessionsByPath(projectPath)
          message.success(`已归档 ${sessionCount} 个会话`)
        } catch (err) {
          message.error('归档失败: ' + String(err))
        }
      },
    })
  }

  // 恢复归档会话
  const handleUnarchiveSession = (sessionId: string) => {
    Modal.confirm({
      title: '确认恢复',
      content: '确定要恢复这个归档会话吗？',
      okText: '恢复',
      cancelText: '取消',
      onOk: async () => {
        try {
          await useSessionStore.getState().unarchiveSession(sessionId)
          message.success('会话已恢复')
        } catch (err) {
          message.error('恢复失败: ' + String(err))
        }
      },
    })
  }

  // 恢复整个目录的归档会话
  const handleUnarchiveDirectory = (projectPath: string, sessionCount: number) => {
    Modal.confirm({
      title: '确认恢复目录',
      content: `确定要恢复此目录下的所有归档会话吗？将恢复 ${sessionCount} 个会话。`,
      okText: '恢复',
      cancelText: '取消',
      onOk: async () => {
        try {
          await useSessionStore.getState().unarchiveSessionsByPath(projectPath)
          message.success(`已恢复 ${sessionCount} 个会话`)
        } catch (err) {
          message.error('恢复失败: ' + String(err))
        }
      },
    })
  }

  // 创建分组文件夹的右键菜单
  const createGroupMenuItems = (
    projectPath: string,
    sessionCount: number,
    isFavorite: boolean = false
  ): MenuProps['items'] => {
    if (isFavorite) {
      // 收藏分组的菜单（功能较少）
      return [
        {
          key: 'new-session',
          icon: <PlusOutlined />,
          label: '新建会话',
          onClick: () => handleNewFromProject(projectPath),
        },
      ]
    }

    return [
      // 第一组：创建
      {
        key: 'new-session',
        icon: <PlusOutlined />,
        label: '新建会话',
        onClick: () => handleNewFromProject(projectPath),
      },
      {
        key: 'import-session',
        icon: <ImportOutlined />,
        label: '导入会话',
        onClick: () => handleImportSession(projectPath),
      },
      {
        key: 'import-session-by-id',
        icon: <ImportOutlined />,
        label: '通过编号导入',
        onClick: () => handleImportById(projectPath),
      },
      { type: 'divider', key: 'g1' },

      // 第二组：导出
      {
        key: 'export-md',
        icon: <FileTextOutlined />,
        label: '导出 Markdown',
        onClick: () => handleBatchExport(projectPath, 'md'),
      },
      {
        key: 'export-html',
        icon: <CloudDownloadOutlined />,
        label: '导出 HTML',
        onClick: () => handleBatchExport(projectPath, 'html'),
      },
      {
        key: 'export-json',
        icon: <CodeOutlined />,
        label: '导出 JSON',
        onClick: () => handleBatchExport(projectPath, 'json'),
      },
      { type: 'divider', key: 'g2' },

      // 第三组：项目管理
      {
        key: 'project-memory',
        icon: <SettingOutlined />,
        label: '项目记忆管理',
        onClick: () => message.info('项目记忆管理功能开发中'),
      },
      {
        key: 'open-explorer',
        icon: <FolderOpenOutlined />,
        label: '在文件管理器打开',
        onClick: () => handleOpenInExplorer(projectPath),
      },
      {
        key: 'open-idea',
        icon: <CodeFilled />,
        label: '通过 IDEA 打开',
        onClick: () => handleOpenInIDEA(projectPath),
      },
      {
        key: 'copy-path',
        icon: <CopyOutlined />,
        label: '复制项目路径',
        onClick: () => handleCopyProjectPath(projectPath),
      },
      { type: 'divider', key: 'g3' },

      // 第四组：归档和删除
      {
        key: 'archive-directory',
        icon: <InboxOutlined />,
        label: `归档整个目录 (${sessionCount})`,
        onClick: () => handleArchiveDirectory(projectPath, sessionCount),
      },
      { type: 'divider', key: 'g4' },
      {
        key: 'remove-directory',
        icon: <DeleteOutlined />,
        label: `移除整个目录 (${sessionCount})`,
        danger: true,
        onClick: () => handleRemoveDirectory(projectPath, sessionCount),
      },
    ]
  }

  // 查看历史
  const handleViewHistory = async (sessionId: string, projectPath: string) => {
    try {
      const session = sessions.find(s => s.id === sessionId)
      const historySessionId = session?.cliSessionId || sessionId
      const messages = await invoke<ChatMessage[]>('read_session_history', { sessionId: historySessionId, projectPath })
      setHistoryMessages(messages || [])
      setHistorySearchValue('')
      setShowThinking(false)
      setShowToolUse(false)
      setShowToolResult(false)
      setHistoryModalVisible(true)
    } catch (err) {
      message.error('读取历史失败: ' + String(err))
    }
  }

  // 克隆会话
  const handleCloneSession = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return

    try {
      // 读取原始会话的历史
      const history = await invoke<string>('read_terminal_history', { sessionId })

      // 创建新会话
      const newSession = await createSession({
        projectPath: session.projectPath,
        title: `${session.title} (副本)`,
        sessionType: session.sessionType,
      })

      if (newSession) {
        // 复制历史到新会话
        if (history) {
          await invoke('write_terminal_history', {
            sessionId: newSession.id,
            content: history,
          })
        }
        message.success('会话已克隆')
      }
    } catch (err) {
      message.error('克隆失败: ' + String(err))
    }
  }

  // 压缩会话（发送Claude压缩命令）
  const handleCompressSession = () => {
    message.info('压缩会话功能需要Claude Code支持，将在Claude会话中发送 /compact 命令')
    // TODO: 在当前终端中发送 /compact 命令
  }

  // 创建右键菜单
  const createMenuItems = (sessionId: string, isFavorite: boolean, projectPath: string): MenuProps['items'] => [
    // 第一组：基本操作
    { type: 'divider', key: 'd1' },
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {c.value && (
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: c.value,
                  flexShrink: 0,
                }}
              />
            )}
            {c.name}
          </span>
        ),
        onClick: () => setSessionColor(sessionId, c.value || ''),
      })),
    },
    { type: 'divider', key: 'd2' },

    // 第二组：信息查看
    {
      key: 'history',
      icon: <HistoryOutlined />,
      label: '查看历史',
      onClick: () => handleViewHistory(sessionId, projectPath),
    },
    {
      key: 'summary',
      icon: <FileTextOutlined />,
      label: '查看摘要',
      onClick: async () => {
        const session = sessions.find((s) => s.id === sessionId)
        if (!session) return
        setSummaryData(null)
        setSummaryLoading(true)
        setSummaryModalVisible(true)
        try {
          const historySessionId = session?.cliSessionId || sessionId
          const [messages, tokenUsage] = await Promise.all([
            invoke<ChatMessage[]>('read_session_history', { sessionId: historySessionId, projectPath }).catch(() => [] as ChatMessage[]),
            invoke<SessionTotalUsage>('get_session_total_usage', { sessionId: historySessionId }).catch(() => null),
          ])
          // 统计对话数据
          const userMsgs = messages.filter(m => m.role === 'user').length
          const aiMsgs = messages.filter(m => m.role === 'assistant').length
          const allToolCalls = messages.flatMap(m => m.content.filter(b => b.blockType === 'tool_use'))
          const thinkingBlocks = messages.flatMap(m => m.content.filter(b => b.blockType === 'thinking'))
          // 工具TOP5
          const toolMap: Record<string, number> = {}
          allToolCalls.forEach(b => {
            const name = b.toolName || 'unknown'
            toolMap[name] = (toolMap[name] || 0) + 1
          })
          const topTools = Object.entries(toolMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }))
          // 会话持续时长
          const timestamps = messages.map(m => new Date(m.timestamp).getTime()).filter(t => !isNaN(t))
          const duration = timestamps.length >= 2
            ? (Math.max(...timestamps) - Math.min(...timestamps)) / 60000
            : 0

          setSummaryData({
            title: session.title,
            sessionType: session.sessionType,
            projectPath: session.projectPath,
            createdAt: session.createdAt,
            lastActivityAt: session.lastActivityAt,
            userMessageCount: userMsgs,
            assistantMessageCount: aiMsgs,
            totalMessageCount: messages.length,
            toolCallCount: allToolCalls.length,
            thinkingBlockCount: thinkingBlocks.length,
            durationMinutes: Math.round(duration),
            inputTokens: tokenUsage?.inputTokens ?? 0,
            outputTokens: tokenUsage?.outputTokens ?? 0,
            cachedTokens: (tokenUsage?.cacheCreationTokens ?? 0) + (tokenUsage?.cacheReadTokens ?? 0),
            totalCost: tokenUsage?.cost ?? 0,
            model: tokenUsage?.model ?? '-',
            topTools,
          })
        } catch (err) {
          message.error('加载摘要失败: ' + String(err))
          setSummaryModalVisible(false)
        } finally {
          setSummaryLoading(false)
        }
      },
    },
    {
      key: 'ai-summary',
      icon: <ExperimentOutlined />,
      label: 'AI记忆摘要',
      onClick: async () => {
        setAiSummaryData(null)
        setAiSummaryLoading(true)
        setAiSummaryModalVisible(true)
        try {
          const session = sessions.find(s => s.id === sessionId)
          const historySessionId = session?.cliSessionId || sessionId
          const messages = await invoke<ChatMessage[]>('read_session_history', { sessionId: historySessionId, projectPath })
          const summary = extractAIMemorySummary(messages || [])
          setAiSummaryData(summary)
        } catch (err) {
          message.error('生成摘要失败: ' + String(err))
          setAiSummaryModalVisible(false)
        } finally {
          setAiSummaryLoading(false)
        }
      },
    },
    {
      key: 'file-changes',
      icon: <FileSearchOutlined />,
      label: '查看文件变更',
      onClick: () => message.info('查看文件变更功能开发中'),
    },
    {
      key: 'checkpoint',
      icon: <CheckCircleOutlined />,
      label: '检查点管理',
      onClick: () => {
        useSettingsStore.getState().setCheckpointVisible(true)
      },
    },
    { type: 'divider', key: 'd3' },

    // 第三组：导出
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: '导出',
      children: [
        {
          key: 'export-md',
          icon: <FileTextOutlined />,
          label: '导出为 Markdown',
          onClick: () => handleExportClick(sessionId, 'md'),
        },
        {
          key: 'export-html',
          icon: <CloudDownloadOutlined />,
          label: '导出为 HTML',
          onClick: () => handleExportClick(sessionId, 'html'),
        },
        {
          key: 'export-json',
          icon: <CodeOutlined />,
          label: '导出为 JSON',
          onClick: () => handleExportClick(sessionId, 'json'),
        },
      ],
    },
    { type: 'divider', key: 'd4' },

    // 第四组：其他操作
    {
      key: 'new-from-project',
      icon: <FolderOpenOutlined />,
      label: '以此项目新建',
      onClick: () => handleNewFromProject(projectPath),
    },
    {
      key: 'clone',
      icon: <CopyOutlined />,
      label: '克隆',
      onClick: () => handleCloneSession(sessionId),
    },
    {
      key: 'open-vscode',
      icon: <RocketOutlined />,
      label: '通过 VS Code 打开',
      onClick: () => handleOpenInVSCode(projectPath),
    },
    {
      key: 'compress',
      icon: <CompressOutlined />,
      label: '压缩会话',
      onClick: () => handleCompressSession(),
    },
    {
      key: 'copy-path',
      icon: <CopyOutlined />,
      label: '复制项目路径',
      onClick: () => handleCopyProjectPath(projectPath),
    },
    { type: 'divider', key: 'd5' },

    // 归档
    {
      key: 'archive',
      icon: <InboxOutlined />,
      label: '归档会话',
      onClick: () => handleArchiveSession(sessionId),
    },
    { type: 'divider', key: 'd6' },

    // 删除
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

  // 关闭会话（只清除激活状态，保留 cliSessionId 用于下次恢复）
  const handleCloseSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    // 设置关闭的会话ID，通知 MultiTerminal 销毁终端
    useSessionStore.getState().setClosedSession(sessionId)
    // 清除激活状态
    if (activeSessionId === sessionId) {
      setActiveSession(null)
    }
  }

  // 删除会话
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个会话吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteSession(sessionId),
    })
  }

  // 渲染会话项
  const renderSessionItem = (session: (typeof sessions)[0]) => {
    // 会话是否正在运行（终端已打开）
    const isRunning = runningSessionIds.has(session.id)
    // 是否有未读消息
    const hasUnread = session.hasUnread
    // 颜色：未运行显示灰色，运行中显示设置的颜色或默认白色，未读时橙色
    const displayColor = isRunning
      ? (hasUnread ? '#fa8c16' : (session.color || '#ffffff'))
      : '#888888'

    const isDraggingThis = draggedSessionId === session.id
    const isInDropGroup = sessionDropGroupId === session.projectPath
    const groupSessions = sessions
      .filter(s => s.projectPath === session.projectPath && !s.isFavorite)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    const idxInGroup = groupSessions.findIndex(s => s.id === session.id)
    const showDropBar = isInDropGroup && sessionDropInsertIndex === idxInGroup && !isDraggingThis
    const isSelected = selectedSessionIds.has(session.id)

    return (
      <ContextMenu items={createMenuItems(session.id, session.isFavorite, session.projectPath)}>
        <div
          className={`session-item ${session.id === activeSessionId ? 'active' : ''} ${hasUnread ? 'has-unread' : ''} ${isDraggingThis ? 'dragging' : ''} ${showDropBar ? 'drop-bar-above' : ''} ${batchMode && isSelected ? 'batch-selected' : ''}`}
          data-session-id={session.id}
          data-workspace-path={session.projectPath}
          onMouseDown={(e) => handleSessionMouseDown(session.id, session.projectPath, e)}
          onClick={() => {
            if (sessionDragJustEnded.current) {
              sessionDragJustEnded.current = false
              return
            }
            setActiveSession(session.id)
          }}
        >
          {batchMode && (
            <Checkbox
              checked={isSelected}
              onClick={(e) => {
                e.stopPropagation()
                toggleSessionSelection(session.id)
              }}
              className="batch-checkbox"
            />
          )}
          <div className="session-info">
            <div
              className="color-tag"
              style={{
                backgroundColor: displayColor,
                opacity: isRunning ? 1 : 0.5
              }}
            />
            {session.isFavorite && <StarFilled className="favorite-icon" />}
            {hasUnread && <span className="unread-dot" />}
            <span className="session-title" style={hasUnread ? { color: '#fa8c16', fontWeight: 600 } : undefined}>
              {session.title}
            </span>
          </div>
          <div className="session-meta">
            <span className="session-time">{formatTimeAgo(session.lastActivityAt)}</span>
            <div className="session-actions">
              <span
                className="action-btn close-btn"
                onClick={(e) => handleCloseSession(session.id, e)}
                title="关闭会话"
              >
                <CloseOutlined />
              </span>
              <span
                className="action-btn delete-btn"
                onClick={(e) => handleDeleteSession(session.id, e)}
                title="删除会话"
              >
                <DeleteOutlined />
              </span>
            </div>
          </div>
        </div>
      </ContextMenu>
    )
  }

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

    // 按保存的工作区顺序排序
    const savedOrder = workspaceOrder[activeTab] || []
    const sortedGroupEntries = Object.entries(groupedSessions).sort(([a], [b]) => {
      const aIdx = savedOrder.indexOf(a)
      const bIdx = savedOrder.indexOf(b)
      if (aIdx === -1 && bIdx === -1) return 0
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })

    const treeData = []

    if (favoriteSessions.length > 0) {
      const favoriteProjectPaths = [...new Set(favoriteSessions.map(s => s.projectPath))]
      const defaultProjectPath = favoriteProjectPaths[0] || ''

      treeData.push({
        title: (
          <ContextMenu items={createGroupMenuItems(defaultProjectPath, favoriteSessions.length, true)}>
            <div
              className="group-title-wrapper"
              onClick={(e) => toggleExpand('favorites', e)}
            >
              <span className="group-title">
                <StarFilled style={{ color: '#faad14' }} /> 收藏
              </span>
              <span className="group-count">{favoriteSessions.length}</span>
            </div>
          </ContextMenu>
        ),
        key: 'favorites',
        children: favoriteSessions
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .map((session) => ({
            title: renderSessionItem(session),
            key: session.id,
            isLeaf: true,
          })),
      })
    }

    sortedGroupEntries.forEach(([path, pathSessions], groupIdx) => {
      const isDraggingThis = draggedWorkspacePath === path
      const showDropBar = workspaceDropInsertIndex === groupIdx && !isDraggingThis

      // 按 sortOrder 排序
      const sortedSessions = [...pathSessions].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

      treeData.push({
        title: (
          <ContextMenu items={createGroupMenuItems(path, pathSessions.length, false)}>
            <div
              className={`group-title-wrapper ${isDraggingThis ? 'dragging' : ''} ${showDropBar ? 'drop-bar-above' : ''}`}
              data-workspace-group={path}
              onMouseDown={(e) => handleWorkspaceMouseDown(path, e)}
              onClick={(e) => {
                if (workspaceDragJustEnded.current) {
                  workspaceDragJustEnded.current = false
                  return
                }
                toggleExpand(path, e)
              }}
            >
              <span className="group-title">
                <FolderOutlined /> {path.split('/').pop()}
              </span>
              <span className="group-count">{pathSessions.length}</span>
            </div>
          </ContextMenu>
        ),
        key: path,
        children: sortedSessions.map((session) => ({
          title: renderSessionItem(session),
          key: session.id,
          isLeaf: true,
        })),
      })
    })

    return treeData
  }

  // 创建归档会话的右键菜单
  const createArchivedMenuItems = (sessionId: string): MenuProps['items'] => [
    {
      key: 'unarchive',
      icon: <UndoOutlined />,
      label: '恢复会话',
      onClick: () => handleUnarchiveSession(sessionId),
    },
    { type: 'divider', key: 'ad1' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '永久删除',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '确认删除',
          content: '确定要永久删除这个归档会话吗？此操作不可恢复。',
          okText: '删除',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: async () => {
            try {
              await invoke('permanently_delete', { sessionId })
              message.success('会话已删除')
              fetchArchivedSessions()
            } catch (err) {
              message.error('删除失败: ' + String(err))
            }
          },
        })
      },
    },
  ]

  // 创建归档分组的右键菜单
  const createArchivedGroupMenuItems = (projectPath: string, sessionCount: number): MenuProps['items'] => [
    {
      key: 'unarchive-all',
      icon: <UndoOutlined />,
      label: `恢复全部 (${sessionCount})`,
      onClick: () => handleUnarchiveDirectory(projectPath, sessionCount),
    },
    { type: 'divider', key: 'ag1' },
    {
      key: 'delete-all',
      icon: <DeleteOutlined />,
      label: `永久删除全部 (${sessionCount})`,
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '确认删除',
          content: `确定要永久删除此目录下的 ${sessionCount} 个归档会话吗？此操作不可恢复。`,
          okText: '删除',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: async () => {
            try {
              const sessionsToDelete = archivedSessions.filter(s => s.projectPath === projectPath)
              for (const session of sessionsToDelete) {
                await invoke('permanently_delete', { sessionId: session.id })
              }
              message.success(`已删除 ${sessionCount} 个会话`)
              fetchArchivedSessions()
            } catch (err) {
              message.error('删除失败: ' + String(err))
            }
          },
        })
      },
    },
  ]

  // 渲染归档会话项
  const renderArchivedSessionItem = (session: Session) => {
    return (
      <ContextMenu items={createArchivedMenuItems(session.id)}>
        <div className="session-item archived">
          <div className="session-info">
            <div className="color-tag" style={{ backgroundColor: '#888888', opacity: 0.5 }} />
            <span className="session-title" style={{ color: '#888888' }}>
              {session.title}
            </span>
          </div>
          <div className="session-meta">
            <span className="session-time">
              {session.archivedAt ? formatTimeAgo(session.archivedAt) : ''}
            </span>
          </div>
        </div>
      </ContextMenu>
    )
  }

  // 构建归档会话列表树
  const buildArchivedTreeData = (sessionList: Session[]) => {
    const groupedSessions = sessionList.reduce(
      (acc, session) => {
        const path = session.projectPath
        if (!acc[path]) acc[path] = []
        acc[path].push(session)
        return acc
      },
      {} as Record<string, Session[]>
    )

    const treeData: any[] = []

    Object.entries(groupedSessions).forEach(([path, pathSessions]) => {
      treeData.push({
        title: (
          <ContextMenu items={createArchivedGroupMenuItems(path, pathSessions.length)}>
            <div
              className="group-title-wrapper"
              onClick={(e) => toggleExpand(path, e)}
            >
              <span className="group-title">
                <FolderOutlined /> {path.split('/').pop()}
              </span>
              <span className="group-count">{pathSessions.length}</span>
            </div>
          </ContextMenu>
        ),
        key: path,
        children: pathSessions.map((session) => ({
          title: renderArchivedSessionItem(session),
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

  // 归档会话列表
  const archivedSessionList = activeTab === 'claude' ? claudeArchivedSessions() : terminalArchivedSessions()

  return (
    <div className={`sidebar ${isDragging ? 'dragging-active' : ''}`}>
      <div className="sidebar-header">
        <span className="logo">
          <img className="logo-icon" src="/icon-32.png" alt="H CLIer" width="20" height="20" />
          <span>H CLIer</span>
        </span>
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
        <div className="search-row">
          <Tooltip title="查看所有会话ID">
            <Button
              type="text"
              icon={<IdcardOutlined />}
              onClick={() => setSessionIdModalVisible(true)}
              className="session-id-btn"
            />
          </Tooltip>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索会话..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="search-input"
            allowClear
          />
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          block
          onClick={() => setCreateModalVisible(true)}
          data-testid="new-session-btn"
        >
          新建{activeTab === 'claude' ? ' Claude' : '终端'}会话
        </Button>
      </div>

      {!showArchived && currentSessionList.length > 0 && (
        <div className="batch-actions-bar">
          <div className="batch-actions-row">
            <Button
              type={batchMode ? 'primary' : 'default'}
              icon={batchMode ? <CheckSquareOutlined /> : <MinusSquareOutlined />}
              size="small"
              onClick={toggleBatchMode}
              className="batch-toggle-btn"
            >
              {batchMode ? '退出多选' : '多选'}
            </Button>
            {batchMode && (
              <>
                <Dropdown
                  menu={{
                    items: [
                      { key: 'all', label: '全选', onClick: selectAll },
                      { key: 'none', label: '全不选', onClick: deselectAll },
                      { key: 'invert', label: '反选', onClick: invertSelection },
                    ],
                  }}
                  trigger={['click']}
                >
                  <Button size="small" className="batch-select-dropdown-btn">
                    选择 ▾
                  </Button>
                </Dropdown>
                {selectedSessionIds.size > 0 && (
                  <span className="selected-count">已选 {selectedSessionIds.size} 项</span>
                )}
              </>
            )}
          </div>
          {batchMode && (
            <div className="batch-action-buttons">
              <Tooltip title="删除">
                <Button size="small" icon={<DeleteOutlined />} danger disabled={selectedSessionIds.size === 0} onClick={handleBatchDelete} />
              </Tooltip>
              <Tooltip title="归档">
                <Button size="small" icon={<InboxOutlined />} disabled={selectedSessionIds.size === 0} onClick={handleBatchArchive} />
              </Tooltip>
              <Dropdown
                menu={{
                  items: [
                    { key: 'md', label: 'Markdown', icon: <FileTextOutlined />, onClick: () => handleBatchExportSelected('md') },
                    { key: 'html', label: 'HTML', icon: <CloudDownloadOutlined />, onClick: () => handleBatchExportSelected('html') },
                    { key: 'json', label: 'JSON', icon: <CodeOutlined />, onClick: () => handleBatchExportSelected('json') },
                  ],
                }}
                trigger={['click']}
              >
                <Tooltip title="导出">
                  <Button size="small" icon={<ExportOutlined />} disabled={selectedSessionIds.size === 0} />
                </Tooltip>
              </Dropdown>
              <Popover
                content={
                  <div className="color-popover-grid">
                    {COLORS.map((c) => (
                      <div
                        key={c.name}
                        className="color-popover-swatch"
                        style={{ backgroundColor: c.value || 'transparent', border: c.value ? 'none' : '1px dashed #999' }}
                        title={c.name}
                        onClick={() => handleBatchSetColor(c.value)}
                      />
                    ))}
                  </div>
                }
                title="选择颜色"
                trigger="click"
                open={colorPopoverVisible}
                onOpenChange={setColorPopoverVisible}
              >
                <Tooltip title="颜色">
                  <Button size="small" icon={<BgColorsOutlined />} disabled={selectedSessionIds.size === 0} />
                </Tooltip>
              </Popover>
              <Tooltip title="收藏">
                <Button size="small" icon={<StarOutlined />} disabled={selectedSessionIds.size === 0} onClick={handleBatchToggleFavorite} />
              </Tooltip>
            </div>
          )}
        </div>
      )}

      <div className="sidebar-content" ref={sidebarContentRef}>
        {showArchived ? (
          // 归档会话视图
          archivedSessionList.length === 0 ? (
            <div className="empty-state">
              <p>暂无归档会话</p>
              <p className="empty-hint">右键会话可选择归档</p>
            </div>
          ) : (
            <Tree
              treeData={buildArchivedTreeData(archivedSessionList)}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys as string[])}
              className="session-tree"
              selectable={false}
            />
          )
        ) : (
          // 正常会话视图
          currentSessionList.length === 0 ? (
            <div className="empty-state">
              <p>暂无{activeTab === 'claude' ? ' Claude' : '终端'}会话</p>
              <p className="empty-hint">点击上方按钮创建新会话</p>
            </div>
          ) : (
            <Tree
              treeData={buildTreeData(currentSessionList)}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys as string[])}
              className="session-tree"
              selectable={false}
            />
          )
        )}
      </div>
      <div className="sidebar-footer">
        <Button
          type="text"
          icon={<InboxOutlined />}
          onClick={() => setShowArchived(!showArchived)}
          className={`archive-btn ${showArchived ? 'active' : ''}`}
          title="归档会话"
        >
          归档{archivedSessions.length > 0 && `(${archivedSessions.length})`}
        </Button>
        <Button
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => setTrashModalVisible(true)}
          className="trash-btn"
          title="回收站"
        >
          回收站
        </Button>
      </div>

      <CreateSessionModal
        visible={createModalVisible}
        onClose={() => {
          setCreateModalVisible(false)
          setDefaultProjectPath(undefined)
        }}
        sessionType={activeTab}
        defaultProjectPath={defaultProjectPath}
      />

      <ImportSessionByIdModal
        visible={importByIdModalVisible}
        onClose={() => setImportByIdModalVisible(false)}
        projectPath={importByIdProjectPath}
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

      {/* 查看历史Modal */}
      <Modal
        title="对话历史"
        open={historyModalVisible}
        onCancel={() => setHistoryModalVisible(false)}
        footer={null}
        width={1000}
        className={theme === 'dark' ? 'dark' : ''}
        styles={{ body: { maxHeight: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' } }}
      >
        {historyMessages.length === 0 ? (
          <Empty description="暂无对话历史" />
        ) : (
          <>
            <div className="history-toolbar">
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索聊天记录..."
                value={historySearchValue}
                onChange={e => setHistorySearchValue(e.target.value)}
                allowClear
                size="small"
              />
              <div className="history-filters">
                <Checkbox checked={showThinking} onChange={e => setShowThinking(e.target.checked)}>思考过程</Checkbox>
                <Checkbox checked={showToolUse} onChange={e => setShowToolUse(e.target.checked)}>工具调用</Checkbox>
                <Checkbox checked={showToolResult} onChange={e => setShowToolResult(e.target.checked)}>工具结果</Checkbox>
              </div>
            </div>
            <div className="history-scroll-area">
              <div className="history-chat-container">
              {historyMessages
                .filter(msg => {
                  if (!historySearchValue.trim()) return true
                  const keyword = historySearchValue.toLowerCase()
                  return msg.content.some(block => {
                    if (block.text && block.text.toLowerCase().includes(keyword)) return true
                    if (block.thinking && block.thinking.toLowerCase().includes(keyword)) return true
                    if (block.toolName && block.toolName.toLowerCase().includes(keyword)) return true
                    if (block.toolResult && block.toolResult.toLowerCase().includes(keyword)) return true
                    if (block.toolInput) {
                      try {
                        const inputStr = JSON.stringify(block.toolInput).toLowerCase()
                        if (inputStr.includes(keyword)) return true
                      } catch { /* ignore */ }
                    }
                    return false
                  })
                })
                .map((msg) => {
                const textBlocks = msg.content.filter(b => b.blockType === 'text')
                const allDetailBlocks = msg.content.filter(b => b.blockType !== 'text')

                // 根据过滤设置筛选 detail blocks
                const detailBlocks = allDetailBlocks.filter(b => {
                  if (b.blockType === 'thinking') return showThinking
                  if (b.blockType === 'tool_use') return showToolUse
                  if (b.blockType === 'tool_result') return showToolResult
                  return true
                })

                // 跳过没有任何可见内容的消息
                if (textBlocks.length === 0 && detailBlocks.length === 0) return null

                const thinkingCount = detailBlocks.filter(b => b.blockType === 'thinking').length
                const toolUseCount = detailBlocks.filter(b => b.blockType === 'tool_use').length
                const toolResultCount = detailBlocks.filter(b => b.blockType === 'tool_result').length

                const isToolResultOnly = msg.role === 'user' && textBlocks.length === 0

                const summaryParts: string[] = []
                if (thinkingCount > 0) summaryParts.push('思考过程')
                if (toolUseCount > 0) summaryParts.push(`${toolUseCount} 个工具调用`)
                if (toolResultCount > 0) summaryParts.push(`${toolResultCount} 个工具结果`)

                return (
                  <div key={msg.id} className={`history-message ${msg.role}`}>
                    {!isToolResultOnly && (
                      <div className="history-message-role">
                        {msg.role === 'user' ? (
                          <><UserOutlined /> 用户</>
                        ) : (
                          <><RobotOutlined /> Claude</>
                        )}
                      </div>
                    )}
                    <div className="history-message-content">
                      {textBlocks.map((block, bi) => (
                        block.text && (
                          <div key={bi} className="history-text">
                            <ReactMarkdown>{block.text}</ReactMarkdown>
                          </div>
                        )
                      ))}

                      {detailBlocks.length > 0 && (
                        <details className="history-detail-group">
                          <summary className="history-detail-group-summary">
                            <RightOutlined className="history-detail-arrow" />
                            {summaryParts.join(' / ')}
                          </summary>
                          <div className="history-detail-group-body">
                            {detailBlocks.map((block, bi) => {
                              if (block.blockType === 'thinking' && block.thinking) {
                                return (
                                  <details key={bi} className="history-thinking">
                                    <summary>
                                      <ExperimentOutlined /> 思考过程
                                    </summary>
                                    <div className="history-thinking-content">
                                      <ReactMarkdown>{block.thinking}</ReactMarkdown>
                                    </div>
                                  </details>
                                )
                              }

                              if (block.blockType === 'tool_use') {
                                const inputSummary = block.toolInput
                                  ? Object.entries(block.toolInput)
                                      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.substring(0, 60) : JSON.stringify(v).substring(0, 60)}`)
                                      .join(', ')
                                  : ''
                                return (
                                  <details key={bi} className="history-tool-card">
                                    <summary className="history-tool-card-header">
                                      <CodeOutlined /> {block.toolName || '工具调用'}
                                      {inputSummary && <span className="history-tool-summary"> — {inputSummary}</span>}
                                    </summary>
                                    <div className="history-tool-card-body">
                                      {block.toolInput && (
                                        <pre>{JSON.stringify(block.toolInput, null, 2)}</pre>
                                      )}
                                    </div>
                                  </details>
                                )
                              }

                              if (block.blockType === 'tool_result' && block.toolResult) {
                                return (
                                  <details key={bi} className="history-tool-card history-tool-result">
                                    <summary className="history-tool-card-header">
                                      <CodeOutlined /> 工具结果
                                    </summary>
                                    <div className="history-tool-card-body">
                                      <pre>{block.toolResult}</pre>
                                    </div>
                                  </details>
                                )
                              }

                              return null
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            </div>
          </>
        )}
      </Modal>

      {/* 查看摘要Modal */}
      <Modal
        title="会话摘要"
        open={summaryModalVisible}
        onCancel={() => setSummaryModalVisible(false)}
        footer={null}
        width={650}
      >
        {summaryLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="正在加载会话数据..." />
          </div>
        ) : summaryData ? (
          <div>
            <Descriptions column={2} size="small" bordered labelStyle={{ width: 120 }}>
              <Descriptions.Item label="标题" span={2}>{summaryData.title}</Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color={summaryData.sessionType === 'claude' ? 'blue' : 'green'}>
                  {summaryData.sessionType === 'claude' ? 'Claude Code' : '普通终端'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="模型">{summaryData.model}</Descriptions.Item>
              <Descriptions.Item label="项目路径" span={2} contentStyle={{ fontSize: 12, wordBreak: 'break-all' }}>
                {summaryData.projectPath}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{new Date(summaryData.createdAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="最后活动">{new Date(summaryData.lastActivityAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '12px 0' }} />

            <Descriptions column={3} size="small" bordered title="对话统计" labelStyle={{ width: 100 }}>
              <Descriptions.Item label="总消息数">{summaryData.totalMessageCount}</Descriptions.Item>
              <Descriptions.Item label="用户消息">{summaryData.userMessageCount}</Descriptions.Item>
              <Descriptions.Item label="AI回复">{summaryData.assistantMessageCount}</Descriptions.Item>
              <Descriptions.Item label="工具调用">{summaryData.toolCallCount} 次</Descriptions.Item>
              <Descriptions.Item label="思考块">{summaryData.thinkingBlockCount} 个</Descriptions.Item>
              <Descriptions.Item label="持续时长">
                {summaryData.durationMinutes < 60
                  ? `${summaryData.durationMinutes} 分钟`
                  : `${Math.floor(summaryData.durationMinutes / 60)} 时 ${summaryData.durationMinutes % 60} 分`}
              </Descriptions.Item>
            </Descriptions>

            {summaryData.sessionType === 'claude' && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Descriptions column={2} size="small" bordered title="Token 消耗" labelStyle={{ width: 100 }}>
                  <Descriptions.Item label="Input">{summaryData.inputTokens.toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="Output">{summaryData.outputTokens.toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="Cached">{summaryData.cachedTokens.toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="预估费用">
                    <span style={{ color: '#f5222d', fontWeight: 'bold' }}>
                      ${summaryData.totalCost.toFixed(4)}
                    </span>
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}

            {summaryData.topTools.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <div>
                  <strong style={{ fontSize: 13 }}>工具使用 TOP5：</strong>
                  <div style={{ marginTop: 8 }}>
                    {summaryData.topTools.map((t, i) => (
                      <Tag key={i} color={['blue', 'green', 'orange', 'purple', 'cyan'][i]} style={{ marginBottom: 4 }}>
                        {t.name}: {t.count}次
                      </Tag>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      {/* AI记忆摘要Modal */}
      <Modal
        title={<span><ExperimentOutlined style={{ marginRight: 8 }} />AI 记忆摘要</span>}
        open={aiSummaryModalVisible}
        onCancel={() => setAiSummaryModalVisible(false)}
        footer={null}
        width={700}
      >
        {aiSummaryLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="正在分析会话内容..." />
          </div>
        ) : aiSummaryData ? (
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {/* 会话概述 */}
            <div style={{ marginBottom: 16, padding: '12px 16px', background: theme === 'dark' ? '#1a2332' : '#f6f8fa', borderRadius: 8, borderLeft: '4px solid #1890ff' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#4096ff' }}>📋 会话概述</div>
              <div style={{ color: theme === 'dark' ? '#ddd' : undefined }}>{aiSummaryData.overview}</div>
            </div>

            {/* 讨论要点 */}
            {aiSummaryData.userTopics.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8, color: theme === 'dark' ? '#ddd' : undefined }}>
                  💬 讨论要点 <Tag color="purple">{aiSummaryData.userTopics.length}</Tag>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto', padding: '8px 12px', background: theme === 'dark' ? '#241a2e' : '#f9f0ff', borderRadius: 6 }}>
                  {aiSummaryData.userTopics.map((t, i) => (
                    <div key={i} style={{ fontSize: 13, padding: '8px 0', borderBottom: i < aiSummaryData.userTopics.length - 1 ? `1px solid ${theme === 'dark' ? '#3a2a4a' : '#e8d8f8'}` : undefined, color: theme === 'dark' ? '#d3adf7' : undefined, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 'bold', color: theme === 'dark' ? '#b37feb' : '#722ed1' }}>#{i + 1}</span> {t}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 文件操作 */}
            {aiSummaryData.filesEdited.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8, color: theme === 'dark' ? '#ddd' : undefined }}>
                  📁 编辑的文件 <Tag color="red">{aiSummaryData.filesEdited.length}</Tag>
                </div>
                <div style={{ maxHeight: 150, overflowY: 'auto', padding: '8px 12px', background: theme === 'dark' ? '#2a1f1f' : '#fff1f0', borderRadius: 6 }}>
                  {aiSummaryData.filesEdited.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', padding: '2px 0', wordBreak: 'break-all', color: theme === 'dark' ? '#e8a0a0' : undefined }}>
                      ✏️ {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiSummaryData.filesRead.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8, color: theme === 'dark' ? '#ddd' : undefined }}>
                  📖 读取的文件 <Tag color="blue">{aiSummaryData.filesRead.length}</Tag>
                </div>
                <div style={{ maxHeight: 120, overflowY: 'auto', padding: '8px 12px', background: theme === 'dark' ? '#1a2332' : '#e6f7ff', borderRadius: 6 }}>
                  {aiSummaryData.filesRead.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', padding: '2px 0', wordBreak: 'break-all', color: theme === 'dark' ? '#91caff' : undefined }}>
                      📄 {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 执行的命令 */}
            {aiSummaryData.commandsRun.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8, color: theme === 'dark' ? '#ddd' : undefined }}>
                  ⚡ 执行的命令 <Tag color="orange">{aiSummaryData.commandsRun.length}</Tag>
                </div>
                <div style={{ maxHeight: 120, overflowY: 'auto', padding: '8px 12px', background: theme === 'dark' ? '#2a2418' : '#fff7e6', borderRadius: 6 }}>
                  {aiSummaryData.commandsRun.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', padding: '2px 0', color: theme === 'dark' ? '#ffc069' : undefined }}>
                      $ {c}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 遇到的问题 */}
            {aiSummaryData.errorsEncountered.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8, color: theme === 'dark' ? '#ddd' : undefined }}>
                  ⚠️ 遇到的问题 <Tag color="red">{aiSummaryData.errorsEncountered.length}</Tag>
                </div>
                <div style={{ padding: '8px 12px', background: theme === 'dark' ? '#2a1f1f' : '#fff1f0', borderRadius: 6 }}>
                  {aiSummaryData.errorsEncountered.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', padding: '3px 0', color: theme === 'dark' ? '#ffa8a8' : '#cf1322' }}>
                      ⚠ {e}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 工具使用统计 */}
            {aiSummaryData.toolSummary.length > 0 && (
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 8, color: theme === 'dark' ? '#ddd' : undefined }}>
                  🔧 工具使用统计
                </div>
                <div style={{ padding: '8px 12px', background: theme === 'dark' ? '#262626' : '#f6f6f6', borderRadius: 6 }}>
                  {aiSummaryData.toolSummary.map((t, i) => (
                    <Tag key={i} style={{ marginBottom: 4 }}>
                      {t.description} ({t.tool}): {t.count}次
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* 回收站Modal */}
      <TrashModal
        visible={trashModalVisible}
        onClose={() => setTrashModalVisible(false)}
        theme={theme}
      />

      {/* 查看所有会话ID Modal */}
      <Modal
        title="所有会话 ID"
        open={sessionIdModalVisible}
        onCancel={() => setSessionIdModalVisible(false)}
        footer={null}
        width={600}
        className={`session-id-modal ${theme}`}
      >
        {sessions.length === 0 ? (
          <Empty description="暂无会话" />
        ) : (
          <div className="session-id-list">
            {Object.entries(
              sessions.reduce((acc, session) => {
                const path = session.projectPath
                if (!acc[path]) acc[path] = []
                acc[path].push(session)
                return acc
              }, {} as Record<string, typeof sessions>)
            ).map(([projectPath, projectSessions]) => (
              <div key={projectPath} className="session-id-group">
                <div className="session-id-group-header">
                  <FolderOutlined style={{ marginRight: 8 }} />
                  <span className="project-name">{projectPath.split(/[/\\]/).pop()}</span>
                  <span className="session-count">{projectSessions.length} 个会话</span>
                </div>
                <div className="session-id-items">
                  {projectSessions.map((session) => (
                    <div key={session.id} className="session-id-item">
                      <div className="session-id-info">
                        <span className="session-title">{session.title}</span>
                        <span className="session-id-text">
                          {session.cliSessionId || '(未启动)'}
                        </span>
                      </div>
                      {session.cliSessionId && (
                        <Tooltip title="复制会话ID">
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => {
                              navigator.clipboard.writeText(session.cliSessionId || '')
                              message.success('已复制会话ID')
                            }}
                          />
                        </Tooltip>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Sidebar
