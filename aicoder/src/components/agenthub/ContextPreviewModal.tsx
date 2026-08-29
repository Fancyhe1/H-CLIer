import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Input, Select, Checkbox, Button, Space, Typography, message, Spin } from 'antd'
import {
  CopyOutlined,
  SendOutlined,
  ReloadOutlined,
  EditOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useAgentHubStore } from '../../stores/agentHubStore'
import { useSessionStore } from '../../stores/sessionStore'

const { Text } = Typography

interface ContextPreviewModalProps {
  open: boolean
  onClose: () => void
  taskId: string
}

const brainSectionOptions = [
  { value: 'architecture', label: '架构概述' },
  { value: 'structure', label: '目录结构' },
  { value: 'conventions', label: '代码规范' },
  { value: 'decisions', label: '技术决策' },
  { value: 'other', label: '其他补充' },
  { value: 'state/current', label: '当前状态' },
]

const ContextPreviewModal: React.FC<ContextPreviewModalProps> = ({ open, onClose, taskId }) => {
  const {
    tasks,
    agentRoles,
    buildContextWithPaths,
    loadAgentRoles,
  } = useAgentHubStore()
  const { setActiveSession, fetchSessions } = useSessionStore()

  const [context, setContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [selectedBrainSections, setSelectedBrainSections] = useState<string[]>([
    'architecture', 'conventions', 'state/current',
  ])
  const [isEditing, setIsEditing] = useState(false)
  const [injecting, setInjecting] = useState(false)

  const task = tasks.find((t) => t.id === taskId)

  // 加载 Agent 角色
  useEffect(() => {
    if (open) {
      loadAgentRoles()
    }
  }, [open])

  // 生成 context
  const generateContext = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const ctx = await buildContextWithPaths(
        taskId,
        selectedRoleId || undefined,
        selectedBrainSections.length > 0 ? selectedBrainSections : undefined,
      )
      setContext(ctx)
    } catch (e: any) {
      message.error(`生成上下文失败: ${e}`)
    } finally {
      setLoading(false)
    }
  }, [taskId, selectedRoleId, selectedBrainSections])

  // 打开时或参数变化时重新生成
  useEffect(() => {
    if (open && taskId) {
      generateContext()
    }
  }, [open, taskId, selectedRoleId, selectedBrainSections.join(',')])

  // 复制到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(context)
      message.success('上下文已复制到剪贴板')
    } catch {
      message.error('复制失败')
    }
  }

  // 注入到会话
  const handleInject = async () => {
    if (!task) return
    setInjecting(true)
    try {
      // 获取项目路径
      const { sessions, activeSessionId } = useSessionStore.getState()
      const activeSession = sessions.find(s => s.id === activeSessionId)
      const currentProjectPath = useAgentHubStore.getState().currentProjectPath
      const projectPath = currentProjectPath || activeSession?.projectPath || ''

      if (!projectPath) {
        message.warning('未检测到项目路径，请先打开一个项目')
        return
      }

      // 创建新会话
      const session = await invoke<{ id: string; title: string }>('create_session', {
        projectPath,
        title: `AgentHub: ${task.title}`,
        sessionType: 'claude',
      })

      // 刷新会话列表
      await fetchSessions()

      // 切换到新会话
      setActiveSession(session.id)

      // 存储上下文（MultiTerminal 会在 PTY 就绪后读取并注入）
      sessionStorage.setItem(`agenthub-context-${session.id}`, context)

      message.success('会话已创建，上下文将在终端就绪后自动注入')
      onClose()
    } catch (e: any) {
      message.error(`注入失败: ${e}`)
    } finally {
      setInjecting(false)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <EyeOutlined />
          <span>预览上下文</span>
          {task && <Text type="secondary">({task.id}: {task.title})</Text>}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={720}
      destroyOnClose
      maskClosable={false}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button
            icon={<CopyOutlined />}
            onClick={handleCopy}
          >
            复制
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleInject}
            loading={injecting}
          >
            注入到新会话
          </Button>
        </Space>
      }
    >
      {/* 参数配置区 */}
      <div className="context-preview-config">
        <div className="config-row">
          <div className="config-item">
            <Text strong style={{ marginBottom: 4, display: 'block' }}>Agent 角色</Text>
            <Select
              value={selectedRoleId || undefined}
              onChange={(val) => setSelectedRoleId(val || null)}
              placeholder="默认角色"
              style={{ width: '100%' }}
              allowClear
              options={agentRoles.map((role) => ({
                value: role.name,
                label: `${role.name} (${role.model})`,
              }))}
            />
          </div>
        </div>

        <div className="config-item" style={{ marginTop: 12 }}>
          <Text strong style={{ marginBottom: 4, display: 'block' }}>注入项目知识</Text>
          <Checkbox.Group
            value={selectedBrainSections}
            onChange={(values) => setSelectedBrainSections(values as string[])}
            options={brainSectionOptions}
          />
          <Button
            type="link"
            size="small"
            style={{ padding: 0, fontSize: 12, marginLeft: 8 }}
            onClick={() => setSelectedBrainSections([])}
          >
            全部取消
          </Button>
        </div>
      </div>

      {/* Context 预览区 */}
      <div className="context-preview-area" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong>上下文内容</Text>
          <Space size="small">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={generateContext}
              loading={loading}
            >
              重新生成
            </Button>
            <Button
              type={isEditing ? 'primary' : 'text'}
              size="small"
              icon={<EditOutlined />}
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? '完成编辑' : '编辑'}
            </Button>
          </Space>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="正在生成上下文..." />
          </div>
        ) : (
          <Input.TextArea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            readOnly={!isEditing}
            rows={16}
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              resize: 'vertical',
            }}
          />
        )}

        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isEditing
              ? '编辑模式：修改后点击"完成编辑"保存，或直接复制/注入'
              : '只读模式：点击"编辑"按钮可修改内容'}
            {' · '}
            {context.length} 字符
          </Text>
        </div>
      </div>
    </Modal>
  )
}

export default ContextPreviewModal
