import { useState, useEffect } from 'react'
import {
  Drawer,
  Tabs,
  Form,
  Input,
  Switch,
  Button,
  Space,
  Tag,
  message,
  Slider,
  Select,
  Alert,
  Typography,
  Divider,
  Collapse,
  List,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  MoonOutlined,
  SunOutlined,
  ClearOutlined,
  CodeOutlined,
  GlobalOutlined,
  FolderOutlined,
  SyncOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  ApiOutlined,
  RocketOutlined,
  EditOutlined,
  UndoOutlined,
  LinkOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore, McpServerInfo, SkillInfo, HookInfo } from '../stores/settingsStore'
import { useKeybindingStore } from '../stores/keybindingStore'
import { usePhraseStore } from '../stores/phraseStore'
import '../styles/SettingsPanel.css'

const { TabPane } = Tabs
const { Text, Title } = Typography
const { Panel } = Collapse

interface SettingsPanelProps {
  visible: boolean
  onClose: () => void
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
}

function SettingsPanel({ visible, onClose, theme, onThemeChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState('general')
  const [claudeForm] = Form.useForm()
  const [generalForm] = Form.useForm()
  const [apiForm] = Form.useForm()

  const { sessions, clearAllSessions } = useSessionStore()
  const {
    getAllKeybindings,
    setCustomBinding,
    removeCustomBinding,
    resetAllBindings,
  } = useKeybindingStore()
  const {
    phrases,
    loadPhrases,
    addPhrase,
    updatePhrase,
    removePhrase,
  } = usePhraseStore()

  // 常用语编辑状态
  const [editingPhraseId, setEditingPhraseId] = useState<string | null>(null)
  const [phraseLabel, setPhraseLabel] = useState('')
  const [phraseContent, setPhraseContent] = useState('')
  const [showPhraseForm, setShowPhraseForm] = useState(false)

  // 快捷键编辑状态
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [recordingKey, setRecordingKey] = useState(false)

  // 远程访问状态
  const [tunnelRunning, setTunnelRunning] = useState(false)
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null)
  const [tunnelError, setTunnelError] = useState<string | null>(null)
  const [ngrokToken, setNgrokToken] = useState('')
  const [_remoteAccessEnabled, setRemoteAccessEnabled] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  const [tunnelLoading, setTunnelLoading] = useState(false)
  const [localIps, setLocalIps] = useState<{ ip: string; label: string }[]>([])

  // 开始录制快捷键
  const startRecording = (actionId: string) => {
    setEditingActionId(actionId)
    setRecordingKey(true)
  }

  // 取消录制
  const cancelRecording = () => {
    setEditingActionId(null)
    setRecordingKey(false)
  }

  // 录制快捷键的键盘事件处理
  useEffect(() => {
    if (!recordingKey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // ESC 取消
      if (e.key === 'Escape') {
        cancelRecording()
        return
      }

      // 忽略单独的修饰键
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return
      }

      // 构建快捷键字符串
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')

      // 主键名称
      let keyName = e.key
      if (keyName === ' ') keyName = 'Space'
      if (keyName === 'ArrowUp') keyName = 'Up'
      if (keyName === 'ArrowDown') keyName = 'Down'
      if (keyName === 'ArrowLeft') keyName = 'Left'
      if (keyName === 'ArrowRight') keyName = 'Right'

      parts.push(keyName)
      const keyCombo = parts.join('+')

      // 检查冲突
      const allBindings = getAllKeybindings()
      const conflict = allBindings.find(
        b => b.currentKey === keyCombo && b.id !== editingActionId
      )

      if (conflict) {
        message.warning(`快捷键 ${keyCombo} 已被"${conflict.title}"使用，请选择其他快捷键`)
        return
      }

      // 保存
      if (editingActionId) {
        setCustomBinding(editingActionId, keyCombo)
        message.success(`快捷键已设置为 ${keyCombo}`)
      }
      cancelRecording()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recordingKey, editingActionId])

  // 加载常用语
  useEffect(() => {
    loadPhrases()
  }, [])

  // 常用语操作
  const handleSavePhrase = () => {
    if (!phraseLabel.trim() || !phraseContent.trim()) {
      message.warning('名称和内容不能为空')
      return
    }
    if (editingPhraseId) {
      updatePhrase(editingPhraseId, phraseLabel.trim(), phraseContent.trim())
      message.success('常用语已更新')
    } else {
      addPhrase(phraseLabel.trim(), phraseContent.trim())
      message.success('常用语已添加')
    }
    setPhraseLabel('')
    setPhraseContent('')
    setEditingPhraseId(null)
    setShowPhraseForm(false)
  }

  const handleEditPhrase = (id: string) => {
    const phrase = phrases.find(p => p.id === id)
    if (phrase) {
      setEditingPhraseId(id)
      setPhraseLabel(phrase.label)
      setPhraseContent(phrase.content)
      setShowPhraseForm(true)
    }
  }

  const handleDeletePhrase = (id: string) => {
    removePhrase(id)
    message.success('常用语已删除')
  }

  const handleCancelPhrase = () => {
    setPhraseLabel('')
    setPhraseContent('')
    setEditingPhraseId(null)
    setShowPhraseForm(false)
  }

  const {
    config,
    isLoading,
    claudeInstalled,
    claudeVersion,
    checkClaudeInstallation,
    getClaudeVersion,
    updateClaudeConfig,
    updateGeneralConfig,
    setDefaultExportPath,
    appVersion,
    updateStatus,
    updateInfo,
    updateError,
    getAppVersion,
    checkForUpdates,
    downloadAndInstallUpdate,
    clearUpdateError,
    mcpServers,
    skills,
    hooks,
    loadMcpServers,
    loadSkills,
    loadHooks,
  } = useSettingsStore()

  // 配置已在 App 启动时加载和检测，这里不需要再做

  // 加载应用版本
  useEffect(() => {
    getAppVersion()
  }, [])

  // 切换到 Claude Code tab 时加载 MCP/Skills/Hooks 数据，并确保版本已检测
  useEffect(() => {
    if (activeTab === 'claude') {
      loadMcpServers()
      loadSkills()
      loadHooks()
      checkHooksConfigured()
      // 如果版本还未获取，重新检测
      if (claudeInstalled && !claudeVersion) {
        getClaudeVersion()
      }
    }
  }, [activeTab])

  // Claude Code Hooks 配置状态
  const [hooksConfigured, setHooksConfigured] = useState<boolean>(false)
  const [hooksLoading, setHooksLoading] = useState<boolean>(false)

  const checkHooksConfigured = async () => {
    try {
      const configured = await invoke<boolean>('is_claude_hooks_configured')
      setHooksConfigured(configured)
    } catch {
      setHooksConfigured(false)
    }
  }

  const handleSetupHooks = async () => {
    setHooksLoading(true)
    try {
      await invoke('setup_claude_hooks')
      message.success('Claude Code 通知钩子配置成功！')
      setHooksConfigured(true)
      loadHooks() // 刷新 hooks 列表
    } catch (err) {
      message.error('配置失败: ' + String(err))
    } finally {
      setHooksLoading(false)
    }
  }

  // 同步表单数据
  useEffect(() => {
    if (config) {
      claudeForm.setFieldsValue({
        cli_path: config.claude.cli_path || '',
        default_args: config.claude.default_args.join(' '),
      })
      generalForm.setFieldsValue({
        terminal_font_size: config.general.terminal_font_size,
        default_export_path: config.general.default_export_path || '',
      })
      apiForm.setFieldsValue({
        use_custom_api: config.claude.api_config.use_custom_api,
        api_base_url: config.claude.api_config.api_base_url || '',
        api_key: config.claude.api_config.api_key || '',
      })
    }
  }, [config])

  // 远程访问：加载 access token 和本机 IP
  useEffect(() => {
    if (visible) {
      invoke<string>('get_web_access_token').then(setAccessToken).catch(() => {})
      invoke<{ ip: string; label: string }[]>('get_local_ips').then(setLocalIps).catch(() => {})
    }
  }, [visible])

  // 远程访问：检查隧道状态
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await invoke<{ running: boolean; url: string | null; error: string | null }>('get_tunnel_status')
        setTunnelRunning(status.running)
        setTunnelUrl(status.url)
        setRemoteAccessEnabled(status.running)
        if (status.error) setTunnelError(status.error)
      } catch {}
    }
    if (visible) {
      checkStatus()
      const timer = setInterval(checkStatus, 3000)
      return () => clearInterval(timer)
    }
  }, [visible])

  // 远程访问：启动隧道
  const handleStartTunnel = async () => {
    if (!ngrokToken.trim()) {
      message.warning('请输入 ngrok Authtoken')
      return
    }
    setTunnelLoading(true)
    setTunnelError(null)
    try {
      const url = await invoke<string>('start_tunnel', { authtoken: ngrokToken.trim() })
      setTunnelRunning(true)
      setTunnelUrl(url)
      setRemoteAccessEnabled(true)
      message.success('远程访问已开启')
    } catch (e) {
      setTunnelError(String(e))
      message.error('启动失败: ' + String(e))
    } finally {
      setTunnelLoading(false)
    }
  }

  // 远程访问：停止隧道
  const handleStopTunnel = async () => {
    setTunnelLoading(true)
    try {
      await invoke('stop_tunnel')
      setTunnelRunning(false)
      setTunnelUrl(null)
      setRemoteAccessEnabled(false)
      message.success('远程访问已关闭')
    } catch (e) {
      message.error('停止失败: ' + String(e))
    } finally {
      setTunnelLoading(false)
    }
  }

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    message.success('已复制')
  }

  // 保存 Claude 配置
  const handleSaveClaudeConfig = async (values: any) => {
    try {
      const newConfig = {
        ...config.claude,
        cli_path: values.cli_path || null,
        default_args: values.default_args
          ? values.default_args.split(' ').filter((arg: string) => arg.trim())
          : [],
      }
      await updateClaudeConfig(newConfig)
      message.success('Claude 配置已保存')
    } catch (err) {
      message.error('保存失败: ' + String(err))
    }
  }

  // 保存通用配置
  const handleSaveGeneralConfig = async (values: any) => {
    try {
      const newConfig = {
        ...config.general,
        terminal_font_size: values.terminal_font_size,
        default_export_path: values.default_export_path || null,
      }
      await updateGeneralConfig(newConfig)
      message.success('通用配置已保存')

      // 应用主题变更
      if (values.theme && values.theme !== theme) {
        onThemeChange(values.theme)
      }
    } catch (err) {
      message.error('保存失败: ' + String(err))
    }
  }

  // 选择默认导出路径
  const handleSelectExportPath = async () => {
    try {
      const path = await invoke<string | null>('select_folder')
      if (path) {
        generalForm.setFieldsValue({ default_export_path: path })
        setDefaultExportPath(path)
      }
    } catch (err) {
      message.error('选择文件夹失败: ' + String(err))
    }
  }

  // 保存 API 配置
  const handleSaveApiConfig = async (values: any) => {
    try {
      const newConfig = {
        ...config.claude,
        api_config: {
          use_custom_api: values.use_custom_api,
          api_base_url: values.api_base_url || null,
          api_key: values.api_key || null,
        },
      }
      await updateClaudeConfig(newConfig)
      message.success('API 配置已保存')
    } catch (err) {
      message.error('保存失败: ' + String(err))
    }
  }

  // 重新检测 Claude 安装
  const handleRecheckClaude = async () => {
    const installed = await checkClaudeInstallation()
    if (installed) {
      await getClaudeVersion()
      message.success('检测到 Claude Code 已安装')
    } else {
      message.warning('未检测到 Claude Code，请先安装')
    }
  }

  // 清除所有数据
  const handleClearData = () => {
    clearAllSessions()
    localStorage.removeItem('hcl-ier_token_stats')
    message.success('已清除所有数据')
    window.location.reload()
  }

  return (
    <Drawer
      title="设置"
      placement="right"
      width={500}
      open={visible}
      onClose={onClose}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* 通用设置 */}
        <TabPane
          tab={
            <span>
              <GlobalOutlined />
              通用
            </span>
          }
          key="general"
        >
          <Form
            form={generalForm}
            layout="vertical"
            onFinish={handleSaveGeneralConfig}
            initialValues={{ theme }}
          >
            <Title level={5}>外观</Title>
            <Form.Item label="主题" name="theme">
              <Select
                onChange={onThemeChange}
                options={[
                  { value: 'light', label: <><SunOutlined /> 浅色</> },
                  { value: 'dark', label: <><MoonOutlined /> 深色</> },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="terminal_font_size"
              label="终端字体大小"
            >
              <Slider
                min={10}
                max={24}
                marks={{
                  10: '10px',
                  14: '14px',
                  18: '18px',
                  24: '24px',
                }}
              />
            </Form.Item>

            <Divider />

            <Title level={5}>会话</Title>
            <Form.Item>
              <Text type="secondary">当前共有 {sessions.length} 个会话</Text>
            </Form.Item>

            <Divider />

            <Title level={5}>常用语</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              在命令面板中选择常用语，自动填充到终端输入栏
            </Text>

            {phrases.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {phrases.map(phrase => (
                  <div
                    key={phrase.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      marginBottom: 4,
                      borderRadius: 6,
                      background: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ fontSize: 13 }}>{phrase.label}</Text>
                      <br />
                      <Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                        ellipsis
                      >
                        {phrase.content}
                      </Text>
                    </div>
                    <Space size={4}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEditPhrase(phrase.id)}
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<CloseOutlined />}
                        onClick={() => handleDeletePhrase(phrase.id)}
                      />
                    </Space>
                  </div>
                ))}
              </div>
            )}

            {showPhraseForm ? (
              <div style={{
                padding: 12,
                marginBottom: 12,
                borderRadius: 6,
                border: `1px solid ${theme === 'dark' ? '#444' : '#d9d9d9'}`,
                background: theme === 'dark' ? '#1f1f1f' : '#fff',
              }}>
                <Form.Item label="名称" style={{ marginBottom: 8 }}>
                  <Input
                    value={phraseLabel}
                    onChange={e => setPhraseLabel(e.target.value)}
                    placeholder="如：问候语"
                    size="small"
                  />
                </Form.Item>
                <Form.Item label="内容" style={{ marginBottom: 8 }}>
                  <Input.TextArea
                    value={phraseContent}
                    onChange={e => setPhraseContent(e.target.value)}
                    placeholder="要填充到终端的文本内容"
                    rows={3}
                    size="small"
                  />
                </Form.Item>
                <Space>
                  <Button type="primary" size="small" onClick={handleSavePhrase}>
                    {editingPhraseId ? '更新' : '添加'}
                  </Button>
                  <Button size="small" onClick={handleCancelPhrase}>
                    取消
                  </Button>
                </Space>
              </div>
            ) : (
              <Button
                type="dashed"
                block
                onClick={() => setShowPhraseForm(true)}
                style={{ marginBottom: 12 }}
              >
                + 添加常用语
              </Button>
            )}

            <Form.Item
              name="default_export_path"
              label="默认导出路径"
              help="导出会话时的默认保存位置"
            >
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="未设置（每次导出时选择）"
                  readOnly
                />
                <Button
                  icon={<FolderOutlined />}
                  onClick={handleSelectExportPath}
                >
                  浏览
                </Button>
              </Space.Compact>
            </Form.Item>

            <Form.Item>
              <Button
                danger
                icon={<ClearOutlined />}
                onClick={handleClearData}
              >
                清除所有数据
              </Button>
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={isLoading}>
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        {/* 快捷键设置 */}
        <TabPane
          tab={
            <span>
              <EditOutlined />
              快捷键
            </span>
          }
          key="keybindings"
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>快捷键设置</Title>
              <Button
                size="small"
                icon={<UndoOutlined />}
                onClick={() => {
                  resetAllBindings()
                  message.success('已恢复所有默认快捷键')
                }}
              >
                全部恢复默认
              </Button>
            </div>
            <Text type="secondary">点击"编辑"后按下新的快捷键组合，ESC 取消。</Text>
          </div>

          {(['全局', '会话', '终端'] as const).map(category => {
            const categoryBindings = getAllKeybindings().filter(b => b.category === category)
            if (categoryBindings.length === 0) return null
            return (
              <div key={category} style={{ marginBottom: 24 }}>
                <Text strong style={{ fontSize: 13, color: theme === 'dark' ? '#aaa' : '#666' }}>
                  {category}
                </Text>
                <div style={{ marginTop: 8 }}>
                  {categoryBindings.map(binding => {
                    const isEditing = editingActionId === binding.id
                    const isCustom = binding.currentKey !== binding.defaultKey

                    return (
                      <div
                        key={binding.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          marginBottom: 4,
                          borderRadius: 6,
                          background: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
                          border: isEditing
                            ? '1px solid #1677ff'
                            : '1px solid transparent',
                        }}
                      >
                        <div>
                          <Text>{binding.title}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {binding.description}
                          </Text>
                        </div>
                        <Space size={4}>
                          {isEditing ? (
                            <Tag
                              color="processing"
                              style={{ cursor: 'pointer', fontFamily: 'monospace', padding: '2px 8px' }}
                              onClick={cancelRecording}
                            >
                              请按下快捷键...
                            </Tag>
                          ) : (
                            <>
                              <kbd
                                style={{
                                  padding: '2px 8px',
                                  background: theme === 'dark' ? '#3a3a3a' : '#e8e8e8',
                                  border: `1px solid ${theme === 'dark' ? '#555' : '#d9d9d9'}`,
                                  borderRadius: 4,
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                  color: theme === 'dark' ? '#fff' : '#333',
                                }}
                              >
                                {binding.currentKey}
                              </kbd>
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => startRecording(binding.id)}
                              />
                              {isCustom && (
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<UndoOutlined />}
                                  onClick={() => {
                                    removeCustomBinding(binding.id)
                                    message.success('已恢复默认快捷键')
                                  }}
                                  title="恢复默认"
                                />
                              )}
                            </>
                          )}
                        </Space>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </TabPane>

        {/* Claude Code 设置 */}
        <TabPane
          tab={
            <span>
              <CodeOutlined />
              Claude Code
            </span>
          }
          key="claude"
        >
          {/* Claude Code CLI */}
          <Collapse defaultActiveKey={['cli']} ghost>
            <Panel
              header={
                <span>
                  <RocketOutlined style={{ marginRight: 8 }} />
                  <Text strong>CLI 工具</Text>
                </span>
              }
              key="cli"
            >
              {/* 安装状态 */}
              <Alert
                message={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>Claude Code 安装状态:</span>
                    {claudeInstalled === null ? (
                      <Tag>检测中...</Tag>
                    ) : claudeInstalled ? (
                      <>
                        <Tag icon={<CheckCircleOutlined />} color="success">
                          已安装
                        </Tag>
                        {claudeVersion && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            v{claudeVersion}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Tag icon={<CloseCircleOutlined />} color="error">
                        未安装
                      </Tag>
                    )}
                    <Button size="small" onClick={handleRecheckClaude} style={{ marginLeft: 'auto' }}>
                      重新检测
                    </Button>
                  </div>
                }
                type={claudeInstalled ? 'success' : 'warning'}
                style={{ marginBottom: 16 }}
              />

              {!claudeInstalled && (
                <Alert
                  message="Claude Code 未安装"
                  description={
                    <div>
                      <p>请先安装 Claude Code CLI:</p>
                      <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, color: '#333' }}>
                        npm install -g @anthropic-ai/claude-code
                      </pre>
                    </div>
                  }
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}

              <Form
                form={claudeForm}
                layout="vertical"
                onFinish={handleSaveClaudeConfig}
              >
                <Form.Item
                  name="cli_path"
                  label="可执行文件路径"
                  help="Claude Code CLI 的完整路径，默认为 claude.cmd"
                >
                  <Input placeholder="C:\Users\name\AppData\Roaming\npm\claude.cmd" />
                </Form.Item>

                <Form.Item
                  name="default_args"
                  label="默认启动参数"
                  help="启动 Claude 时自动添加的参数，用空格分隔"
                >
                  <Input placeholder="--verbose --model claude-3-opus" />
                </Form.Item>

                <Space>
                  <Button type="primary" htmlType="submit" loading={isLoading}>
                    保存配置
                  </Button>
                  <Button onClick={() => {
                    invoke<string | null>('select_file').then((path) => {
                      if (path) {
                        claudeForm.setFieldsValue({ cli_path: path })
                      }
                    }).catch((err: any) => console.error(err))
                  }}>
                    浏览
                  </Button>
                </Space>
              </Form>
            </Panel>

            {/* API 配置 */}
            <Panel
              header={
                <span>
                  <ApiOutlined style={{ marginRight: 8 }} />
                  <Text strong>API 配置</Text>
                </span>
              }
              key="api"
            >
              <Alert
                message="API 配置用于中转站或自定义端点"
                description="默认情况下 Claude Code 使用官方 API，仅在需要使用中转站时配置。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form
                form={apiForm}
                layout="vertical"
                onFinish={handleSaveApiConfig}
              >
                <Form.Item
                  name="use_custom_api"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    使用自定义 API 端点
                  </Text>
                </Form.Item>

                <Form.Item
                  noStyle
                  shouldUpdate={(prev, curr) => prev.use_custom_api !== curr.use_custom_api}
                >
                  {({ getFieldValue }) =>
                    getFieldValue('use_custom_api') ? (
                      <>
                        <Form.Item
                          name="api_base_url"
                          label="API 基础 URL"
                          rules={[{ required: true, message: '请输入 API 基础 URL' }]}
                        >
                          <Input placeholder="https://api.example.com/v1" />
                        </Form.Item>

                        <Form.Item
                          name="api_key"
                          label="API Key"
                          rules={[{ required: true, message: '请输入 API Key' }]}
                        >
                          <Input.Password placeholder="sk-..." />
                        </Form.Item>
                      </>
                    ) : null
                  }
                </Form.Item>

                <Button type="primary" htmlType="submit" loading={isLoading}>
                  保存 API 配置
                </Button>
              </Form>
            </Panel>

            {/* MCP Server */}
            <Panel
              header={
                <span>
                  <SettingOutlined style={{ marginRight: 8 }} />
                  <Text strong>MCP Server</Text>
                  {mcpServers.length > 0 && (
                    <Tag color="blue" style={{ marginLeft: 8 }}>{mcpServers.length}</Tag>
                  )}
                </span>
              }
              key="mcp"
            >
              <Alert
                message="MCP Server 配置"
                description="配置 Model Context Protocol 服务器以扩展 Claude 的能力"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              {mcpServers.length === 0 ? (
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  当前暂无已配置的 MCP Server
                </Text>
              ) : (
                <List
                  size="small"
                  header={<Text strong>已配置的 Server</Text>}
                  dataSource={mcpServers}
                  style={{ marginBottom: 16 }}
                  renderItem={(item: McpServerInfo) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Text>{item.name}</Text>}
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.command} {item.args.join(' ')}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Panel>

            {/* Skills */}
            <Panel
              header={
                <span>
                  <CodeOutlined style={{ marginRight: 8 }} />
                  <Text strong>Skills</Text>
                  {skills.length > 0 && (
                    <Tag color="green" style={{ marginLeft: 8 }}>{skills.length}</Tag>
                  )}
                </span>
              }
              key="skills"
            >
              <Alert
                message="Skills 管理"
                description="管理 Claude Code 的自定义技能扩展"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              {skills.length === 0 ? (
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  暂无已安装的 Skills
                </Text>
              ) : (
                <List
                  size="small"
                  header={<Text strong>已安装的 Skills ({skills.length})</Text>}
                  dataSource={skills}
                  renderItem={(item: SkillInfo) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Text>{item.name}</Text>}
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.description || '无描述'}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Panel>

            {/* 钩子 */}
            <Panel
              header={
                <span>
                  <RocketOutlined style={{ marginRight: 8 }} />
                  <Text strong>钩子</Text>
                  {hooks.length > 0 && (
                    <Tag color="orange" style={{ marginLeft: 8 }}>{hooks.length}</Tag>
                  )}
                </span>
              }
              key="hooks"
            >
              <Alert
                message="钩子配置"
                description="配置在特定操作前/后自动执行的脚本"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              {/* Claude Code 通知钩子 */}
              <div style={{ marginBottom: 16, padding: 12, background: '#1a1a2e', borderRadius: 8, border: '1px solid #333' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <Text strong>📬 消息通知钩子</Text>
                    {hooksConfigured && (
                      <Tag color="green" style={{ marginLeft: 8 }}>已配置</Tag>
                    )}
                  </div>
                  <Button
                    type={hooksConfigured ? 'default' : 'primary'}
                    size="small"
                    loading={hooksLoading}
                    onClick={handleSetupHooks}
                  >
                    {hooksConfigured ? '重新配置' : '启用'}
                  </Button>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当 Claude Code 在后台会话中需要用户操作（权限审批、选项选择）时，自动通知并高亮该会话。应用启动时自动配置。
                </Text>
              </div>

              {hooks.length === 0 ? (
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  当前暂无已配置的钩子
                </Text>
              ) : (
                <List
                  size="small"
                  header={<Text strong>已配置的钩子 ({hooks.length})</Text>}
                  dataSource={hooks}
                  renderItem={(item: HookInfo) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Text>{item.event}</Text>}
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }} copyable>
                            {item.command}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Panel>
          </Collapse>
        </TabPane>

        {/* 远程访问 */}
        <TabPane
          tab={
            <span>
              <LinkOutlined />
              远程访问
            </span>
          }
          key="remote"
        >
          <div style={{ marginBottom: 16 }}>
            <Title level={5}>远程访问</Title>
            <Text type="secondary">
              让手机或其他设备远程管理此电脑上的会话
            </Text>
          </div>

          {/* 局域网 / Tailscale 访问 */}
          <Collapse defaultActiveKey={['lan']} style={{ marginBottom: 16 }}>
            <Panel header="📡 局域网 / Tailscale 访问" key="lan">
              <Alert
                type="info"
                showIcon
                message="如果手机和电脑在同一 WiFi 下，或使用了 Tailscale，可直接访问"
                style={{ marginBottom: 12 }}
              />

              <div style={{ marginBottom: 12 }}>
                <Text strong>访问地址：</Text>
                {localIps.length > 0 ? (
                  localIps.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 8,
                      padding: '8px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 8,
                    }}>
                      <Tag color={item.label === 'Tailscale' ? 'blue' : 'green'} style={{ margin: 0 }}>
                        {item.label}
                      </Tag>
                      <Text copyable code style={{ flex: 1, fontSize: 14 }}>
                        {`http://${item.ip}:9527`}
                      </Text>
                    </div>
                  ))
                ) : (
                  <div style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 8,
                  }}>
                    <Text code style={{ fontSize: 14 }}>http://电脑IP:9527</Text>
                  </div>
                )}
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                  手机浏览器输入上方地址即可访问（需在同一网络）
                </Text>
              </div>

              <div style={{ marginBottom: 12 }}>
                <Text strong>访问密码：</Text>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  padding: '8px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 8,
                }}>
                  <Text code style={{ flex: 1, fontSize: 14 }}>
                    {accessToken || '（见控制台输出）'}
                  </Text>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(accessToken)}
                  />
                </div>
              </div>

              <div>
                <Text strong>操作步骤：</Text>
                <ol style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                  <li>确保手机和电脑在同一网络</li>
                  <li>手机浏览器输入 <Text code>http://电脑IP:9527</Text></li>
                  <li>输入访问密码登录</li>
                </ol>
              </div>
            </Panel>
          </Collapse>

          {/* ngrok 公网访问 */}
          <Collapse style={{ marginBottom: 16 }}>
            <Panel header="🌐 公网访问（ngrok）" key="ngrok">
              <Alert
                type="warning"
                showIcon
                message="不在同一网络时，需要 ngrok 隧道将电脑暴露到公网"
                style={{ marginBottom: 12 }}
              />

              {tunnelRunning && tunnelUrl ? (
                // 隧道运行中
                <div>
                  <Alert
                    type="success"
                    showIcon
                    message="ngrok 隧道已开启"
                    style={{ marginBottom: 12 }}
                  />

                  <div style={{ marginBottom: 12 }}>
                    <Text strong>公网访问地址：</Text>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 8,
                      padding: '8px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 8,
                    }}>
                      <Text copyable code style={{ flex: 1, fontSize: 14 }}>
                        {tunnelUrl}
                      </Text>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <Text strong>访问密码：</Text>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 8,
                      padding: '8px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 8,
                    }}>
                      <Text code style={{ flex: 1, fontSize: 14 }}>
                        {accessToken || '（见控制台输出）'}
                      </Text>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(accessToken)}
                      />
                    </div>
                  </div>

                  <Button
                    danger
                    block
                    icon={<CloseCircleOutlined />}
                    onClick={handleStopTunnel}
                    loading={tunnelLoading}
                  >
                    关闭 ngrok 隧道
                  </Button>
                </div>
              ) : (
                // 隧道未启动
                <div>
                  <Form layout="vertical">
                    <Form.Item
                      label="ngrok Authtoken"
                      extra={
                        <span>
                          免费注册获取：
                          <a href="https://ngrok.com" target="_blank" rel="noopener">
                            ngrok.com
                          </a>
                        </span>
                      }
                    >
                      <Input.Password
                        value={ngrokToken}
                        onChange={(e) => setNgrokToken(e.target.value)}
                        placeholder="输入 ngrok authtoken"
                      />
                    </Form.Item>

                    {tunnelError && (
                      <Alert
                        type="error"
                        showIcon
                        message={tunnelError}
                        closable
                        onClose={() => setTunnelError(null)}
                        style={{ marginBottom: 12 }}
                      />
                    )}

                    <Button
                      type="primary"
                      block
                      icon={<RocketOutlined />}
                      onClick={handleStartTunnel}
                      loading={tunnelLoading}
                      disabled={!ngrokToken.trim()}
                    >
                      开启 ngrok 隧道
                    </Button>
                  </Form>
                </div>
              )}
            </Panel>
          </Collapse>
        </TabPane>

        {/* 关于 */}
        <TabPane
          tab={
            <span>
              <InfoCircleOutlined />
              关于
            </span>
          }
          key="about"
        >
          <div style={{ marginBottom: 24 }}>
            <Title level={5}>H CLIer</Title>
            <Text type="secondary">版本: {appVersion || '加载中...'}</Text>
            <br />
            <Text type="secondary">Claude Code 会话管理与工作台</Text>
          </div>

          <Divider />

          <Title level={5}>检查更新</Title>
          <div style={{ marginBottom: 16 }}>
            {updateStatus === 'idle' && (
              <Text type="secondary">点击下方按钮检查更新</Text>
            )}

            {updateStatus === 'checking' && (
              <Text><SyncOutlined spin /> 正在检查更新...</Text>
            )}

            {updateStatus === 'up_to_date' && (
              <Alert
                message="当前已是最新版本"
                description={`当前版本: v${appVersion}`}
                type="success"
                showIcon
              />
            )}

            {updateStatus === 'available' && updateInfo && (
              <div>
                <Alert
                  message={`发现新版本: v${updateInfo.version}`}
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                />
                <div style={{ marginBottom: 12, padding: '8px 12px', background: theme === 'dark' ? '#2a2a2a' : '#f5f5f5', borderRadius: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    当前版本: v{appVersion} → 最新版本: v{updateInfo.version}
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    文件大小: {(updateInfo.file_size / 1024 / 1024).toFixed(1)} MB
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    发布时间: {new Date(updateInfo.published_at).toLocaleDateString('zh-CN')}
                  </Text>
                </div>
                {updateInfo.body && (
                  <div style={{ marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 13 }}>更新日志:</Text>
                    <div style={{
                      marginTop: 4,
                      padding: '8px 12px',
                      background: theme === 'dark' ? '#2a2a2a' : '#fafafa',
                      borderRadius: 4,
                      maxHeight: 120,
                      overflow: 'auto',
                      fontSize: 12,
                      lineHeight: 1.6
                    }}>
                      {updateInfo.body.split('\n').map((line, i) => (
                        <div key={i}>{line || <br />}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {updateStatus === 'downloading' && (
              <Text><DownloadOutlined spin /> 正在下载更新...</Text>
            )}

            {updateStatus === 'installing' && (
              <Text><SyncOutlined spin /> 正在安装更新，即将重启...</Text>
            )}

            {updateStatus === 'error' && (
              <Alert
                message="更新检查失败"
                description={updateError}
                type="error"
                showIcon
                closable
                onClose={clearUpdateError}
              />
            )}
          </div>

          <Space direction="vertical" size="small">
            {updateStatus === 'idle' || updateStatus === 'error' || updateStatus === 'up_to_date' ? (
              <Button
                type="primary"
                icon={<SyncOutlined />}
                onClick={() => checkForUpdates()}
              >
                检查更新
              </Button>
            ) : null}

            {updateStatus === 'available' && (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => downloadAndInstallUpdate()}
                loading={false}
              >
                下载并安装更新
              </Button>
            )}
          </Space>
        </TabPane>
      </Tabs>
    </Drawer>
  )
}

export default SettingsPanel
