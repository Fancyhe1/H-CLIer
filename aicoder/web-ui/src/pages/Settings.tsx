import { useState, useEffect } from 'react'
import { api, type ServerInfo } from '../api/client'
import { useAuthStore } from '../stores/authStore'

export default function Settings() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const { logout } = useAuthStore()

  useEffect(() => {
    api.getServerInfo().then(setServerInfo).catch(() => {})
  }, [])

  return (
    <div className="settings-page">
      <div className="page-header">
        <h2>设置</h2>
      </div>

      <div className="settings-section">
        <h3>🌐 远程连接</h3>
        <p className="section-desc">
          远程访问由桌面端控制。在桌面端 AICoder 设置中开启/关闭。
        </p>
        <div className="info-list">
          <div className="info-row">
            <span className="info-label">状态</span>
            <span className="info-value" style={{ color: '#2ecc71' }}>✅ 已连接</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>服务器信息</h3>
        {serverInfo ? (
          <div className="info-list">
            <div className="info-row">
              <span className="info-label">版本</span>
              <span className="info-value">v{serverInfo.version}</span>
            </div>
            <div className="info-row">
              <span className="info-label">端口</span>
              <span className="info-value">{serverInfo.port}</span>
            </div>
          </div>
        ) : (
          <div className="loading">加载中...</div>
        )}
      </div>

      <div className="settings-section">
        <h3>账号</h3>
        <button className="btn-danger" onClick={logout}>
          断开连接
        </button>
      </div>
    </div>
  )
}
