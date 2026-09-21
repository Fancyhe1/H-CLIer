import { useState, useEffect, useRef, useCallback } from 'react'
import { PlusOutlined, BarChartOutlined, DownOutlined } from '@ant-design/icons'
import { Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { useSessionStore } from '../stores/sessionStore'
import '../styles/TabBar.css'

interface TabItem {
  key: string
  label: string
  projectPath: string
  isPanel?: boolean
}

// 面板 tab 的 key 前缀
const PANEL_PREFIX = '__panel:'

// 面板注册表
const PANEL_REGISTRY: Record<string, { label: string; icon?: React.ReactNode }> = {
  stats: { label: 'Token 统计', icon: <BarChartOutlined /> },
}

interface TabBarProps {
  activePanel: string
  onActivePanelChange: (panel: string) => void
}

function TabBar({ activePanel, onActivePanelChange }: TabBarProps) {
  const [sessionTabs, setSessionTabs] = useState<TabItem[]>([])
  const [panelTabs, setPanelTabs] = useState<TabItem[]>([])
  const [activeKey, setActiveKey] = useState<string>()
  const prevSessionsRef = useRef<typeof sessions>([])
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  // 拖拽状态
  const dragRef = useRef<{
    startX: number
    startY: number
    index: number
    started: boolean
  } | null>(null)
  const dragJustEnded = useRef(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null)

  const isDragging = dragIndex !== null

  const { sessions, activeSessionId, setActiveSession, closedSessionId } = useSessionStore()

  // 合并标签列表：面板标签在前，会话标签在后
  const allTabs: TabItem[] = [...panelTabs, ...sessionTabs]
  const panelCount = panelTabs.length

  // ── 面板标签管理 ──
  // 当 activePanel 变为非 terminal 时，确保对应面板 tab 存在
  useEffect(() => {
    if (activePanel === 'terminal') return
    const panelKey = `${PANEL_PREFIX}${activePanel}`
    const reg = PANEL_REGISTRY[activePanel]
    if (!reg) return

    setPanelTabs(prev => {
      if (prev.some(t => t.key === panelKey)) return prev
      return [...prev, { key: panelKey, label: reg.label, projectPath: '', isPanel: true }]
    })
    setActiveKey(panelKey)
  }, [activePanel])

  // ── 会话标签管理 ──
  // 监听关闭会话事件
  useEffect(() => {
    if (!closedSessionId) return
    setSessionTabs(prev => prev.filter(tab => tab.key !== closedSessionId))

    if (activeKey === closedSessionId) {
      const remaining = sessionTabs.filter(tab => tab.key !== closedSessionId)
      if (remaining.length > 0) {
        const newKey = remaining[remaining.length - 1].key
        setActiveKey(newKey)
        setActiveSession(newKey)
        onActivePanelChange('terminal')
      } else if (panelTabs.length > 0) {
        setActiveKey(panelTabs[panelTabs.length - 1].key)
      } else {
        setActiveKey(undefined)
        setActiveSession(null)
        onActivePanelChange('terminal')
      }
    }
  }, [closedSessionId])

  // 监听会话删除
  useEffect(() => {
    const prevSessions = prevSessionsRef.current
    const currentIds = new Set(sessions.map(s => s.id))
    const deletedIds = prevSessions.filter(s => !currentIds.has(s.id)).map(s => s.id)

    if (deletedIds.length > 0) {
      setSessionTabs(prev => prev.filter(tab => !deletedIds.includes(tab.key)))

      if (deletedIds.includes(activeKey || '')) {
        const remaining = sessionTabs.filter(tab => !deletedIds.includes(tab.key))
        if (remaining.length > 0) {
          const newKey = remaining[remaining.length - 1].key
          setActiveKey(newKey)
          setActiveSession(newKey)
          onActivePanelChange('terminal')
        } else if (panelTabs.length > 0) {
          setActiveKey(panelTabs[panelTabs.length - 1].key)
        } else {
          setActiveKey(undefined)
          setActiveSession(null)
          onActivePanelChange('terminal')
        }
      }
    }
    prevSessionsRef.current = sessions
  }, [sessions])

  // 当激活会话变化时，添加到标签栏
  useEffect(() => {
    if (!activeSessionId) return
    const session = sessions.find(s => s.id === activeSessionId)
    if (!session) return

    setSessionTabs(prev => {
      const exists = prev.find(t => t.key === session.id)
      if (!exists) {
        return [...prev, { key: session.id, label: session.title, projectPath: session.projectPath }]
      }
      return prev.map(t => t.key === session.id ? { ...t, label: session.title } : t)
    })
    setActiveKey(session.id)
  }, [activeSessionId, sessions])

  // ── 交互 ──
  const handleTabClick = (tab: TabItem) => {
    if (tab.isPanel) {
      const panelId = tab.key.replace(PANEL_PREFIX, '')
      setActiveKey(tab.key)
      onActivePanelChange(panelId)
    } else {
      setActiveKey(tab.key)
      setActiveSession(tab.key)
      onActivePanelChange('terminal')
    }
  }

  const handleClose = (tab: TabItem, e: React.MouseEvent) => {
    e.stopPropagation()

    if (tab.isPanel) {
      // 关闭面板标签
      setPanelTabs(prev => prev.filter(t => t.key !== tab.key))
      if (activeKey === tab.key) {
        // 切回最近的会话，或保持无状态
        if (sessionTabs.length > 0) {
          const last = sessionTabs[sessionTabs.length - 1]
          setActiveKey(last.key)
          setActiveSession(last.key)
          onActivePanelChange('terminal')
        } else {
          setActiveKey(undefined)
          setActiveSession(null)
          onActivePanelChange('terminal')
        }
      }
    } else {
      // 关闭会话标签
      useSessionStore.getState().setClosedSession(tab.key)
      setSessionTabs(prev => prev.filter(t => t.key !== tab.key))

      if (activeKey === tab.key) {
        const remaining = sessionTabs.filter(t => t.key !== tab.key)
        if (remaining.length > 0) {
          const last = remaining[remaining.length - 1]
          setActiveKey(last.key)
          setActiveSession(last.key)
          onActivePanelChange('terminal')
        } else if (panelTabs.length > 0) {
          setActiveKey(panelTabs[panelTabs.length - 1].key)
        } else {
          setActiveKey(undefined)
          setActiveSession(null)
          onActivePanelChange('terminal')
        }
      }
    }
  }

  const handleAdd = () => {
    const btn = document.querySelector('[data-testid="new-session-btn"]') as HTMLButtonElement
    btn?.click()
  }

  // ── 拖拽（只对会话标签生效） ──
  const getTabIndexFromPoint = useCallback((x: number): number | null => {
    const container = tabsContainerRef.current
    if (!container) return null
    const tabEls = container.querySelectorAll('.custom-tab')
    if (tabEls.length === 0) return 0

    let closestIndex = 0
    let closestDist = Infinity
    for (let i = 0; i <= tabEls.length; i++) {
      let gapX: number
      if (i === 0) gapX = tabEls[0].getBoundingClientRect().left
      else if (i === tabEls.length) gapX = tabEls[tabEls.length - 1].getBoundingClientRect().right
      else gapX = (tabEls[i - 1].getBoundingClientRect().right + tabEls[i].getBoundingClientRect().left) / 2

      const dist = Math.abs(x - gapX)
      if (dist < closestDist) { closestDist = dist; closestIndex = i }
    }
    return closestIndex
  }, [])

  const handleTabMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    // 面板标签不可拖拽
    if (allTabs[index]?.isPanel) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, index, started: false }
  }, [allTabs])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (!dragRef.current.started) {
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          dragRef.current.started = true
          setDragIndex(dragRef.current.index)
        }
        return
      }
      setDropInsertIndex(getTabIndexFromPoint(e.clientX))
    }

    const handleMouseUp = () => {
      if (!dragRef.current) return
      if (dragRef.current.started) {
        dragJustEnded.current = true
        if (dropInsertIndex !== null && dragIndex !== null) {
          // 只在会话标签范围内排序（偏移面板数量）
          const sIdx = dragIndex - panelCount
          const sDrop = dropInsertIndex - panelCount
          if (sIdx >= 0 && sDrop >= 0) {
            const newTabs = [...sessionTabs]
            const [removed] = newTabs.splice(sIdx, 1)
            const insertAt = sDrop > sIdx ? sDrop - 1 : sDrop
            newTabs.splice(Math.max(0, insertAt), 0, removed)
            setSessionTabs(newTabs)
          }
        }
        setDragIndex(null)
        setDropInsertIndex(null)
      }
      dragRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragIndex, dropInsertIndex, sessionTabs, panelCount, getTabIndexFromPoint])

  // ── 滚轮横向滚动 ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const container = tabsContainerRef.current
    if (!container) return
    // 只在有横向溢出时接管滚轮
    if (container.scrollWidth <= container.clientWidth) return
    e.preventDefault()
    container.scrollLeft += e.deltaY
  }, [])

  // ── 展开菜单 ──
  const dropdownItems: MenuProps['items'] = allTabs.map((tab) => {
    const panelReg = tab.isPanel ? PANEL_REGISTRY[tab.key.replace(PANEL_PREFIX, '')] : undefined
    return {
      key: tab.key,
      icon: panelReg?.icon || undefined,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {tab.label}
          </span>
          {tab.key === activeKey && <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>●</span>}
        </span>
      ),
      onClick: () => handleTabClick(tab),
    }
  })

  // ── 渲染 ──
  return (
    <div className={`tab-bar ${isDragging ? 'dragging-active' : ''}`}>
      <Button
        type="text"
        icon={<PlusOutlined />}
        onClick={handleAdd}
        className="new-tab-btn"
      />
      <div className="tab-bar-tabs" onWheel={handleWheel}>
        {allTabs.length === 0 ? (
          <div className="empty-tabs" />
        ) : (
          <div className="custom-tabs" ref={tabsContainerRef}>
            {allTabs.map((tab, index) => {
              const session = !tab.isPanel ? sessions.find(s => s.id === tab.key) : undefined
              const hasUnread = session?.hasUnread
              const isActive = tab.key === activeKey
              const isDraggingThis = dragIndex === index

              let dropClass = ''
              if (dropInsertIndex === index) dropClass = 'drop-before'
              else if (dropInsertIndex === allTabs.length && index === allTabs.length - 1) dropClass = 'drop-after'

              const panelReg = tab.isPanel ? PANEL_REGISTRY[tab.key.replace(PANEL_PREFIX, '')] : undefined

              return (
                <div
                  key={tab.key}
                  className={`custom-tab ${isActive ? 'active' : ''} ${isDraggingThis ? 'dragging' : ''} ${dropClass} ${tab.isPanel ? 'panel-tab' : ''}`}
                  onMouseDown={(e) => handleTabMouseDown(index, e)}
                  onClick={() => {
                    if (dragJustEnded.current) { dragJustEnded.current = false; return }
                    handleTabClick(tab)
                  }}
                >
                  {panelReg?.icon && <span className="custom-tab-icon">{panelReg.icon}</span>}
                  <span className="custom-tab-label">{tab.label}</span>
                  {hasUnread && <span className="unread-dot" />}
                  <span
                    className="custom-tab-close"
                    onClick={(e) => handleClose(tab, e)}
                  >
                    ✕
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {allTabs.length > 0 && (
        <Dropdown menu={{ items: dropdownItems }} trigger={['click']} placement="bottomRight">
          <Button
            type="text"
            icon={<DownOutlined />}
            className="tab-expand-btn"
          />
        </Dropdown>
      )}
    </div>
  )
}

export default TabBar
