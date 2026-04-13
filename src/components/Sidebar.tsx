import { useState, useEffect } from 'react'
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
} from '@ant-design/icons'
import {
  Button,
  Input,
  Tree,
  Dropdown,
  Modal,
  message,
  Empty,
} from 'antd'
import type { MenuProps } from 'antd'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import CreateSessionModal from './CreateSessionModal'
import { handleExportSession } from '../utils/export'
import type { SessionType } from '../types/session'
import '../styles/Sidebar.css'

interface SidebarProps {
  collapsed?: boolean
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

function Sidebar(_props: SidebarProps) {
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState<SessionType>('claude')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [defaultProjectPath, setDefaultProjectPath] = useState<string | undefined>(undefined)
  const [editingSession, setEditingSession] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [historyModalVisible, setHistoryModalVisible] = useState(false)
  const [historyMessages, setHistoryMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([])
  const [summaryModalVisible, setSummaryModalVisible] = useState(false)
  const [summaryData, setSummaryData] = useState<any>(null)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  const {
    sessions,
    activeSessionId,
    fetchSessions,
    setActiveSession,
    toggleFavorite,
    setSessionColor,
    deleteSession,
    createSession,
    claudeSessions,
    terminalSessions,
  } = useSessionStore()

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

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

      // 第四组：删除
      {
        key: 'remove-directory',
        icon: <DeleteOutlined />,
        label: `移除整个目录 (${sessionCount})`,
        danger: true,
        onClick: () => handleRemoveDirectory(projectPath, sessionCount),
      },
    ]
  }

