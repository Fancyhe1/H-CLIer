import React, { useEffect, useRef } from 'react'
import { Card, Tag, Timeline, Empty, Typography, Button, Popconfirm, message } from 'antd'
import { ReloadOutlined, StopOutlined } from '@ant-design/icons'
import { listen } from '@tauri-apps/api/event'
import { useAgentHubStore, type ActiveAgent, type AgentRole, type HubEvent } from '../../stores/agentHubStore'

const { Text } = Typography

// Agent 节点组件（带动画）
const AgentNode: React.FC<{
  agent: ActiveAgent
  role?: AgentRole
  onStop?: (agentId: string) => void
}> = ({ agent, role, onStop }) => {
  const statusColors: Record<string, string> = {
    running: '#52c41a',
    idle: '#8c8c8c',
    failed: '#ff4d4f',
  }

  return (
    <div className={`agent-node agent-node-${agent.status}`}>
      <div
        className="agent-node-indicator"
        style={{ backgroundColor: statusColors[agent.status] || '#8c8c8c' }}
      >
        {agent.status === 'running' && <div className="agent-pulse" />}
      </div>
      <div className="agent-node-info">
        <Text strong>{role?.name || agent.role}</Text>
        <Text type="secondary" className="agent-node-id">
          {agent.agentId}
        </Text>
      </div>
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
      {agent.status === 'running' && onStop && (
        <Popconfirm
          title="确定停止此 Agent？"
          onConfirm={() => onStop(agent.agentId)}
          okText="停止"
          cancelText="取消"
        >
          <Button
            size="small"
            danger
            icon={<StopOutlined />}
            className="agent-node-stop"
          >
            停止
          </Button>
        </Popconfirm>
      )}
    </div>
  )
}

// 拓扑图组件
const AgentTopology: React.FC<{
  agents: ActiveAgent[]
  roles: AgentRole[]
  onStop?: (agentId: string) => void
}> = ({ agents, roles, onStop }) => {
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
          return <AgentNode key={agent.agentId} agent={agent} role={role} onStop={onStop} />
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
    stopAgent,
    isLoading,
  } = useAgentHubStore()

  useEffect(() => {
    loadActiveAgents()
    loadEvents()

    // 监听 Tauri 事件（后端推送的状态变更）
    const unlisten = listen('agenthub-update', () => {
      loadActiveAgents()
      loadEvents()
    })

    // 保留低频轮询作为兜底（心跳超时检测等）
    const interval = setInterval(() => {
      loadActiveAgents()
      loadEvents()
    }, 30000)

    return () => {
      unlisten.then(fn => fn())
      clearInterval(interval)
    }
  }, [])

  const handleStopAgent = async (agentId: string) => {
    try {
      await stopAgent(agentId)
      message.success(`Agent ${agentId} 已停止`)
    } catch (e: any) {
      message.error(`停止失败: ${e}`)
    }
  }

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
        <AgentTopology agents={activeAgents} roles={agentRoles} onStop={handleStopAgent} />
      </Card>

      <Card title="📋 活动日志" className="monitor-events-card">
        <EventStream events={events} />
      </Card>
    </div>
  )
}

export default AgentMonitor
