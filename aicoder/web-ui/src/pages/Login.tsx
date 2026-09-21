import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'

export default function Login() {
  const [serverUrl, setServerUrl] = useState('')
  const [token, setToken] = useState('')
  const { login, isLoading, error } = useAuthStore()

  // 加载已保存的服务器地址
  useEffect(() => {
    const savedUrl = api.getServerUrl()
    if (savedUrl) {
      setServerUrl(savedUrl)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (serverUrl.trim() && token.trim()) {
      // 保存服务器地址
      api.setServerUrl(serverUrl.trim())
      login(token.trim())
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img className="logo-icon" src="/icons/icon.png" alt="H CLIer" width="48" height="48" />
          <h1>H CLIer</h1>
          <p className="login-subtitle">Remote Access</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="serverUrl">服务器地址</label>
            <input
              id="serverUrl"
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.100:9527"
              autoFocus
              autoComplete="off"
            />
            <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              局域网: http://电脑IP:9527
            </small>
          </div>

          <div className="input-group">
            <label htmlFor="token">Access Token</label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="输入桌面端显示的访问令牌"
              autoComplete="off"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading || !serverUrl.trim() || !token.trim()}
          >
            {isLoading ? '验证中...' : '连接'}
          </button>
        </form>

        <p className="login-hint">
          在桌面端 AICoder 的设置中查看访问令牌
        </p>
      </div>
    </div>
  )
}