  // 解析终端历史记录为消息列表
  const parseHistoryToMessages = (history: string): Array<{role: 'user' | 'assistant', content: string}> => {
    if (!history || history.trim().length === 0) {
      return []
    }

    const messages: Array<{role: 'user' | 'assistant', content: string}> = []

    // 清理ANSI控制字符和特殊字符
    let cleanHistory = history
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')   // 移除ANSI颜色码
      .replace(/\x1b\][^\x07]*\x07/g, '')       // 移除OSC序列
      .replace(/\x1b[()][AB012]/g, '')          // 移除字符集选择
      .replace(/\x1b\[\?25[hl]/g, '')           // 移除光标显示/隐藏
      .replace(/\x1b\[\?1049[hl]/g, '')         // 移除备选屏幕缓冲
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')

    // 需要完全过滤的行模式
    const lineFilterPatterns = [
      /^\s*$/,                                     // 空行
      /^\s*[\$#>]\s*$/,                           // 只有提示符
      /^\s*[\$#>]\s*(claude|node|npm|npx)\s*/i,   // 命令行
      /ClaudeCodev\d+/i,                           // 版本信息
      /Claude\s*Code\s*v\d+/i,                     // 版本信息变体
      /API\s*Usage\s*(\&|and)\s*Billing/i,        // API使用
      /^[\s─═]+$/,                                 // 只有分隔线
      /[─═]{5,}/,                                  // 长分隔线
      /main-assistant/i,                           // 状态栏
      /\?\s*for\s*shortcuts/i,                     // 快捷键提示
      /esc\s*to\s*interrupt/i,                     // 中断提示
      /high\s*[·•]\s*\/\s*effort/i,                // effort提示
      /Shimmying/i,                                // 动画文字
      /\(thinking\)/i,                             // thinking动画
      /[✽✻✶✢·•○◦●]/,                               // 动画字符
      /正在转换会话记录/i,                           // 转换提示
      /\d+\/\d+\s*$/,                              // 进度显示
      /^\s*@\s*$/,                                 // 只有@符号
      /qianfan-code/i,                             // 模型名称
      /^>\s*$/m,                                   // 只有>符号
      /^\s*exit\s*$/i,                             // exit命令
      /^\s*clear\s*$/i,                            // clear命令
      /\[\d+;\d+H/,                                // 光标定位
      /\[\?25[hl]/,                                // 光标显示
      /Loading|加载中/i,                           // 加载提示
      /Please wait|请稍候/i,                        // 等待提示
    ]

    // 用户消息的标识模式
    const userPatterns = [
      /^用户[：:]\s*/i,
      /^User[：:]\s*/i,
      /^>\s*.+/,  // 以>开头的输入
    ]

    // 按段落分割（连续的非空行组成一个段落）
    const lines = cleanHistory.split('\n')
    const paragraphs: string[] = []
    let currentParagraph: string[] = []

    for (const line of lines) {
      const trimmedLine = line.trim()

      // 检查是否需要过滤整行
      const shouldFilterLine = lineFilterPatterns.some(p => p.test(trimmedLine))

      if (shouldFilterLine || !trimmedLine) {
        // 结束当前段落
        if (currentParagraph.length > 0) {
          const paragraph = currentParagraph.join('\n').trim()
          if (paragraph.length > 10) {  // 至少10个字符
            paragraphs.push(paragraph)
          }
          currentParagraph = []
        }
        continue
      }

      // 清理行首符号
      const cleanLine = trimmedLine
        .replace(/^[●○◦■□▪▫►►▸▹→•]\s*/, '')  // 移除行首符号
        .replace(/^\s*[│|]\s*/, '')             // 移除竖线边框
        .trim()

      if (cleanLine && cleanLine.length > 1) {
        currentParagraph.push(cleanLine)
      }
    }

    // 保存最后一个段落
    if (currentParagraph.length > 0) {
      const paragraph = currentParagraph.join('\n').trim()
      if (paragraph.length > 10) {
        paragraphs.push(paragraph)
      }
    }

    // 分析段落，识别用户/助手消息
    for (const paragraph of paragraphs) {
      // 检查是否是用户消息
      const isUserMessage = userPatterns.some(p => p.test(paragraph)) ||
                           (paragraph.length < 100 && !paragraph.includes('。') && !paragraph.includes('！') && !paragraph.includes('？') && !paragraph.includes('\n'))

      // 检查是否是助手消息的特征
      const assistantFeatures = [
        '你好', '您好', '很高兴', '欢迎', '我可以帮', '有什么我可以',
        '让我', '我来', '我将', '首先', '接下来', '然后', '最后',
        '建议', '推荐', '请注意', '需要说明', '总结', '总之',
        '```', '代码如下', '示例如下', '步骤如下',  // 代码和结构化内容
        '！', '？', '。',  // 中文标点（长文本）
      ]
      const isAssistantMessage = assistantFeatures.some(f => paragraph.includes(f)) ||
                                  paragraph.length > 100

      if (isUserMessage && !isAssistantMessage) {
        // 用户消息
        let content = paragraph
          .replace(/^用户[：:]\s*/i, '')
          .replace(/^User[：:]\s*/i, '')
          .replace(/^>\s*/, '')
        messages.push({ role: 'user', content })
      } else {
        // 助手消息
        if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
          // 合并连续的助手消息
          messages[messages.length - 1].content += '\n\n' + paragraph
        } else {
          messages.push({ role: 'assistant', content: paragraph })
        }
      }
    }

    return messages
  }

  // 查看历史
  const handleViewHistory = async (sessionId: string) => {
    try {
      const history = await invoke<string>('read_terminal_history', { sessionId })
      const messages = parseHistoryToMessages(history || '')
      setHistoryMessages(messages)
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
      onClick: () => handleViewHistory(sessionId),
    },
    {
      key: 'summary',
      icon: <FileTextOutlined />,
      label: '查看摘要',
      onClick: () => {
        const session = sessions.find((s) => s.id === sessionId)
        if (session) {
          setSummaryData({
            title: session.title,
            projectPath: session.projectPath,
            createdAt: session.createdAt,
            lastActivityAt: session.lastActivityAt,
            messageCount: session.messageCount,
            sessionType: session.sessionType,
          })
          setSummaryModalVisible(true)
        }
      },
    },
    {
      key: 'ai-summary',
      icon: <ExperimentOutlined />,
      label: 'AI记忆摘要',
      onClick: () => message.info('AI记忆摘要功能开发中'),
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

  // 关闭会话（清除 cliSessionId）
  const handleCloseSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
      useSessionStore.getState().updateSession({ ...session, cliSessionId: undefined })
    }
    // 如果关闭的是当前激活的会话，清除激活状态
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
    // 会话是否已开启（有 cliSessionId 表示已启动过 Claude）
    const isStarted = !!session.cliSessionId
    // 颜色：未开启显示灰色，开启后显示设置的颜色或默认白色
    const displayColor = isStarted
      ? (session.color || '#ffffff')
      : '#888888'

    return (
      <Dropdown
        menu={{ items: createMenuItems(session.id, session.isFavorite, session.projectPath) }}
        trigger={['contextMenu']}
        overlayClassName="session-context-menu"
      >
        <div
          className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
          onClick={() => setActiveSession(session.id)}
        >
          <div className="session-info">
            <div
              className="color-tag"
              style={{
                backgroundColor: displayColor,
                opacity: isStarted ? 1 : 0.5
              }}
            />
            {session.isFavorite && <StarFilled className="favorite-icon" />}
            <span className="session-title">{session.title}</span>
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
      </Dropdown>
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

    const treeData = []

    if (favoriteSessions.length > 0) {
      // 获取收藏会话的项目路径（用于新建会话）
      const favoriteProjectPaths = [...new Set(favoriteSessions.map(s => s.projectPath))]
      const defaultProjectPath = favoriteProjectPaths[0] || ''

      treeData.push({
        title: (
          <Dropdown
            menu={{ items: createGroupMenuItems(defaultProjectPath, favoriteSessions.length, true) }}
            trigger={['contextMenu']}
            overlayClassName="session-context-menu"
          >
            <div
              className="group-title-wrapper"
              onClick={(e) => toggleExpand('favorites', e)}
            >
              <span className="group-title">
                <StarFilled style={{ color: '#faad14' }} /> 收藏
              </span>
              <span className="group-count">{favoriteSessions.length}</span>
            </div>
          </Dropdown>
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
          <Dropdown
            menu={{ items: createGroupMenuItems(path, pathSessions.length, false) }}
            trigger={['contextMenu']}
            overlayClassName="session-context-menu"
          >
            <div
              className="group-title-wrapper"
              onClick={(e) => toggleExpand(path, e)}
            >
              <span className="group-title">
                <FolderOutlined /> {path.split('/').pop()}
              </span>
              <span className="group-count">{pathSessions.length}</span>
            </div>
          </Dropdown>
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
          data-testid="new-session-btn"
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
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as string[])}
            className="session-tree"
            selectable={false}
          />
        )}
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
        width={800}
      >
        {historyMessages.length === 0 ? (
          <Empty description="暂无对话历史" />
        ) : (
          <div className="history-chat-container">
            {historyMessages.map((msg, index) => (
              <div key={index} className={`history-message ${msg.role}`}>
                <div className="history-message-role">
                  {msg.role === 'user' ? (
                    <><UserOutlined /> 用户</>
                  ) : (
                    <><RobotOutlined /> Claude</>
                  )}
                </div>
                <div className="history-message-content">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 查看摘要Modal */}
      <Modal
        title="会话摘要"
        open={summaryModalVisible}
        onCancel={() => setSummaryModalVisible(false)}
        footer={null}
        width={500}
      >
        {summaryData && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>标题：</strong>{summaryData.title}</p>
            <p><strong>类型：</strong>{summaryData.sessionType === 'claude' ? 'Claude Code' : '普通终端'}</p>
            <p><strong>项目路径：</strong>{summaryData.projectPath}</p>
            <p><strong>创建时间：</strong>{new Date(summaryData.createdAt).toLocaleString()}</p>
            <p><strong>最后活动：</strong>{new Date(summaryData.lastActivityAt).toLocaleString()}</p>
            <p><strong>消息数量：</strong>{summaryData.messageCount}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Sidebar
