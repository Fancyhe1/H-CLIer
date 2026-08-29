import React, { useState, useEffect } from 'react'
import { Modal, Checkbox, Radio, Space, Typography, Alert, Input, Divider, Button } from 'antd'
import { WarningOutlined, EditOutlined } from '@ant-design/icons'
import { useAgentHubStore, type AnalysisManifest } from '../../stores/agentHubStore'

const { Text } = Typography
const { TextArea } = Input

interface AnalysisConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (scope: string[], mode: string, customPrompt?: string) => void
  projectPath: string | null
}

const scopeOptions = [
  { value: 'architecture', label: '架构概述', description: '技术栈、框架选择、设计模式' },
  { value: 'structure', label: '目录结构', description: '项目目录组织和各目录职责' },
  { value: 'decisions', label: '技术决策', description: '技术选型理由、架构决策记录' },
  { value: 'conventions', label: '代码规范', description: '命名规则、编码风格、文件组织' },
  { value: 'other', label: '其他补充', description: '特殊说明、注意事项、补充信息' },
  { value: 'current', label: '当前状态', description: 'Git 分支、最近提交、未完成工作' },
]

const AnalysisConfirmModal: React.FC<AnalysisConfirmModalProps> = ({
  open,
  onClose,
  onConfirm,
}) => {
  const { loadAnalysisManifest } = useAgentHubStore()
  const [selectedScope, setSelectedScope] = useState<string[]>([
    'structure', 'architecture', 'conventions', 'key-files',
  ])
  const [mode, setMode] = useState<'full' | 'incremental'>('full')
  const [manifest, setManifest] = useState<AnalysisManifest | null>(null)
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  useEffect(() => {
    if (open) {
      loadAnalysisManifest().then((m) => {
        setManifest(m)
        if (m) {
          setMode('incremental')
        }
      })
    }
  }, [open])

  const handleConfirm = () => {
    onConfirm(selectedScope, mode, showCustomPrompt ? customPrompt : undefined)
    onClose()
  }

  return (
    <Modal
      title="AI 分析项目"
      open={open}
      onOk={handleConfirm}
      onCancel={onClose}
      okText="开始分析"
      cancelText="取消"
      width={520}
      maskClosable={false}
    >
      <Alert
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        message="即将创建一个 Claude Code 会话来分析项目"
        description="会话将在标签栏中显示，您可以看到 Claude 的分析过程。分析过程会消耗 Claude Code 的 token。"
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 16 }}>
        <Text strong>分析范围</Text>
        <div style={{ marginTop: 8 }}>
          <Checkbox.Group
            value={selectedScope}
            onChange={(values) => setSelectedScope(values as string[])}
          >
            <Space direction="vertical">
              {scopeOptions.map((opt) => (
                <Checkbox key={opt.value} value={opt.value}>
                  <Space>
                    <span>{opt.label}</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>- {opt.description}</Text>
                  </Space>
                </Checkbox>
              ))}
            </Space>
          </Checkbox.Group>
        </div>
      </div>

      <Divider />

      <div style={{ marginBottom: 16 }}>
        <Text strong>分析模式</Text>
        <div style={{ marginTop: 8 }}>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <Space direction="vertical">
              <Radio value="full">
                <Space>
                  <span>完整分析</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>- 重新分析整个项目</Text>
                </Space>
              </Radio>
              <Radio value="incremental" disabled={!manifest}>
                <Space>
                  <span>增量分析</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {manifest
                      ? `- 上次分析: ${new Date(manifest.lastAnalysis).toLocaleString()}`
                      : '- 需要先完成一次完整分析'}
                  </Text>
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        </div>
      </div>

      <Divider />

      <div>
        <Button
          type="link"
          icon={<EditOutlined />}
          onClick={() => setShowCustomPrompt(!showCustomPrompt)}
          style={{ padding: 0, marginBottom: 8 }}
        >
          {showCustomPrompt ? '隐藏自定义 Prompt' : '自定义分析 Prompt'}
        </Button>
        {showCustomPrompt && (
          <TextArea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={4}
            placeholder="留空使用默认 Prompt，或输入自定义指令..."
            style={{ fontSize: 12 }}
          />
        )}
      </div>
    </Modal>
  )
}

export default AnalysisConfirmModal
