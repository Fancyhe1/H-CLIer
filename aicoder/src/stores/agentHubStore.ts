import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { message } from 'antd'
import { useSessionStore } from './sessionStore'

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
  id?: string  // 兼容旧数据，新数据用 name 作为标识
  name: string
  description: string
  prompt: string
  model: string
  tags: string[]
}

export interface ClaudeCodeAgent {
  name: string
  description: string
  prompt: string
  tools: string[]
  source: string
}

export interface ActiveAgent {
  agentId: string
  role: string
  taskId: string
  sessionId: string | null
  startedAt: string
  lastHeartbeat: string
  status: 'running' | 'ready' | 'done' | 'failed' | 'idle'
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

export interface AnalysisManifest {
  lastAnalysis: string
  scope: string[]
  fileHashes: Record<string, string>
}

export interface Message {
  id: string
  from: string
  to: string
  taskId?: string
  action: string
  content: string
  context?: Record<string, any>
  ts: string
  read: boolean
}

export interface WorkflowNode {
  id: string
  role: string
  taskTemplate: string
  description: string
  autoStart: boolean
}

export interface WorkflowEdge {
  from: string
  to: string
  action: string
  condition: string
  description: string
}

export interface Workflow {
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: Record<string, string>
  created: string
  updated: string | null
}

export type AgentHubSubPanel = 'tasks' | 'brain' | 'monitor' | 'messages' | 'workflows' | 'settings'

// ============================================================
// Store 定义
// ============================================================

interface AgentHubStore {
  // 状态
  tasks: Task[]
  agentRoles: AgentRole[]
  claudeCodeAgents: ClaudeCodeAgent[]
  activeAgents: ActiveAgent[]
  events: HubEvent[]
  messages: Message[]
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
  loadClaudeCodeAgents: () => Promise<void>

  // 活跃 Agent 操作
  loadActiveAgents: () => Promise<void>
  updateAgentStatus: (agentId: string, status: string, currentAction: string) => Promise<void>

  // 大脑操作
  loadBrain: () => Promise<void>
  loadBrainSection: (section: string) => Promise<string>
  updateBrainSection: (section: string, content: string) => Promise<void>
  scanProject: () => Promise<void>
  buildContext: (taskId: string) => Promise<string>
  buildContextWithPaths: (taskId: string, agentRoleId?: string, brainSections?: string[]) => Promise<string>
  getBrainSectionContent: (section: string) => Promise<string>
  generateClaudeMd: () => Promise<string>
  syncClaudeMd: () => Promise<string>

  // AI 分析
  collectRawData: (projectPath: string, scope: string[]) => Promise<string>
  buildAnalysisPrompt: (projectPath: string, scope: string[], mode: string, rawData: string) => Promise<string>
  saveAnalysisManifest: (scope: string[], fileHashes: Record<string, string>) => Promise<void>
  loadAnalysisManifest: () => Promise<AnalysisManifest | null>
  scanProjectHashes: (projectPath: string) => Promise<Record<string, string>>

  // 事件
  loadEvents: () => Promise<void>

  // 任务执行
  runTask: (taskId: string, agentRoleId?: string, brainSections?: string[]) => Promise<string>
  stopAgent: (agentId: string) => Promise<string | null>
  terminateTask: (taskId: string, agentId: string, error: string) => Promise<string | null>
  completeTask: (taskId: string, agentId: string, result: string) => Promise<void>
  updateAgentSession: (agentId: string, sessionId: string) => Promise<void>

  // 消息通信
  loadMessages: (agentId?: string) => Promise<void>
  sendMessage: (from: string, to: string, action: string, content: string, taskId?: string) => Promise<void>
  markMessageRead: (messageId: string) => Promise<void>

