import { useState, useEffect, useRef } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { Button, Tabs } from 'antd'
import type { TabsProps } from 'antd'
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

  const { sessions, activeSessionId, setActiveSession, closedSessionId } = useSessionStore()

  // 监听关闭会话事件，从标签栏移除
  useEffect(() => {
    if (closedSessionId) {
      // 从标签栏移除
      setTabs((prev) => prev.filter(tab => tab.key !== closedSessionId))

      // 如果关闭的是当前激活的标签页，切换到其他标签页
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

    // 检测被删除的会话
    const currentSessionIds = new Set(sessions.map(s => s.id))
    const deletedSessionIds = prevSessions
      .filter(s => !currentSessionIds.has(s.id))
      .map(s => s.id)

    if (deletedSessionIds.length > 0) {
      // 从标签栏移除
      setTabs((prev) => prev.filter(tab => !deletedSessionIds.includes(tab.key)))

      // 如果当前激活的标签页被删除，切换到其他标签页
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
        // 检查是否已在标签栏
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
          // 更新标题
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
      // 打开新建会话对话框 - 通过Sidebar触发
      const btn = document.querySelector(
        '[data-testid="new-session-btn"]'
      ) as HTMLButtonElement
      btn?.click()
    } else {
      // 关闭标签页 - 保留 cliSessionId 用于下次恢复
      const sessionId = targetKey as string

      // 设置关闭的会话ID，通知 MultiTerminal 销毁终端
      useSessionStore.getState().setClosedSession(sessionId)

      // 从标签栏移除
      const newTabs = tabs.filter((tab) => tab.key !== targetKey)
      setTabs(newTabs)

      // 如果关闭的是当前激活的标签页，切换到其他标签页
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

  const items: TabsProps['items'] = tabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
  }))

  return (
    <div className="tab-bar">
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
          <Tabs
            type="editable-card"
            activeKey={activeKey}
            onChange={onChange}
            onEdit={onEdit}
            items={items}
            hideAdd
            className="terminal-tabs"
          />
        )}
      </div>
    </div>
  )
}

export default TabBar
