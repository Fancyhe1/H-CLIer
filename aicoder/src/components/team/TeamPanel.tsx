/**
 * Team 面板：Claude Team 模式可视化
 *
 * 布局：
 * ┌────────────────────────────────────────────┐
 * │ 会话选择（team 按会话隔离）                  │
 * ├──────────────┬─────────────────────────────┤
 * │ Agent 列表    │ 选中 Agent 的输出            │
 * │  ▸ api-dev   │   (AgentOutputView)         │
 * │  ▸ frontend  │                             │
 * └──────────────┴─────────────────────────────┘
 */
import React, { useEffect, useMemo, useRef } from 'react'
import {
  Alert,
  Badge,
  Button,
  Empty,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ReloadOutlined,
  RobotOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { useTeamStore } from '../../stores/teamStore'
import { useSessionStore } from '../../stores/sessionStore'
import AgentOutputView from './AgentOutputView'
import type { AgentInfo, AgentStatus } from '../../types/team'
import '../../styles/Team.css'

const { Text } = Typography

/** 状态 → 徽标颜色 */
const STATUS_COLOR: Record<AgentStatus, string> = {
  running: 'green',
  idle: 'default',
  completed: 'blue',
  unknown: 'red',
}

/** 状态 → 中文标签 */
const STATUS_LABEL: Record<AgentStatus, string> = {
  running: '工作中',
  idle: '空闲',
  completed: '已完成',
  unknown: '未知',
}

/** 单个 agent 列表项 */
const AgentListItem: React.FC<{
  agent: AgentInfo
  selected: boolean
  onClick: () => void
}> = ({ agent, selected, onClick }) => (
  <div
    onClick={onClick}
    style={{
      padding: '10px 12px',
      cursor: 'pointer',
      borderRadius: 6,
      marginBottom: 4,
      background: selected ? 'rgba(22,119,255,0.12)' : 'transparent',
      borderLeft: selected ? '3px solid #1677ff' : '3px solid transparent',
      transition: 'background 0.2s',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Badge
        color={STATUS_COLOR[agent.status]}
        status="processing"
        style={{ flexShrink: 0 }}
      />
      <Text strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agent.agentType}
      </Text>
      <Tag style={{ marginLeft: 'auto', fontSize: 11 }} color={STATUS_COLOR[agent.status]}>
        {STATUS_LABEL[agent.status]}
      </Tag>
    </div>
    {agent.description && (
      <Text
        type="secondary"
        style={{ fontSize: 12, display: 'block', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {agent.description}
      </Text>
    )}
  </div>
)

const TeamPanel: React.FC = () => {
  const {
    currentTeam,
    isLoading,
    error,
    currentSessionId,
    selectedAgentId,
    agentOutputs,
    openPanel,
    closePanel,
    selectSession,
    refresh,
    selectAgent,
  } = useTeamStore()
  const { sessions } = useSessionStore()

  // 打开面板时初始化：使用当前活动会话（仅 claude 类型且有 cliSessionId）
  useEffect(() => {
    const claudeSessions = sessions.filter(
      (s) => s.sessionType === 'claude' && s.cliSessionId
    )
    const activeId = useSessionStore.getState().activeSessionId
    const target =
      claudeSessions.find((s) => s.id === activeId) || claudeSessions[0]
    if (target) {
      openPanel(target)
    }
    return () => closePanel()
  }, [])

  // 当前选中的 agent
  const currentAgent = useMemo(
    () => currentTeam?.agents.find((a) => a.agentId === selectedAgentId),
    [currentTeam, selectedAgentId]
  )

  // 选中的输出（自动滚动到底部）
  const outputRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [agentOutputs[selectedAgentId ?? '']?.entries.length])

  // 会话下拉数据：claude 类型且有 cliSessionId 的会话
  const sessionOptions = useMemo(
    () =>
      sessions
        .filter((s) => s.sessionType === 'claude' && s.cliSessionId)
        .map((s) => {
          const folder =
            s.projectPath.split('\\').pop() || s.projectPath.split('/').pop() || s.projectPath
          return { session: s, folder }
        }),
    [sessions]
  )

  const handleSessionChange = (sessionId: string) => {
    const target = sessionOptions.find((o) => o.session.id === sessionId)?.session
    if (target) {
      selectSession(target)
    }
  }

  return (
    <div className="team-panel">
      {/* 顶部工具条：会话选择 */}
      <div className="team-toolbar">
        <Space>
          <TeamOutlined />
          <Text strong>Team - 多 Agent 协作监控</Text>
        </Space>
        <Space style={{ marginLeft: 'auto' }}>
          <Select
            size="small"
            style={{ width: 600 }}
            placeholder="选择会话"
            value={currentSessionId ?? undefined}
            onChange={handleSessionChange}
            showSearch
            optionFilterProp="label"
            popupMatchSelectWidth={false}
            listHeight={600}
            options={sessionOptions.map((o) => ({
              value: o.session.id,
              label: `${o.session.title || '未命名会话'} · ${o.folder}`,
            }))}
            optionRender={(opt) => {
              const s = sessionOptions.find((o) => o.session.id === opt.value)?.session
              if (!s) return null
              return (
                <div style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
                  <Text strong style={{ fontSize: 12 }}>{s.title || '未命名会话'}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{s.projectPath}</Text>
                </div>
              )
            }}
          />
          <Tooltip title="刷新">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => refresh()} />
          </Tooltip>
        </Space>
      </div>

      {error && <Alert type="error" message={error} closable style={{ margin: 12 }} />}

      {/* 没有团队时的空状态 */}
      {!isLoading && !currentTeam && (
        <Empty
          style={{ marginTop: 100 }}
          image={<RobotOutlined style={{ fontSize: 56, opacity: 0.25 }} />}
          description={
            <Text type="secondary">
              该会话未检测到 Team。在 Claude Code 中创建团队后，点击刷新即可看到 teammates。
            </Text>
          }
        />
      )}

      {/* 主体：左右分栏 */}
      {currentTeam && (
        <div className="team-body">
          {/* 左侧：agent 列表 */}
          <div className="team-agents">
            {currentTeam.agents.map((agent) => (
              <AgentListItem
                key={agent.agentId}
                agent={agent}
                selected={agent.agentId === selectedAgentId}
                onClick={() => selectAgent(agent.agentId)}
              />
            ))}
          </div>

          {/* 右侧：输出 */}
          <div className="team-output">
            <div className="team-output-header">
              {currentAgent ? (
                <Space>
                  <Badge color={STATUS_COLOR[currentAgent.status]} status="processing" />
                  <Text strong>{currentAgent.agentType}</Text>
                  {currentAgent.description && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {currentAgent.description}
                    </Text>
                  )}
                  <Tag color={STATUS_COLOR[currentAgent.status]}>
                    {STATUS_LABEL[currentAgent.status]}
                  </Tag>
                </Space>
              ) : (
                <Text type="secondary">选择一个 agent 查看输出</Text>
              )}
              {currentAgent && (
                <Space style={{ marginLeft: 'auto' }} size="small">
                  <Tooltip title="已读取行数 / 总行数">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ThunderboltOutlined />{' '}
                      {agentOutputs[currentAgent.agentId]?.linesConsumed ?? 0} /{' '}
                      {agentOutputs[currentAgent.agentId]?.totalLines ?? 0} 行
                    </Text>
                  </Tooltip>
                  {currentAgent.status === 'completed' && (
                    <Tag color="blue" icon={<CheckCircleOutlined />}>
                      任务完成
                    </Tag>
                  )}
                </Space>
              )}
            </div>
            <div ref={outputRef} className="team-output-body">
              {currentAgent && (
                <AgentOutputView
                  entries={agentOutputs[currentAgent.agentId]?.entries ?? []}
                />
              )}
              {currentAgent && currentAgent.status === 'idle' && (
                <div className="team-output-idle">
                  <ClockCircleOutlined style={{ marginRight: 6 }} />
                  空闲中
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamPanel
