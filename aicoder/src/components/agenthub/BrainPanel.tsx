import React, { useEffect, useState } from 'react'
import { Card, Tabs, Button, Input, Space, Tag, Typography, Spin, Descriptions, message, Modal, Tooltip } from 'antd'
import {
  SaveOutlined,
  ScanOutlined,
  ReloadOutlined,
  SyncOutlined,
  EyeOutlined,
  EditOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
    generateClaudeMd,
    syncClaudeMd,
  } = useAgentHubStore()

  const [activeSection, setActiveSection] = useState('architecture')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingSection, setLoadingSection] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [previewContent, setPreviewContent] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

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

  const handlePreviewClaudeMd = async () => {
    try {
      const content = await generateClaudeMd()
      setPreviewContent(content)
      setPreviewOpen(true)
    } catch (e: any) {
      message.error(`生成预览失败: ${e}`)
    }
  }

  const handleSyncClaudeMd = async () => {
    try {
      await syncClaudeMd()
      message.success('CLAUDE.md 已同步到项目根目录')
    } catch (e: any) {
      message.error(`同步失败: ${e}`)
    }
  }

  const currentSectionLabel = brainSections.find((s) => s.key === activeSection)?.label || ''

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
          <Tooltip title="预览将生成的 CLAUDE.md 内容">
            <Button icon={<EyeOutlined />} onClick={handlePreviewClaudeMd}>
              预览 CLAUDE.md
            </Button>
          </Tooltip>
          <Tooltip title="将 brain 内容同步生成到项目根目录的 CLAUDE.md">
            <Button type="primary" icon={<SyncOutlined />} onClick={handleSyncClaudeMd}>
              同步 CLAUDE.md
            </Button>
          </Tooltip>
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
        <div className="brain-toolbar">
          <Tabs
            activeKey={activeSection}
            onChange={handleSectionChange}
            size="small"
            items={brainSections.map((s) => ({
              key: s.key,
              label: s.label,
            }))}
            style={{ flex: 1 }}
          />
          <Space size={4} className="brain-mode-toggle">
            <Button
              size="small"
              type={mode === 'edit' ? 'primary' : 'default'}
              icon={<EditOutlined />}
              onClick={() => setMode('edit')}
            />
            <Button
              size="small"
              type={mode === 'preview' ? 'primary' : 'default'}
              icon={<EyeOutlined />}
              onClick={() => setMode('preview')}
            />
          </Space>
        </div>

        {loadingSection ? (
          <div className="brain-loading">
            <Spin />
          </div>
        ) : mode === 'edit' ? (
          <div className="brain-editor">
            <TextArea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={16}
              placeholder={`输入${currentSectionLabel}内容... (支持 Markdown 格式)`}
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
        ) : (
          <div className="brain-preview">
            {editContent.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent}</ReactMarkdown>
            ) : (
              <Text type="secondary">暂无内容</Text>
            )}
          </div>
        )}
      </Card>

      {/* CLAUDE.md 预览弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>CLAUDE.md 预览</span>
          </Space>
        }
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width={700}
        footer={
          <Space>
            <Button onClick={() => setPreviewOpen(false)}>关闭</Button>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={async () => {
                await handleSyncClaudeMd()
                setPreviewOpen(false)
              }}
            >
              确认同步到项目
            </Button>
          </Space>
        }
      >
        <div className="claude-md-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
        </div>
      </Modal>
    </div>
  )
}

export default BrainPanel
