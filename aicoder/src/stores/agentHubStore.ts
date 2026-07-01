import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// ============================================================
// 类型定义
// ============================================================

export type TaskStatus = 'pending' | 'assigned' | 'running' | 'ready' | 'done' | 'failed' | 'blocked'
export type Priority = 'low' | 'medium' | 'high' | 'critical'

export interface Subtask {
  id: string
  title: string
  status: string
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  assignedAgent: string | null
  dependencies: string[]
  tags: string[]
  subtasks: Subtask[]
  created: string
  updated: string | null
  startedAt: string | null
  completedAt: string | null
  result: string | null
  error: string | null
  retryCount: number
}

export interface TaskUpdate {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: Priority
  assignedAgent?: string | null
  tags?: string[]
  result?: string | null
  error?: string | null
}

export interface AgentRole {
  id: string
  name: string
  description: string
  prompt: string
  model: string
  tags: string[]
}

export interface ActiveAgent {
  agentId: string
  role: string
  taskId: string
  sessionId: string | null
  startedAt: string
  lastHeartbeat: string
  status: 'running' | 'idle' | 'failed'
  currentAction: string
  pid: number | null
}

export interface HubEvent {
  ts: string
  type: string
  taskId?: string
  agent?: string
  message?: string
  filesChanged?: string[]
}

export interface BrainMeta {
  name: string
  description: string
  techStack: Record<string, string>
  repoPath: string
  defaultModel: string
}

export type AgentHubSubPanel = 'tasks' | 'brain' | 'monitor' | 'settings'

// ============================================================
// Store 定义
// ============================================================

interface AgentHubStore {
  // 状态
  tasks: Task[]
  agentRoles: AgentRole[]
  activeAgents: ActiveAgent[]
  events: HubEvent[]
  brainMeta: BrainMeta | null
  brainSections: Record<string, string>
  isInitialized: boolean
  activeSubPanel: AgentHubSubPanel
  currentProjectPath: string | null
  isLoading: boolean
  error: string | null

  // 面板切换
  setActiveSubPanel: (panel: AgentHubSubPanel) => void

  // 初始化
  initHub: (projectPath: string) => Promise<void>
  checkInitialized: (projectPath: string) => Promise<boolean>
  setProject: (projectPath: string) => Promise<void>

  // 任务操作
  loadTasks: () => Promise<void>
  createTask: (task: Partial<Task> & { id: string; title: string }) => Promise<void>
  updateTask: (id: string, updates: TaskUpdate) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  // Agent 角色操作
  loadAgentRoles: () => Promise<void>
  saveAgentRole: (role: AgentRole) => Promise<void>
  deleteAgentRole: (id: string) => Promise<void>

  // 活跃 Agent 操作
  loadActiveAgents: () => Promise<void>
  updateAgentStatus: (agentId: string, status: string, currentAction: string) => Promise<void>

  // 大脑操作
  loadBrain: () => Promise<void>
  loadBrainSection: (section: string) => Promise<string>
  updateBrainSection: (section: string, content: string) => Promise<void>
  scanProject: () => Promise<void>
  buildContext: (taskId: string) => Promise<string>

  // 事件
  loadEvents: () => Promise<void>

  // 任务执行
  runTask: (taskId: string, agentRoleId?: string) => Promise<string>
  stopAgent: (agentId: string) => Promise<string | null>
  terminateTask: (taskId: string, agentId: string, error: string) => Promise<string | null>
  completeTask: (taskId: string, agentId: string, result: string) => Promise<void>
  updateAgentSession: (agentId: string, sessionId: string) => Promise<void>
}