  // 工作流
  workflows: Workflow[]
  loadWorkflows: () => Promise<void>
  saveWorkflow: (workflow: Workflow) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  createTasksFromWorkflow: (workflowId: string, variables: Record<string, string>) => Promise<Task[]>
  startWorkflow: (workflowId: string, variables: Record<string, string>) => Promise<Task[]>
  handleTaskCompleted: (taskId: string) => Promise<string | null>
}

export const useAgentHubStore = create<AgentHubStore>((set, get) => ({
  // 初始状态
  tasks: [],
  agentRoles: [],
  claudeCodeAgents: [],
  activeAgents: [],
  messages: [],
  workflows: [],
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
      const err = String(e)
      if (err.includes('AGENTHUB_DIR_DELETED')) {
        set({ isInitialized: false, tasks: [], activeAgents: [], events: [], brainMeta: null })
      } else {
        set({ error: err })
      }
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
      await get().loadActiveAgents()

      // 如果任务状态变为 done，触发工作流路由
      if (updates.status === 'done') {
        const nextTaskId = await get().handleTaskCompleted(id)
        if (nextTaskId) {
          message.info(`工作流自动启动下一个任务: ${nextTaskId}`)
        }
      }
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  deleteTask: async (id: string) => {
    try {
      await invoke('agenthub_delete_task', { id })
      await get().loadTasks()
      await get().loadActiveAgents()
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
      if (String(e).includes('AGENTHUB_DIR_DELETED')) {
        set({ isInitialized: false, agentRoles: [] })
      } else {
        set({ error: String(e) })
      }
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

  loadClaudeCodeAgents: async () => {
    try {
      const agents = await invoke<ClaudeCodeAgent[]>('agenthub_load_claude_code_agents')
      set({ claudeCodeAgents: agents })
    } catch (e: any) {
      set({ error: String(e) })
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
      if (String(e).includes('AGENTHUB_DIR_DELETED')) {
        set({ isInitialized: false, activeAgents: [] })
      } else {
        set({ error: String(e) })
      }
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

  buildContextWithPaths: async (taskId: string, agentRoleId?: string, brainSections?: string[]) => {
    try {
      const context = await invoke<string>('agenthub_build_context_with_paths', {
        taskId,
        agentRoleId: agentRoleId || null,
        brainSections: brainSections && brainSections.length > 0 ? brainSections : null,
      })
      return context
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  getBrainSectionContent: async (section: string) => {
    try {
      const content = await invoke<string>('agenthub_get_brain_section_content', { section })
      return content
    } catch (e: any) {
      set({ error: String(e) })
      return ''
    }
  },

  generateClaudeMd: async () => {
    try {
      const content = await invoke<string>('agenthub_generate_claude_md')
      return content
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  syncClaudeMd: async () => {
    try {
      const content = await invoke<string>('agenthub_sync_claude_md')
      return content
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  // ============================================================
  // AI 分析
  // ============================================================

  collectRawData: async (projectPath: string, scope: string[]) => {
    try {
      const data = await invoke<string>('agenthub_collect_raw_data', { projectPath, scope })
      return data
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  buildAnalysisPrompt: async (projectPath: string, scope: string[], mode: string, rawData: string) => {
    try {
      const prompt = await invoke<string>('agenthub_build_analysis_prompt', {
        projectPath,
        scope,
        mode,
        rawData,
      })
      return prompt
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  saveAnalysisManifest: async (scope: string[], fileHashes: Record<string, string>) => {
    try {
      await invoke('agenthub_save_analysis_manifest', { scope, fileHashes })
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  loadAnalysisManifest: async () => {
    try {
      const manifest = await invoke<AnalysisManifest | null>('agenthub_load_analysis_manifest')
      return manifest
    } catch (e: any) {
      set({ error: String(e) })
      return null
    }
  },

  scanProjectHashes: async (projectPath: string) => {
    try {
      const hashes = await invoke<Record<string, string>>('agenthub_scan_project_hashes', { projectPath })
      return hashes
    } catch (e: any) {
      set({ error: String(e) })
      return {}
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
      if (String(e).includes('AGENTHUB_DIR_DELETED')) {
        set({ isInitialized: false, events: [] })
      } else {
        set({ error: String(e) })
      }
    }
  },

  // ============================================================
  // 任务执行
  // ============================================================

  runTask: async (taskId: string, agentRoleId?: string, brainSections?: string[]) => {
    try {
      const context = await invoke<string>('agenthub_run_task', {
        taskId,
        agentRoleId: agentRoleId || null,
        brainSections: brainSections && brainSections.length > 0 ? brainSections : null,
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

  // ============================================================
  // 消息通信
  // ============================================================

  loadMessages: async (agentId?: string) => {
    try {
      const messages = await invoke<Message[]>('agenthub_get_messages', {
        agentId: agentId || null,
        limit: 50,
      })
      set({ messages })
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  sendMessage: async (from: string, to: string, action: string, content: string, taskId?: string) => {
    try {
      await invoke('agenthub_send_message', {
        from,
        to,
        action,
        content,
        taskId: taskId || null,
        context: null,
      })
      await get().loadMessages()
      await get().loadEvents()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  markMessageRead: async (messageId: string) => {
    try {
      await invoke('agenthub_mark_message_read', { messageId })
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, read: true } : m
        ),
      }))
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  // ============================================================
  // 工作流
  // ============================================================

  loadWorkflows: async () => {
    try {
      const workflows = await invoke<Workflow[]>('agenthub_load_workflows')
      set({ workflows })
    } catch (e: any) {
      set({ error: String(e) })
    }
  },

  saveWorkflow: async (workflow: Workflow) => {
    try {
      await invoke('agenthub_save_workflow', { workflow })
      await get().loadWorkflows()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  deleteWorkflow: async (id: string) => {
    try {
      await invoke('agenthub_delete_workflow', { id })
      await get().loadWorkflows()
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  createTasksFromWorkflow: async (workflowId: string, variables: Record<string, string>) => {
    try {
      const tasks = await invoke<Task[]>('agenthub_create_tasks_from_workflow', {
        workflowId,
        variables,
      })
      await get().loadTasks()
      return tasks
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  startWorkflow: async (workflowId: string, variables: Record<string, string>) => {
    try {
      const tasks = await invoke<Task[]>('agenthub_start_workflow', {
        workflowId,
        variables,
      })
      await get().loadTasks()
      await get().loadActiveAgents()
      await get().loadEvents()
      return tasks
    } catch (e: any) {
      set({ error: String(e) })
      throw e
    }
  },

  handleTaskCompleted: async (taskId: string) => {
    try {
      const nextTaskId = await invoke<string | null>('agenthub_handle_task_completed', { taskId })
      await get().loadTasks()
      await get().loadActiveAgents()
      await get().loadEvents()

      // 如果有下一个任务，自动创建会话
      if (nextTaskId) {
        const tasks = get().tasks
        const nextTask = tasks.find(t => t.id === nextTaskId)
        if (nextTask && nextTask.status === 'ready') {
          // 延迟一下等待数据刷新
          setTimeout(async () => {
            try {
              const { currentProjectPath } = get()
              const { fetchSessions, setActiveSession } = useSessionStore.getState()

              const projectPath = currentProjectPath || ''
              if (!projectPath) return

              // 构建上下文
              const context = await invoke<string>('agenthub_build_context', {
                taskId: nextTaskId,
                agentRoleId: nextTask.assignedAgent || null,
                brainSections: null,
              })

              // 创建会话
              const session = await invoke<{ id: string; title: string }>('create_session', {
                projectPath,
                title: `Workflow: ${nextTask.title}`,
                sessionType: 'claude',
              })

              // 更新 agent 的 sessionId
              const { activeAgents, updateAgentSession } = get()
              const agent = activeAgents.find(a => a.taskId === nextTaskId)
              if (agent) {
                await updateAgentSession(agent.agentId, session.id)
              }

              await fetchSessions()
              setActiveSession(session.id)

              // 存储上下文
              sessionStorage.setItem(`agenthub-context-${session.id}`, context)
              if (nextTask.assignedAgent) {
                sessionStorage.setItem(`agenthub-agent-${session.id}`, nextTask.assignedAgent)
              }

              message.info(`工作流自动启动任务: ${nextTask.title}`)
            } catch (e) {
              console.error('自动创建会话失败:', e)
            }
          }, 1000)
        }
      }

      return nextTaskId
    } catch (e: any) {
      set({ error: String(e) })
      return null
    }
  },
}))
