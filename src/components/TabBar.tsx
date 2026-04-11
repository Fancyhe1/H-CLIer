import { useState, useEffect } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { Button, Tabs, Empty } from 'antd'
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

  const { sessions, activeSessionId, setActiveSession } = useSessionStore()

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

  const items: TabsProps['items'] = tabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
  }))

  return (
    <div className="tab-bar">
      {tabs.length === 0 ? (
        <div className="empty-tabs">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="点击左侧「新建会话」开始"
          />
        </div>
      ) : (
        <>
          <Tabs
            type="editable-card"
            activeKey={activeKey}
            onChange={onChange}
            onEdit={onEdit}
            items={items}
            hideAdd
            className="terminal-tabs"
          />
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={() => onEdit({} as React.MouseEvent, 'add')}
            className="new-tab-btn"
          />
        </>
      )}
    </div>
  )
}

export default TabBar
