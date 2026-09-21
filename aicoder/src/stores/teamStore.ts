/**
 * Team 模式可视化状态管理
 *
 * 设计要点：
 * - 按会话隔离：team 属于某个 Claude 会话（one team per session），
 *   通过 cliSessionId 精确定位，不做项目级扫描
 * - 懒加载：用户打开面板时才初始化（openPanel），关闭时停止轮询（closePanel）
 * - 轮询：面板打开期间每 2 秒调用 team_scan_session 更新状态
 * - 增量读取：每个 agent 记录已读行号（agentReadLines），轮询时只读新增行
 * - 初始加载：选中 agent 时加载尾部窗口（最近 500 行）
 */
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { TeamInfo, AgentOutput } from '../types/team'
import type { Session } from '../types/session'

/** 状态轮询间隔（毫秒） */
const POLL_INTERVAL = 2000
/** 初始加载的尾部窗口大小（行） */
const INITIAL_WINDOW = 500
/** 每次增量读取的最大行数 */
const INCREMENT_CHUNK = 50

interface TeamStore {
  // ---- 状态 ----
  /** 当前选中会话对应的团队（null = 该会话没有 team） */
  currentTeam: TeamInfo | null
  isLoading: boolean
  error: string | null
  isPanelOpen: boolean
  /** 当前选中的 H CLIer 会话（用于下拉框显示） */
  currentSessionId: string | null
  /** 当前选中的 Claude CLI 会话 ID（用于后端定位） */
  currentCliSessionId: string | null
  selectedAgentId: string | null
  /** agentId -> 输出（已加载的部分） */
  agentOutputs: Record<string, AgentOutput>
  /** agentId -> 已读行号（增量读取的 offset） */
  agentReadLines: Record<string, number>

  // ---- 动作 ----
  /** 内部：加载指定会话的团队 */
  loadTeamForSession: (session: Session) => Promise<void>
  /** 打开面板：初始化当前会话的 team + 启动轮询 */
  openPanel: (session: Session) => Promise<void>
  /** 切换会话：重新扫描该会话的 team */
  selectSession: (session: Session) => Promise<void>
  /** 关闭面板：停止轮询，保留已加载数据 */
  closePanel: () => void
  /** 轮询刷新：更新当前会话的团队状态 */
  refresh: () => Promise<void>
  /** 选中 agent：初始加载尾部窗口 */
  selectAgent: (agentId: string) => Promise<void>
  /** 增量读取选中 agent 的新输出（轮询时调用） */
  loadNewOutput: (agentId: string) => Promise<void>
}

/** 轮询定时器（模块级，避免重复创建） */
let pollTimer: number | null = null

export const useTeamStore = create<TeamStore>((set, get) => ({
  currentTeam: null,
  isLoading: false,
  error: null,
  isPanelOpen: false,
  currentSessionId: null,
  currentCliSessionId: null,
  selectedAgentId: null,
  agentOutputs: {},
  agentReadLines: {},

  /** 加载指定会话的团队 */
  loadTeamForSession: async (session: Session) => {
    const cliSessionId = session.cliSessionId
    if (!cliSessionId) return
    set({
      isLoading: true,
      error: null,
      currentSessionId: session.id,
      currentCliSessionId: cliSessionId,
      selectedAgentId: null,
    })
    try {
      const team = await invoke<TeamInfo>('team_scan_session', {
        cliSessionId,
        projectPath: session.projectPath,
      })
      set({ currentTeam: team })
    } catch (e) {
      // 该会话没有 team（或已被清理）
      set({ currentTeam: null, error: String(e) })
    } finally {
      set({ isLoading: false })
    }
  },

  openPanel: async (session) => {
    // 清理旧的轮询，防止重复打开
    if (pollTimer) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
    set({ isPanelOpen: true })
    await get().loadTeamForSession(session)

    // 启动轮询：刷新状态 + 增量读取选中 agent 的新输出
    pollTimer = window.setInterval(() => {
      get().refresh()
      const { selectedAgentId } = get()
      if (selectedAgentId) {
        get().loadNewOutput(selectedAgentId)
      }
    }, POLL_INTERVAL)
  },

  selectSession: async (session) => {
    await get().loadTeamForSession(session)
  },

  closePanel: () => {
    if (pollTimer) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
    set({ isPanelOpen: false })
  },

  refresh: async () => {
    const { currentCliSessionId, currentTeam } = get()
    if (!currentCliSessionId || !currentTeam) return
    const projectPath = currentTeam.projectPath
    try {
      const team = await invoke<TeamInfo>('team_scan_session', {
        cliSessionId: currentCliSessionId,
        projectPath,
      })
      set({ currentTeam: team })
    } catch {
      // 会话结束、团队被清理 → 静默显示空状态
      set({ currentTeam: null })
    }
  },

  selectAgent: async (agentId) => {
    set({ selectedAgentId: agentId })
    const agent = get().currentTeam?.agents.find((a) => a.agentId === agentId)
    if (!agent) return

    try {
      // 先查总行数，再加载尾部窗口（最新内容）
      const probe = await invoke<AgentOutput>('team_get_agent_output', {
        jsonlPath: agent.jsonlPath,
        offset: 0,
        limit: 1,
      })
      const total = probe.totalLines
      const start = total > INITIAL_WINDOW ? total - INITIAL_WINDOW : 0

      const output = await invoke<AgentOutput>('team_get_agent_output', {
        jsonlPath: agent.jsonlPath,
        offset: start,
        limit: INITIAL_WINDOW,
      })
      set((state) => ({
        agentOutputs: { ...state.agentOutputs, [agentId]: output },
        agentReadLines: { ...state.agentReadLines, [agentId]: output.linesConsumed },
      }))
    } catch (e) {
      set({ error: String(e) })
    }
  },

  loadNewOutput: async (agentId) => {
    const { agentReadLines, agentOutputs, currentTeam } = get()
    const offset = agentReadLines[agentId] ?? 0
    const agent = currentTeam?.agents.find((a) => a.agentId === agentId)
    if (!agent) return

    try {
      const output = await invoke<AgentOutput>('team_get_agent_output', {
        jsonlPath: agent.jsonlPath,
        offset,
        limit: INCREMENT_CHUNK,
      })
      if (output.entries.length > 0 || output.linesConsumed > offset) {
        const prev = agentOutputs[agentId]
        set((state) => ({
          agentOutputs: {
            ...state.agentOutputs,
            [agentId]: {
              entries: prev ? [...prev.entries, ...output.entries] : output.entries,
              hasMore: output.hasMore,
              totalLines: output.totalLines,
              linesConsumed: output.linesConsumed,
            },
          },
          agentReadLines: { ...state.agentReadLines, [agentId]: output.linesConsumed },
        }))
      }
    } catch {
      // 静默失败：不打断轮询
    }
  },
}))
