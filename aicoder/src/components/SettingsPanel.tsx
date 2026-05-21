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
  MoonOutlined,
  SunOutlined,
  ClearOutlined,
  CodeOutlined,
  GlobalOutlined,
  FolderOutlined,
  SyncOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  SettingOutlined,
  ApiOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
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
  } = useSettingsStore()

  // 配置已在 App 启动时加载和检测，这里不需要再做

  // 加载应用版本
  useEffect(() => {
    getAppVersion()
  }, [])

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
                  <Space>
                    <span>Claude Code 安装状态:</span>
                    {claudeInstalled === null ? (
                      <Tag>检测中...</Tag>
                    ) : claudeInstalled ? (
                      <Tag icon={<CheckCircleOutlined />} color="success">
                        已安装 {claudeVersion && `(${claudeVersion})`}
                      </Tag>
                    ) : (
                      <Tag icon={<CloseCircleOutlined />} color="error">
                        未安装
                      </Tag>
                    )}
                  </Space>
                }
                type={claudeInstalled ? 'success' : 'warning'}
                action={
                  <Button size="small" onClick={handleRecheckClaude}>
                    重新检测
                  </Button>
                }
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

              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  当前暂无已配置的 MCP Server
                </Text>
                <Button type="dashed" icon={<PlusOutlined />} block>
                  添加 MCP Server
                </Button>
              </div>

              <List
                size="small"
                header={<Text strong>已配置的 Server</Text>}
                dataSource={[]}
                renderItem={(item: any) => (
                  <List.Item actions={[<Button type="text" size="small" icon={<DeleteOutlined />}>删除</Button>]}>
                    {item.name}
                  </List.Item>
                )}
              />
            </Panel>

            {/* Skills */}
            <Panel
              header={
                <span>
                  <CodeOutlined style={{ marginRight: 8 }} />
                  <Text strong>Skills</Text>
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

              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  已安装的 Skills
                </Text>
                <List
                  size="small"
                  dataSource={[
                    { name: 'commit', description: 'Git 提交辅助' },
                    { name: 'review', description: '代码审查助手' },
                  ]}
                  renderItem={(item: { name: string; description: string }) => (
                    <List.Item
                      actions={[
                        <Button type="text" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                      ]}
                    >
                      <List.Item.Meta
                        title={<Text>{item.name}</Text>}
                        description={item.description}
                      />
                    </List.Item>
                  )}
                />
              </div>

              <Button type="dashed" icon={<PlusOutlined />} block>
                添加 Skill
              </Button>
            </Panel>

            {/* 钩子 */}
            <Panel
              header={
                <span>
                  <RocketOutlined style={{ marginRight: 8 }} />
                  <Text strong>钩子</Text>
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

              <Form layout="vertical">
                <Form.Item label="会话开始前">
                  <Input placeholder="scripts/before-session.sh" />
                </Form.Item>

                <Form.Item label="会话结束后">
                  <Input placeholder="scripts/after-session.sh" />
                </Form.Item>

                <Form.Item label="命令执行前">
                  <Input placeholder="scripts/before-command.sh" />
                </Form.Item>

                <Form.Item label="命令执行后">
                  <Input placeholder="scripts/after-command.sh" />
                </Form.Item>

                <Button type="primary" htmlType="submit" loading={isLoading}>
                  保存钩子配置
                </Button>
              </Form>
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
            <Text type="secondary">AI 驱动的命令行编程助手</Text>
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
                <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
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
                      background: '#fafafa',
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
