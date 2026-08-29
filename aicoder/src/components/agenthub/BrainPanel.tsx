import React, { useEffect, useState, useRef } from 'react'
import { Card, Tabs, Button, Input, Space, Tag, Typography, Spin, Descriptions, message } from 'antd'
import {
  SaveOutlined,
  ScanOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAgentHubStore } from '../../stores/agentHubStore'
import { useSessionStore } from '../../stores/sessionStore'
import AnalysisConfirmModal from './AnalysisConfirmModal'

const { Text } = Typography
const { TextArea } = Input

const brainSections = [
  { key: 'architecture', label: '架构概述', file: 'architecture.md' },
  { key: 'structure', label: '目录结构', file: 'structure.md' },
  { key: 'decisions', label: '技术决策', file: 'decisions.md' },
  { key: 'conventions', label: '代码规范', file: 'conventions.md' },
  { key: 'other', label: '其他补充', file: 'other.md' },
  { key: 'state/current', label: '当前状态', file: 'state/current.md' },
]

const BrainPanel: React.FC = () => {
  const {
    brainMeta,
    brainSections: sections,
    isLoading,
    currentProjectPath,
    loadBrain,
    loadBrainSection,
    updateBrainSection,
    scanProject,
    collectRawData,
    buildAnalysisPrompt,
    scanProjectHashes,
    saveAnalysisManifest,
  } = useAgentHubStore()

  const [activeSection, setActiveSection] = useState('architecture')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingSection, setLoadingSection] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false)
  const analysisSessionIdRef = useRef<string | null>(null)
  const analysisScopeRef = useRef<string[]>([])
  const { setActiveSession, fetchSessions } = useSessionStore()

  useEffect(() => {
    loadBrain()
    loadBrainSection('architecture')
  }, [])

  // 监听 Claude Stop hook，分析完成后自动刷新 brain 数据
  useEffect(() => {
    const unlisten = listen('claude-hook-notification', (event) => {
      const payload = event.payload as {
        hook_event_name?: string
        session_id?: string
      }

      if (payload.hook_event_name === 'Stop' && payload.session_id === analysisSessionIdRef.current) {
        // 分析会话完成，刷新 brain 数据
        message.success('AI 分析完成，正在加载结果...')
        loadBrain()
        loadBrainSection(activeSection)

        // 保存 manifest（记录分析完成的时间和范围）
        if (currentProjectPath && analysisScopeRef.current.length > 0) {
          scanProjectHashes(currentProjectPath).then((hashes) => {
            saveAnalysisManifest(analysisScopeRef.current, hashes)
          })
        }

        analysisSessionIdRef.current = null
        analysisScopeRef.current = []
      }
    })

    return () => { unlisten.then(fn => fn()) }
  }, [activeSection])

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

  const handleAiAnalysis = async (scope: string[], mode: string, customPrompt?: string) => {
    if (!currentProjectPath) {
      message.warning('请先选择一个项目')
      return
    }

    try {
      message.loading('正在收集项目数据...', 0)

      // 1. 收集原始数据
      const rawData = await collectRawData(currentProjectPath, scope)

      // 2. 构建 prompt
      const prompt = customPrompt
        ? `${customPrompt}\n\n以下是项目的原始数据：\n\n${rawData}`
        : await buildAnalysisPrompt(currentProjectPath, scope, mode, rawData)

      message.destroy()

      // 3. 创建 Claude Code 会话
      const session = await invoke<{ id: string; title: string }>('create_session', {
        projectPath: currentProjectPath,
        title: `AgentHub: 项目分析 (${scope.join(', ')})`,
        sessionType: 'claude',
      })

      // 4. 刷新会话列表并切换
      await fetchSessions()
      setActiveSession(session.id)

      // 5. 存储 prompt，等待 PTY 就绪后注入
      sessionStorage.setItem(`agenthub-context-${session.id}`, prompt)

      message.success('AI 分析会话已创建，Claude 正在分析项目...')

      // 6. 记录分析会话 ID 和范围，用于检测完成
      analysisSessionIdRef.current = session.id
      analysisScopeRef.current = scope
    } catch (e: any) {
      message.destroy()
      message.error(`分析失败: ${e}`)
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
          <Button icon={<RobotOutlined />} onClick={() => setAnalysisModalOpen(true)}>
            AI 分析
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

      {/* AI 分析确认弹窗 */}
      <AnalysisConfirmModal
        open={analysisModalOpen}
        onClose={() => setAnalysisModalOpen(false)}
        onConfirm={handleAiAnalysis}
        projectPath={currentProjectPath}
      />
    </div>
  )
}

export default BrainPanel
