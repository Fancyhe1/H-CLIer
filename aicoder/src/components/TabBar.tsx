import { useState, useEffect, useRef, useCallback } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useSessionStore } from '../stores/sessionStore'
import '../styles/TabBar.css'

interface TabItem {
  key: string
  label: string
  projectPath: string
}

function TabBar() {
  const [tabs, setTabs] = useState<TabItem[]>([])
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

  // 监听关闭会话事件，从标签栏移除
  useEffect(() => {
    if (closedSessionId) {
      setTabs((prev) => prev.filter(tab => tab.key !== closedSessionId))

      if (activeKey === closedSessionId) {
        const remainingTabs = tabs.filter(tab => tab.key !== closedSessionId)
        if (remainingTabs.length > 0) {
          const newActiveKey = remainingTabs[remainingTabs.length - 1].key
          setActiveKey(newActiveKey)
          setActiveSession(newActiveKey)
        } else {
          setActiveKey(undefined)
          setActiveSession(null)
        }
      }
    }
  }, [closedSessionId, activeKey, setActiveSession, tabs])

  // 监听会话删除，同步更新标签栏
  useEffect(() => {
    const prevSessions = prevSessionsRef.current
    const currentSessionIds = new Set(sessions.map(s => s.id))
    const deletedSessionIds = prevSessions
      .filter(s => !currentSessionIds.has(s.id))
      .map(s => s.id)

    if (deletedSessionIds.length > 0) {
      setTabs((prev) => prev.filter(tab => !deletedSessionIds.includes(tab.key)))

      if (deletedSessionIds.includes(activeKey || '')) {
        const remainingTabs = tabs.filter(tab => !deletedSessionIds.includes(tab.key))
        if (remainingTabs.length > 0) {
          const newActiveKey = remainingTabs[remainingTabs.length - 1].key
          setActiveKey(newActiveKey)
          setActiveSession(newActiveKey)
        } else {
          setActiveKey(undefined)
          setActiveSession(null)
        }
      }
    }

    prevSessionsRef.current = sessions
  }, [sessions, activeKey, setActiveSession, tabs])

  // 当激活会话变化时，添加到标签栏
  useEffect(() => {
    if (activeSessionId) {
      const session = sessions.find((s) => s.id === activeSessionId)
      if (session) {
        const exists = tabs.find((t) => t.key === session.id)
        if (!exists) {
          setTabs((prev) => [
            ...prev,
            {
              key: session.id,
              label: session.title,
              projectPath: session.projectPath,
            },
          ])
        } else {
          setTabs((prev) =>
            prev.map((t) =>
              t.key === session.id ? { ...t, label: session.title } : t
            )
          )
        }
        setActiveKey(session.id)
      }
    }
  }, [activeSessionId, sessions])

  const onChange = (newActiveKey: string) => {
    setActiveKey(newActiveKey)
    setActiveSession(newActiveKey)
  }

  const onEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: 'add' | 'remove'
  ) => {
    if (action === 'add') {
      const btn = document.querySelector(
        '[data-testid="new-session-btn"]'
      ) as HTMLButtonElement
      btn?.click()
    } else {
      const sessionId = targetKey as string
      useSessionStore.getState().setClosedSession(sessionId)

      const newTabs = tabs.filter((tab) => tab.key !== targetKey)
      setTabs(newTabs)

      if (activeKey === targetKey) {
        if (newTabs.length > 0) {
          const newActiveKey = newTabs[newTabs.length - 1].key
          setActiveKey(newActiveKey)
          setActiveSession(newActiveKey)
        } else {
          setActiveKey(undefined)
          setActiveSession(null)
        }
      }
    }
  }

  // 获取标签页插入位置
  const getTabIndexFromPoint = useCallback((x: number, _y: number): number | null => {
    const container = tabsContainerRef.current
    if (!container) return null

    const tabEls = container.querySelectorAll('.custom-tab')
    if (tabEls.length === 0) return 0

    let closestIndex = 0
    let closestDistance = Infinity

    for (let i = 0; i <= tabEls.length; i++) {
      let gapX: number
      if (i === 0) {
        const rect = tabEls[0].getBoundingClientRect()
        gapX = rect.left
      } else if (i === tabEls.length) {
        const rect = tabEls[tabEls.length - 1].getBoundingClientRect()
        gapX = rect.right
      } else {
        const prevRect = tabEls[i - 1].getBoundingClientRect()
        const nextRect = tabEls[i].getBoundingClientRect()
        gapX = (prevRect.right + nextRect.left) / 2
      }

      const distance = Math.abs(x - gapX)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = i
      }
    }

    return closestIndex
  }, [])

  // 标签页拖拽开始
  const handleTabMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, index, started: false }
  }, [])

  // 文档级别的 mousemove/mouseup
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

      const insertIndex = getTabIndexFromPoint(e.clientX, e.clientY)
      setDropInsertIndex(insertIndex)
    }

    const handleMouseUp = () => {
      if (!dragRef.current) return

      if (dragRef.current.started) {
        dragJustEnded.current = true

        if (dropInsertIndex !== null && dragIndex !== null) {
          const newTabs = [...tabs]
          const [removed] = newTabs.splice(dragIndex, 1)
          const insertAt = dropInsertIndex > dragIndex ? dropInsertIndex - 1 : dropInsertIndex
          newTabs.splice(insertAt, 0, removed)
          setTabs(newTabs)
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
  }, [dragIndex, dropInsertIndex, tabs, getTabIndexFromPoint])

  return (
    <div className={`tab-bar ${isDragging ? 'dragging-active' : ''}`}>
      <Button
        type="text"
        icon={<PlusOutlined />}
        onClick={() => onEdit({} as React.MouseEvent, 'add')}
        className="new-tab-btn"
      />
      <div className="tab-bar-tabs">
        {tabs.length === 0 ? (
          <div className="empty-tabs" />
        ) : (
          <div className="custom-tabs" ref={tabsContainerRef}>
            {tabs.map((tab, index) => {
              const session = sessions.find(s => s.id === tab.key)
              const hasUnread = session?.hasUnread
              const isActive = tab.key === activeKey
              const isDraggingThis = dragIndex === index

              let dropClass = ''
              if (dropInsertIndex === index) dropClass = 'drop-before'
              else if (dropInsertIndex === tabs.length && index === tabs.length - 1) dropClass = 'drop-after'

              return (
                <div
                  key={tab.key}
                  className={`custom-tab ${isActive ? 'active' : ''} ${isDraggingThis ? 'dragging' : ''} ${dropClass}`}
                  onMouseDown={(e) => handleTabMouseDown(index, e)}
                  onClick={() => {
                    if (dragJustEnded.current) {
                      dragJustEnded.current = false
                      return
                    }
                    onChange(tab.key)
                  }}
                >
                  <span className="custom-tab-label">{tab.label}</span>
                  {hasUnread && <span className="unread-dot" />}
                  <span
                    className="custom-tab-close"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(tab.key, 'remove')
                    }}
                  >
                    ✕
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default TabBar
