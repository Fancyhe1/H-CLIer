import React, { useEffect, useRef } from 'react'
import { Card, Tag, Timeline, Empty, Typography, Button, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { listen } from '@tauri-apps/api/event'
import { useAgentHubStore, type ActiveAgent, type AgentRole, type HubEvent } from '../../stores/agentHubStore'
import { useSessionStore } from '../../stores/sessionStore'

const { Text } = Typography

// Agent 节点组件（带动画）
const AgentNode: React.FC<{
  agent: ActiveAgent
  role?: AgentRole
  onStop?: (agentId: string) => void
}> = ({ agent, role, onStop }) => {
  const statusConfig: Record<string, { color: string; antdColor: string; label: string; pulse: boolean }> = {
    running: { color: '#3b82f6', antdColor: 'processing', label: '运行中', pulse: true },
    ready: { color: '#a855f7', antdColor: 'purple', label: '就绪', pulse: false },
    done: { color: '#22c55e', antdColor: 'success', label: '已完成', pulse: false },
    failed: { color: '#ef4444', antdColor: 'error', label: '失败', pulse: false },
    idle: { color: '#6b7280', antdColor: 'default', label: '空闲', pulse: false },
  }

  const config = statusConfig[agent.status] || statusConfig.idle

  return (
    <div className={`agent-node agent-node-${agent.status}`}>
      <div
        className="agent-node-indicator"
        style={{ backgroundColor: config.color }}
      >
        {config.pulse && <div className="agent-pulse" />}
      </div>
      <div className="agent-node-info">
        <Text strong>{role?.name || agent.role}</Text>
        <Text type="secondary" className="agent-node-id">
          {agent.agentId}
        </Text>
      </div>
      <Tag
        color={config.antdColor}
        className="agent-node-status"
      >
        {config.label}
      </Tag>
      {agent.taskId && (
        <Tag color="blue" className="agent-node-task">
          {agent.taskId}
        </Tag>
      )}
      {agent.currentAction && (
        <Text className="agent-node-action" ellipsis>
          {agent.currentAction}
        </Text>
      )}
      {(agent.status === 'running' || agent.status === 'ready') && onStop && (
        <Button
          size="small"
          danger
          style={{ marginTop: 6, fontSize: 11 }}
          onClick={() => onStop(agent.agentId)}
        >
          停止
        </Button>
      )}
    </div>
  )
}

// 拓扑图组件
const AgentTopology: React.FC<{
  agents: ActiveAgent[]
  roles: AgentRole[]
}> = ({ agents, roles }) => {
  return (
    <div className="agent-topology">
      {/* Boss 节点 */}
      <div className="topology-boss">
        <div className="boss-node">
          <span className="boss-icon">👑</span>
          <Text strong>用户</Text>
        </div>
      </div>

      {/* 连接线 */}
      <div className="topology-connections">
        {agents.map((agent, i) => (
          <div
            key={agent.agentId}
            className="topology-connection"
            style={{ '--index': i, '--total': agents.length } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Agent 节点 */}
      <div className="topology-agents">
        {agents.map((agent) => {
          const role = roles.find((r) => r.id === agent.role)
          return <AgentNode key={agent.agentId} agent={agent} role={role} />
        })}
        {agents.length === 0 && (
          <Empty description="暂无活跃Agent" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  )
}

// 活动流组件
const EventStream: React.FC<{ events: HubEvent[] }> = ({ events }) => {
  const streamRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = 0
    }
  }, [events.length])

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'task_started':
        return { color: 'blue', icon: '🔵' }
      case 'task_progress':
        return { color: 'blue', icon: '📝' }
      case 'task_completed':
        return { color: 'green', icon: '✅' }
      case 'task_failed':
        return { color: 'red', icon: '❌' }
      case 'task_created':
        return { color: 'cyan', icon: '📋' }
      case 'task_deleted':
        return { color: 'gray', icon: '🗑️' }
      case 'agent_started':
        return { color: 'cyan', icon: '🤖' }
      case 'agent_stopped':
        return { color: 'gray', icon: '⏹️' }
      default:
        return { color: 'blue', icon: '🔵' }
    }
  }

  return (
    <div className="event-stream" ref={streamRef}>
      {events.length === 0 ? (
        <Empty description="暂无事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Timeline
          items={events.slice(0, 50).map((event) => {
            const { color, icon } = getEventIcon(event.type)
            return {
              color,
              children: (
                <div className="event-item">
                  <Text type="secondary" className="event-time">
                    {new Date(event.ts).toLocaleTimeString()}
                  </Text>
                  <Text className="event-message">
                    {icon} {event.message || event.type}
                  </Text>
                  {event.agent && <Tag className="event-agent">{event.agent}</Tag>}
                </div>
              ),
            }
          })}
        />
      )}
    </div>
  )
}

// 主监控面板
const AgentMonitor: React.FC = () => {
  const {
    activeAgents,
    agentRoles,
    events,
    loadActiveAgents,
    loadEvents,
    terminateTask,
    isLoading,
  } = useAgentHubStore()
  useSessionStore() // 确保 store 已加载

  // 检查活跃 Agent 的会话是否还存在
  const checkSessionAlive = async () => {
    const currentAgents = useAgentHubStore.getState().activeAgents
    const currentSessions = useSessionStore.getState().sessions
    const sessionIds = new Set(currentSessions.map(s => s.id))

    for (const agent of currentAgents) {
      if (agent.sessionId && !sessionIds.has(agent.sessionId)) {
        try {
          await terminateTask(agent.taskId, agent.agentId, '会话已被删除')
          message.warning(`任务 ${agent.taskId} 的会话已删除，已标记为失败`)
        } catch (e) {
          console.error('终止任务失败:', e)
        }
      }
    }
  }

  // 监听 Claude Stop hook，自动完成任务
  useEffect(() => {
    const unlisten = listen('claude-hook-notification', (event) => {
      const payload = event.payload as {
        hook_event_name?: string
        session_id?: string
      }

      if (payload.hook_event_name === 'Stop' && payload.session_id) {
        // 查找关联此会话的活跃 Agent
        const agents = useAgentHubStore.getState().activeAgents
        const agent = agents.find(a => a.sessionId === payload.session_id)
        if (agent) {
          // Claude 完成一轮对话，任务进入就绪状态
          useAgentHubStore.getState().updateTask(
            agent.taskId,
            { status: 'ready' }
          ).then(() => {
            message.info(`任务 ${agent.taskId} 已就绪，等待下一轮指令`)
          }).catch(e => {
            console.error('更新任务状态失败:', e)
          })
        }
      }
    })

    return () => { unlisten.then(fn => fn()) }
  }, [])

  // 监听 AgentHub 状态变更事件
  useEffect(() => {
    const unlisten = listen('agenthub-update', () => {
      loadActiveAgents()
      loadEvents()
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  useEffect(() => {
    loadActiveAgents()
    loadEvents()

    // 定时刷新 + 会话存活检查
    const interval = setInterval(() => {
      loadActiveAgents()
      loadEvents()
      checkSessionAlive()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="agent-monitor">
      <Card
        title="🤖 Agent 拓扑"
        className="monitor-topology-card"
        extra={
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={() => {
              loadActiveAgents()
              loadEvents()
            }}
            loading={isLoading}
          >
            刷新
          </Button>
        }
      >
        <AgentTopology agents={activeAgents} roles={agentRoles} />
      </Card>

      <Card title="📋 活动日志" className="monitor-events-card">
        <EventStream events={events} />
      </Card>
    </div>
  )
}

export default AgentMonitor
