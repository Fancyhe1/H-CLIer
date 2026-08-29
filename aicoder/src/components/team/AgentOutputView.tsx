/**
 * Agent 输出面板：渲染 AgentEntry 列表
 *
 * 保持 JSONL 原始顺序渲染（thinking → text → tool_use → tool_result），
 * 各类型渲染方式：
 * - user        → 用户消息块（灰色背景，Markdown）
 * - text        → Markdown 渲染
 * - thinking    → 折叠的思考块（可展开，默认折叠）
 * - tool_use    → 工具调用块（蓝色边框，JSON 输入可折叠）
 * - tool_result → 工具结果块（绿色边框，可折叠）
 */
import React from 'react'
import { Collapse, Empty, Spin, Typography } from 'antd'
import {
  UserOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import type { AgentEntry } from '../../types/team'

const { Text } = Typography

interface Props {
  entries: AgentEntry[]
  isLoading?: boolean
}

/** 单个折叠块的 header 内容 */
const collapseLabel = (entry: AgentEntry): React.ReactNode => {
  const time =
    entry.timestamp && (
      <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
        {new Date(entry.timestamp).toLocaleTimeString()}
      </Text>
    )
  switch (entry.entryType) {
    case 'thinking':
      return (
        <span style={{ fontSize: 12, opacity: 0.85 }}>
          <BulbOutlined style={{ marginRight: 6, color: '#faad14' }} />
          思考
          {time}
        </span>
      )
    case 'tool_use':
      return (
        <span style={{ fontSize: 12, opacity: 0.85 }}>
          <ToolOutlined style={{ marginRight: 6, color: '#1677ff' }} />
          工具调用：{entry.toolName}
          {time}
        </span>
      )
    case 'tool_result':
      return (
        <span style={{ fontSize: 12, opacity: 0.85 }}>
          <CheckCircleOutlined style={{ marginRight: 6, color: '#52c41a' }} />
          工具结果
          {time}
        </span>
      )
    default:
      return null
  }
}

/** 折叠内容样式 */
const collapseContent = (entry: AgentEntry) => (
  <pre
    style={{
      margin: 0,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontFamily: 'inherit',
      fontSize: 12,
      lineHeight: 1.6,
      maxHeight: 300,
      overflowY: 'auto',
    }}
  >
    {entry.content}
  </pre>
)

/** 单条目渲染：保持顺序，按类型渲染不同样式 */
const EntryBlock: React.FC<{ entry: AgentEntry }> = ({ entry }) => {
  switch (entry.entryType) {
    case 'user':
      return (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'rgba(128,128,128,0.08)',
            borderRadius: 6,
            borderLeft: '3px solid rgba(128,128,128,0.4)',
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <UserOutlined style={{ fontSize: 12, opacity: 0.6, marginRight: 6 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              任务/消息
              {entry.timestamp && ` · ${new Date(entry.timestamp).toLocaleTimeString()}`}
            </Text>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            <ReactMarkdown>{entry.content}</ReactMarkdown>
          </div>
        </div>
      )
    case 'text':
      return (
        <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
          <ReactMarkdown>{entry.content}</ReactMarkdown>
        </div>
      )
    case 'thinking':
    case 'tool_use':
    case 'tool_result':
      return (
        <div style={{ marginBottom: 12 }}>
          <Collapse
            size="small"
            bordered={false}
            defaultActiveKey={entry.entryType === 'tool_result' ? ['0'] : []}
            items={[
              {
                key: '0',
                label: collapseLabel(entry),
                children: collapseContent(entry),
              },
            ]}
            style={{
              background: 'rgba(128,128,128,0.04)',
              borderRadius: 6,
              borderLeft: `3px solid ${
                entry.entryType === 'tool_use'
                  ? '#1677ff'
                  : entry.entryType === 'tool_result'
                    ? '#52c41a'
                    : '#faad14'
              }`,
            }}
            styles={{
              header: { padding: '6px 8px', fontSize: 12 },
              body: { padding: '8px 8px 8px 12px' },
            }}
          />
        </div>
      )
    default:
      return null
  }
}

/** 输出面板主体 */
const AgentOutputView: React.FC<Props> = ({ entries, isLoading }) => {
  // 空状态 + 加载状态
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <Empty
        description="暂无输出"
        style={{ marginTop: 80 }}
        image={<EyeOutlined style={{ fontSize: 48, opacity: 0.3 }} />}
      />
    )
  }

  // 保持原始顺序渲染（JSONL 时间顺序）
  return (
    <div style={{ padding: 12 }}>
      {entries.map((entry, idx) => (
        <EntryBlock key={`${idx}-${entry.entryType}-${entry.timestamp ?? ''}`} entry={entry} />
      ))}
    </div>
  )
}

export default AgentOutputView
