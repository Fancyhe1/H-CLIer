import { useState, useEffect } from 'react'
import { api, type ServerInfo } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { NotificationSettings } from '../components/NotificationSettings'

export default function Settings() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const serverUrl = api.getServerUrl()
  const { logout } = useAuthStore()

  useEffect(() => {
    api.getServerInfo()
      .then(setServerInfo)
      .catch((err) => {
        console.error('Failed to load server info:', err)
      })
  }, [])

  const handleDisconnect = () => {
    api.clearAll()
    logout()
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h2>设置</h2>
      </div>

      <div className="settings-section">
        <h3>🔔 通知设置</h3>
        <p className="section-desc">
          开启通知以在 Claude 完成响应时收到提醒
        </p>
        <NotificationSettings />
      </div>

      <div className="settings-section">
        <h3>🌐 远程连接</h3>
        <div className="info-list">
          <div className="info-row">
            <span className="info-label">服务器</span>
            <span className="info-value" style={{ fontSize: 12, wordBreak: 'break-all' }}>
              {serverUrl || '未配置'}
            </span>
          </div>
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
        <button className="btn-danger" onClick={handleDisconnect}>
          断开连接
        </button>
        <p className="section-desc" style={{ marginTop: 8 }}>
          断开后需要重新输入服务器地址和令牌
        </p>
      </div>
    </div>
  )
}
