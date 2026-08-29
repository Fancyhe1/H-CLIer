import React, { useEffect, useState, useRef } from 'react'
import { Card, List, Tag, Button, Space, Input, Select, Typography, Empty, Badge, message as antMsg } from 'antd'
import { SendOutlined, ReloadOutlined, MailOutlined } from '@ant-design/icons'
import { useAgentHubStore, type Message } from '../../stores/agentHubStore'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const actionColors: Record<string, string> = {
  delegate: 'blue',
  review: 'purple',
  help: 'orange',
  handoff: 'cyan',
  notify: 'default',
  decision: 'red',
}

const actionLabels: Record<string, string> = {
  delegate: '委派',
  review: '审查',
  help: '求助',
  handoff: '交接',
  notify: '通知',
  decision: '决策',
}

const MessagePanel: React.FC = () => {
  const {
    messages,
    agentRoles,
    activeAgents,
    loadMessages,
    loadAgentRoles,
    loadActiveAgents,
    sendMessage,
    markMessageRead,
  } = useAgentHubStore()

  const [sendTo, setSendTo] = useState('')
  const [sendAction, setSendAction] = useState('notify')
  const [sendContent, setSendContent] = useState('')
  const [sending, setSending] = useState(false)
  const streamRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages()
    loadAgentRoles()
    loadActiveAgents()

    // 定时刷新
    const interval = setInterval(() => {
      loadMessages()
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = 0
    }
  }, [messages.length])

  // 获取所有可用的 agent 名称（角色 + 活跃 agent）
  const agentNames = Array.from(new Set([
    ...agentRoles.map((r) => r.name),
    ...activeAgents.map((a) => a.role),
  ]))

  const handleSend = async () => {
    if (!sendTo || !sendContent.trim()) {
      antMsg.warning('请选择接收方并输入消息内容')
      return
    }

    try {
      setSending(true)
      await sendMessage('用户', sendTo, sendAction, sendContent)
      setSendContent('')
      antMsg.success('消息已发送')
    } catch (e: any) {
      antMsg.error(`发送失败: ${e}`)
    } finally {
      setSending(false)
    }
  }

  const handleMarkRead = async (msgId: string) => {
    await markMessageRead(msgId)
  }

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString()
    } catch {
      return ts
    }
  }

  return (
    <div className="message-panel">
      {/* 发送消息区域 */}
      <Card size="small" title="发送消息" className="message-send-card">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space style={{ width: '100%' }}>
            <Select
              value={sendTo || undefined}
              onChange={(v) => setSendTo(v)}
              placeholder="选择接收方"
              style={{ width: 160 }}
              options={agentNames.map((name) => ({ value: name, label: name }))}
            />
            <Select
              value={sendAction}
              onChange={(v) => setSendAction(v)}
              style={{ width: 100 }}
              options={Object.entries(actionLabels).map(([key, label]) => ({
                value: key,
                label,
              }))}
            />
          </Space>
          <TextArea
            value={sendContent}
            onChange={(e) => setSendContent(e.target.value)}
            rows={2}
            placeholder="输入消息内容..."
            onPressEnter={(e) => {
              if (e.ctrlKey || e.metaKey) {
                handleSend()
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Ctrl+Enter 发送</Text>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={sending}
              size="small"
            >
              发送
            </Button>
          </div>
        </Space>
      </Card>

      {/* 消息列表 */}
      <Card
        size="small"
        title={
          <Space>
            <MailOutlined />
            <span>消息记录</span>
            <Badge count={messages.filter((m) => !m.read).length} />
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} size="small" onClick={() => loadMessages()} />
        }
        className="message-list-card"
      >
        <div className="message-stream" ref={streamRef}>
          {messages.length === 0 ? (
            <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              dataSource={messages}
              renderItem={(msg: Message) => (
                <List.Item
                  className={`message-item ${!msg.read ? 'message-unread' : ''}`}
                  onClick={() => !msg.read && handleMarkRead(msg.id)}
                >
                  <div className="message-content">
                    <div className="message-header">
                      <Space size={4}>
                        <Text strong>{msg.from}</Text>
                        <Text type="secondary">→</Text>
                        <Text strong>{msg.to}</Text>
                        <Tag color={actionColors[msg.action] || 'default'}>
                          {actionLabels[msg.action] || msg.action}
                        </Tag>
                        {msg.taskId && <Tag>{msg.taskId}</Tag>}
                        {!msg.read && <Badge status="processing" />}
                      </Space>
                      <Text type="secondary" className="message-time">
                        {formatTime(msg.ts)}
                      </Text>
                    </div>
                    <Paragraph className="message-text" ellipsis={{ rows: 2, expandable: true }}>
                      {msg.content}
                    </Paragraph>
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      </Card>
    </div>
  )
}

export default MessagePanel
