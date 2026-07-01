import React, { useEffect, useState } from 'react'
import { Card, Tabs, Button, Input, Space, Tag, Typography, Spin, Descriptions, message } from 'antd'
import { SaveOutlined, ScanOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAgentHubStore } from '../../stores/agentHubStore'

const { Text } = Typography
const { TextArea } = Input

const brainSections = [
  { key: 'architecture', label: '架构概述', file: 'architecture.md' },
  { key: 'decisions', label: '技术决策', file: 'decisions.md' },
  { key: 'conventions', label: '代码规范', file: 'conventions.md' },
  { key: 'state/current', label: '当前状态', file: 'state/current.md' },
  { key: 'state/blockers', label: '阻塞项', file: 'state/blockers.md' },
]

const BrainPanel: React.FC = () => {
  const {
    brainMeta,
    brainSections: sections,
    isLoading,
    loadBrain,
    loadBrainSection,
    updateBrainSection,
    scanProject,
  } = useAgentHubStore()

  const [activeSection, setActiveSection] = useState('architecture')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingSection, setLoadingSection] = useState(false)

  useEffect(() => {
    loadBrain()
    loadBrainSection('architecture')
  }, [])

  useEffect(() => {
    const content = sections[activeSection] || ''
    setEditContent(content)
  }, [activeSection, sections])

  const handleSectionChange = async (key: string) => {
    setActiveSection(key)
    setLoadingSection(true)
    await loadBrainSection(key)
    setLoadingSection(false)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await updateBrainSection(activeSection, editContent)
      message.success('保存成功')
    } catch (e: any) {
      message.error(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  const handleScan = async () => {
    try {
      await scanProject()
      message.success('项目扫描完成')
    } catch (e: any) {
      message.error(`扫描失败: ${e}`)
    }
  }

  const handleReload = async () => {
    await loadBrain()
    await loadBrainSection(activeSection)
  }

  return (
    <div className="brain-panel">
      <div className="brain-header">
        <Space>
          <Button icon={<ScanOutlined />} onClick={handleScan} loading={isLoading}>
            扫描项目
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReload}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 项目元数据 */}
      {brainMeta && (
        <Card size="small" className="brain-meta-card">
          <Descriptions column={2} size="small">
            <Descriptions.Item label="项目名">{brainMeta.name}</Descriptions.Item>
            <Descriptions.Item label="默认模型">{brainMeta.defaultModel}</Descriptions.Item>
            <Descriptions.Item label="技术栈" span={2}>
              {Object.entries(brainMeta.techStack).length > 0 ? (
                Object.entries(brainMeta.techStack).map(([key, val]) => (
                  <Tag key={key} color="blue">
                    {key}: {val}
                  </Tag>
                ))
              ) : (
                <Text type="secondary">未检测到</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* 内容编辑区 */}
      <Card size="small" className="brain-content-card">
        <Tabs
          activeKey={activeSection}
          onChange={handleSectionChange}
          size="small"
          items={brainSections.map((s) => ({
            key: s.key,
            label: s.label,
          }))}
        />

        {loadingSection ? (
          <div className="brain-loading">
            <Spin />
          </div>
        ) : (
          <div className="brain-editor">
            <TextArea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={16}
              placeholder={`输入${brainSections.find((s) => s.key === activeSection)?.label || ''}内容...`}
              className="brain-textarea"
            />
            <div className="brain-editor-footer">
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                保存
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export default BrainPanel
