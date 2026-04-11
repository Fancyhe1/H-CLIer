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
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  MoonOutlined,
  SunOutlined,
  ClearOutlined,
  CodeOutlined,
  GlobalOutlined,
  FontSizeOutlined,
  FolderOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import '../styles/SettingsPanel.css'

const { TabPane } = Tabs
const { Text, Title } = Typography

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
    loadConfig,
    checkClaudeInstallation,
    getClaudeVersion,
    updateClaudeConfig,
    updateGeneralConfig,
    setDefaultExportPath,
  } = useSettingsStore()

  // 加载配置
  useEffect(() => {
    if (visible) {
      loadConfig()
      checkClaudeInstallation()
      getClaudeVersion()
    }
  }, [visible])

  // 同步表单数据
  useEffect(() => {
    if (config) {
      claudeForm.setFieldsValue({
        cli_path: config.claude.cli_path || '',
        default_args: config.claude.default_args.join(' '),
      })
      generalForm.setFieldsValue({
        terminal_font_size: config.general.terminal_font_size,
        auto_start_claude: config.general.auto_start_claude,
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
        auto_start_claude: values.auto_start_claude,
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
    localStorage.removeItem('aicoder_token_stats')
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
          >
            <Title level={5}>外观</Title>
            <Form.Item label="主题" name="theme" initialValue={theme}>
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

            <Divider />

            <Title level={5}>Claude Code</Title>
            <Form.Item
              name="auto_start_claude"
              valuePropName="checked"
            >
              <Switch
                checkedChildren="开启"
                unCheckedChildren="关闭"
              />
              <Text type="secondary" style={{ marginLeft: 8 }}>
                会话启动时自动运行 Claude Code
              </Text>
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
            style={{ marginBottom: 24 }}
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
                  <p style={{ marginTop: 8 }}>
                    安装完成后点击"重新检测"按钮。
                  </p>
                </div>
              }
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
          )}

          <Form
            form={claudeForm}
            layout="vertical"
            onFinish={handleSaveClaudeConfig}
          >
            <Title level={5}>高级设置</Title>
            <Divider style={{ margin: '12px 0' }} />

            <Form.Item
              name="cli_path"
              label="自定义 CLI 路径"
              help="如果 Claude 不在系统 PATH 中，可指定完整路径"
            >
              <Input placeholder="例如: C:\\Users\\name\\AppData\\Roaming\\npm\\claude.cmd" />
            </Form.Item>

            <Form.Item
              name="default_args"
              label="默认启动参数"
              help="启动 Claude 时自动添加的参数，用空格分隔"
            >
              <Input placeholder="例如: --verbose --model claude-3-opus-20240229" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={isLoading}>
                保存配置
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        {/* API 设置 */}
        <TabPane
          tab={
            <span>
              <FontSizeOutlined />
              API 配置
            </span>
          }
          key="api"
        >
          <Alert
            message="API 配置用于中转站或自定义端点"
            description="默认情况下 Claude Code 使用官方 API，无需配置。仅在需要使用中转站或自定义端点时开启。"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
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
              <Switch
                checkedChildren="开启"
                unCheckedChildren="关闭"
              />
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
                      rules={[
                        { required: true, message: '请输入 API 基础 URL' },
                      ]}
                    >
                      <Input placeholder="https://api.example.com/v1" />
                    </Form.Item>

                    <Form.Item
                      name="api_key"
                      label="API Key"
                      rules={[
                        { required: true, message: '请输入 API Key' },
                      ]}
                    >
                      <Input.Password placeholder="sk-..." />
                    </Form.Item>
                  </>
                ) : null
              }
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={isLoading}>
                保存 API 配置
              </Button>
            </Form.Item>
          </Form>
        </TabPane>
      </Tabs>
    </Drawer>
  )
}

export default SettingsPanel
