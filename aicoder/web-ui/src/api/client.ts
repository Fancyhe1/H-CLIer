const BASE_URL = ''

class ApiClient {
  private token: string | null = null

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

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    })

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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = this.getToken()
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
