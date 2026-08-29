// 服务器地址配置
function getBaseUrl(): string {
  // 从 localStorage 获取配置的服务器地址
  const serverUrl = localStorage.getItem('hcl_server_url')
  if (serverUrl) {
    return serverUrl.replace(/\/$/, '') // 移除末尾的斜杠
  }
  // 默认使用相对路径（网页版）
  return ''
}

class ApiClient {
  private token: string | null = null

  // 设置服务器地址
  setServerUrl(url: string) {
    localStorage.setItem('hcl_server_url', url.replace(/\/$/, ''))
  }

  getServerUrl(): string {
    return localStorage.getItem('hcl_server_url') || ''
  }

  clearServerUrl() {
    localStorage.removeItem('hcl_server_url')
  }

  setToken(token: string) {
    this.token = token
    localStorage.setItem('hcl_token', token)
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('hcl_token')
    }
    return this.token
  }

  clearToken() {
    this.token = null
    localStorage.removeItem('hcl_token')
  }

  // 清除所有配置
  clearAll() {
    this.clearToken()
    this.clearServerUrl()
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = getBaseUrl()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // ngrok 免费版需要这个头来绕过警告页面
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers as Record<string, string>),
    }

    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const url = `${baseUrl}${path}`
    console.log(`[API] ${options.method || 'GET'} ${url}`)

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      })

      console.log(`[API] Response: ${res.status}`)

      if (res.status === 401) {
        this.clearToken()
        window.location.reload()
        throw new Error('Unauthorized')
      }

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Request failed')
      }
      return data.data
    } catch (err) {
      console.error(`[API] Error:`, err)
      throw err
    }
  }

  // Auth
  async login(token: string): Promise<string> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  }

  // Sessions
  async getSessions(): Promise<Session[]> {
    return this.request('/api/sessions')
  }

  async createSession(projectPath: string, title?: string, sessionType?: string): Promise<Session> {
    return this.request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ projectPath, title, sessionType }),
    })
  }

  async deleteSession(id: string): Promise<void> {
    return this.request(`/api/sessions/${id}`, { method: 'DELETE' })
  }

  // History
  async getSessionHistory(id: string): Promise<ChatMessage[]> {
    return this.request(`/api/sessions/${id}/history`)
  }

  // Token usage
  async getTokenUsage(id: string): Promise<TokenUsage> {
    return this.request(`/api/sessions/${id}/tokens`)
  }

  // Terminal
  async getTerminalHistory(id: string): Promise<string> {
    return this.request(`/api/sessions/${id}/terminal/history`)
  }

  async activateSession(id: string): Promise<string> {
    return this.request(`/api/sessions/${id}/terminal/activate`, { method: 'POST' })
  }

  async sendTerminalInput(id: string, data: string): Promise<void> {
    return this.request(`/api/sessions/${id}/terminal/input`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    })
  }

  // WebSocket URL for terminal streaming
  getTerminalWsUrl(id: string): string {
    const baseUrl = getBaseUrl()
    const token = this.getToken()

    if (baseUrl) {
      // 如果配置了服务器地址，使用配置的地址
      const url = new URL(baseUrl)
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${protocol}//${url.host}/api/ws/terminal/${id}?token=${token}`
    }

    // 否则使用当前页面地址
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/ws/terminal/${id}?token=${token}`
  }

  // Config
  async getConfig(): Promise<AppConfig> {
    return this.request('/api/config')
  }

  // Server info
  async getServerInfo(): Promise<ServerInfo> {
    return this.request('/api/server-info')
  }

  // Tunnel
  async getTunnelStatus(): Promise<TunnelStatus> {
    return this.request('/api/tunnel/status')
  }

  async startTunnel(authtoken: string): Promise<string> {
    return this.request('/api/tunnel/start', {
      method: 'POST',
      body: JSON.stringify({ authtoken }),
    })
  }

  async stopTunnel(): Promise<void> {
    return this.request('/api/tunnel/stop', { method: 'POST' })
  }
}

// Types
export interface Session {
  id: string
  projectPath: string
  title: string
  sessionType: 'claude' | 'terminal'
  color: string | null
  isFavorite: boolean
  isActive: boolean
  createdAt: string
  lastActivityAt: string
  deletedAt: string | null
  messageCount: number
  cliSessionId: string | null
  description: string | null
  sortOrder: number
}

export interface ContentBlock {
  blockType: string
  text?: string
  thinking?: string
  toolName?: string
  toolInput?: unknown
  toolUseId?: string
  toolResult?: string
}

export interface ChatMessage {
  id: string
  role: string
  timestamp: string
  content: ContentBlock[]
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cost: number
  model: string
}

export interface ServerInfo {
  version: string
  port: number
  ngrokEnabled: boolean
}

export interface TunnelStatus {
  running: boolean
  url: string | null
  error: string | null
}

export interface AppConfig {
  claude: {
    cliPath: string
    defaultArgs: string[]
    envVars: Record<string, string>
  }
  general: {
    theme: string
    terminalFontSize: number
    autoStartClaude: boolean
    defaultExportPath: string
  }
}

export const api = new ApiClient()
