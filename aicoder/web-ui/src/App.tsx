import { useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { type Session } from './api/client'
import Login from './pages/Login'
import SessionList from './pages/SessionList'
import ChatView from './pages/ChatView'
import TokenStats from './pages/TokenStats'
import Settings from './pages/Settings'

type Tab = 'sessions' | 'stats' | 'settings'

export default function App() {
  const { isAuthenticated } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('sessions')
  const [chatSession, setChatSession] = useState<Session | null>(null)

  if (!isAuthenticated) {
    return <Login />
  }

  // 聊天视图
  if (chatSession) {
    return (
      <ChatView
        session={chatSession}
        onBack={() => setChatSession(null)}
      />
    )
  }

  return (
    <div className="app-container">
      <div className="main-content">
        {activeTab === 'sessions' && (
          <SessionList onEnterChat={(s) => setChatSession(s)} />
        )}
        {activeTab === 'stats' && <TokenStats />}
        {activeTab === 'settings' && <Settings />}
      </div>

      <nav className="tab-bar">
        <button
          className={`tab-item ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          <span className="tab-icon">💬</span>
          <span className="tab-label">会话</span>
        </button>
        <button
          className={`tab-item ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">统计</span>
        </button>
        <button
          className={`tab-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className="tab-icon">⚙️</span>
          <span className="tab-label">设置</span>
        </button>
      </nav>
    </div>
  )
}
