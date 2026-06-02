import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'

export default function Login() {
  const [token, setToken] = useState('')
  const { login, isLoading, error } = useAuthStore()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (token.trim()) {
      login(token.trim())
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-icon">⚡</span>
          <h1>H CLIer</h1>
          <p className="login-subtitle">Remote Access</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="token">Access Token</label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="输入桌面端显示的访问令牌"
              autoFocus
              autoComplete="off"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn-primary" disabled={isLoading || !token.trim()}>
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