export const useAgentHubStore = create<AgentHubStore>((set, get) => ({
  // 初始状态
  tasks: [],
  agentRoles: [],
  activeAgents: [],
  events: [],
  brainMeta: null,
  brainSections: {},
  isInitialized: false,
  activeSubPanel: 'tasks',
  currentProjectPath: null,
  isLoading: false,
  error: null,

  setActiveSubPanel: (panel) => set({ activeSubPanel: panel }),

  // ============================================================
  // 初始化
  // ============================================================

  initHub: async (projectPath: string) => {
    try {
      set({ isLoading: true, error: null })
      await invoke('agenthub_init', { projectPath })
      set({
        isInitialized: true,
        currentProjectPath: projectPath,
      })
      // 加载所有数据
      await get().loadTasks()
      await get().loadAgentRoles()
      await get().loadActiveAgents()
      await get().loadEvents()
      await get().loadBrain()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    } finally {
      set({ isLoading: false })
    }
  },

  checkInitialized: async (projectPath: string) => {
    try {
      const result = await invoke<boolean>('agenthub_is_initialized', { projectPath })
      set({ isInitialized: result, currentProjectPath: projectPath })
      return result
    } catch {
      return false
    }
  },

  setProject: async (projectPath: string) => {
    try {
      await invoke('agenthub_set_project', { projectPath })
      set({ currentProjectPath: projectPath })
      // 加载数据
      await get().loadTasks()
      await get().loadAgentRoles()
      await get().loadActiveAgents()
      await get().loadEvents()
      await get().loadBrain()
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  // ============================================================
  // 任务操作
  // ============================================================

  loadTasks: async () => {
    try {
      const tasks = await invoke<Task[]>('agenthub_load_tasks')
      set({ tasks })
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  createTask: async (task) => {
    try {
      const now = new Date().toISOString()
      const fullTask: Task = {
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: task.status || 'pending',
        priority: task.priority || 'medium',
        assignedAgent: task.assignedAgent || null,
        dependencies: task.dependencies || [],
        tags: task.tags || [],
        subtasks: task.subtasks || [],
        created: now,
        updated: null,
        startedAt: null,
        completedAt: null,
        result: null,
        error: null,
        retryCount: 0,
      }
      await invoke('agenthub_create_task', { task: fullTask })
      await get().loadTasks()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  updateTask: async (id: string, updates: TaskUpdate) => {
    try {
      await invoke('agenthub_update_task', { id, updates })
      await get().loadTasks()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  deleteTask: async (id: string) => {
    try {
      await invoke('agenthub_delete_task', { id })
      await get().loadTasks()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  // ============================================================
  // Agent 角色操作
  // ============================================================

  loadAgentRoles: async () => {
    try {
      const agentRoles = await invoke<AgentRole[]>('agenthub_load_agent_roles')
      set({ agentRoles })
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  saveAgentRole: async (role: AgentRole) => {
    try {
      await invoke('agenthub_save_agent_role', { role })
      await get().loadAgentRoles()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  deleteAgentRole: async (id: string) => {
    try {
      await invoke('agenthub_delete_agent_role', { id })
      await get().loadAgentRoles()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  // ============================================================
  // 活跃 Agent 操作
  // ============================================================

  loadActiveAgents: async () => {
    try {
      const activeAgents = await invoke<ActiveAgent[]>('agenthub_load_active_agents')
      set({ activeAgents })
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  updateAgentStatus: async (agentId: string, status: string, currentAction: string) => {
    try {
      await invoke('agenthub_update_agent_status', { agentId, status, currentAction })
      await get().loadActiveAgents()
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  // ============================================================
  // 大脑操作
  // ============================================================

  loadBrain: async () => {
    try {
      const brainMeta = await invoke<BrainMeta>('agenthub_load_brain_meta')
      set({ brainMeta })
    } catch {
      // brain meta 可能不存在，不设错误
      set({ brainMeta: null })
    }
  },

  loadBrainSection: async (section: string) => {
    try {
      const content = await invoke<string>('agenthub_load_brain_section', { section })
      set((state) => ({
        brainSections: { ...state.brainSections, [section]: content },
      }))
      return content
    } catch (e: any) {
      set({ error: String(e) })
      return ''
    }
  },

  updateBrainSection: async (section: string, content: string) => {
    try {
      await invoke('agenthub_update_brain_section', { section, content })
      set((state) => ({
        brainSections: { ...state.brainSections, [section]: content },
      }))
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  scanProject: async () => {
    const { currentProjectPath } = get()
    if (!currentProjectPath) {
      set({ error: '未设置项目路径' })
      return
    }
    try {
      set({ isLoading: true })
      const brainMeta = await invoke<BrainMeta>('agenthub_scan_project', {
        projectPath: currentProjectPath,
      })
      set({ brainMeta })
    } catch (e: any) {
      set({ error: String(e) })
    } finally {
      set({ isLoading: false })
    }
  },

  buildContext: async (taskId: string) => {
    try {
      const context = await invoke<string>('agenthub_build_context', { taskId })
      return context
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  // ============================================================
  // 事件
  // ============================================================

  loadEvents: async () => {
    try {
      const events = await invoke<HubEvent[]>('agenthub_load_events', { limit: 100 })
      set({ events })
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  // ============================================================
  // 任务执行
  // ============================================================

  runTask: async (taskId: string, agentRoleId?: string) => {
    try {
      const context = await invoke<string>('agenthub_run_task', {
        taskId,
        agentRoleId: agentRoleId || null,
      })
      await get().loadTasks()
      await get().loadActiveAgents()
      await get().loadEvents()
      return context
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  stopAgent: async (agentId: string) => {
    try {
      const sessionId = await invoke<string | null>('agenthub_stop_agent', { agentId })
      await get().loadTasks()
      await get().loadActiveAgents()
      await get().loadEvents()
      return sessionId
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  terminateTask: async (taskId: string, agentId: string, error: string) => {
    try {
      const sessionId = await invoke<string | null>('agenthub_terminate_task', {
        taskId,
        agentId,
        error,
      })
      await get().loadTasks()
      await get().loadActiveAgents()
      await get().loadEvents()
      return sessionId
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  completeTask: async (taskId: string, agentId: string, result: string) => {
    try {
      await invoke('agenthub_complete_task', { taskId, agentId, result })
      await get().loadTasks()
      await get().loadActiveAgents()
      await get().loadEvents()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  updateAgentSession: async (agentId: string, sessionId: string) => {
    try {
      await invoke('agenthub_update_agent_session', { agentId, sessionId })
      await get().loadActiveAgents()
    } catch (e: any) {
      set({ error: String(e) })
    }
  },
}))
