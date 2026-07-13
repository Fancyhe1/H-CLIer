import { useState } from 'react'
import { Modal, Button, Steps, Typography, Space, Tag, Result } from 'antd'
import {
  RocketOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { useSettingsStore } from '../stores/settingsStore'

const { Title, Text, Paragraph } = Typography

interface OnboardingModalProps {
  visible: boolean
  onClose: () => void
  claudeInstalled: boolean | null
}

// 默认快捷键列表
const defaultShortcuts = [
  { keys: 'Ctrl+K', desc: '命令面板', category: '全局' },
  { keys: 'Ctrl+N', desc: '新建会话', category: '全局' },
  { keys: 'Ctrl+W', desc: '关闭会话', category: '会话' },
  { keys: 'Ctrl+,', desc: '打开设置', category: '全局' },
  { keys: 'Ctrl+Shift+T', desc: 'Token 统计', category: '全局' },
  { keys: 'Ctrl+Shift+P', desc: '窗口置顶', category: '全局' },
  { keys: 'Ctrl+PageUp/Down', desc: '切换标签', category: '会话' },
]

function OnboardingModal({ visible, onClose, claudeInstalled }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const { config, updateGeneralConfig } = useSettingsStore()

  const handleFinish = () => {
    updateGeneralConfig({
      ...config.general,
      has_completed_onboarding: true,
    })
    onClose()
  }

  const handleSkip = () => {
    updateGeneralConfig({
      ...config.general,
      has_completed_onboarding: true,
    })
    onClose()
  }

  const steps = [
    {
      title: '欢迎',
      icon: <RocketOutlined />,
      content: (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Title level={3} style={{ marginBottom: 8 }}>
            欢迎使用 H CLIer
          </Title>
          <Paragraph type="secondary" style={{ fontSize: 16, maxWidth: 500, margin: '0 auto' }}>
            H CLIer 是一个 Claude Code 会话管理与工作台，帮助你更高效地使用 Claude CLI。
          </Paragraph>
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 48 }}>
            <div>
              <ThunderboltOutlined style={{ fontSize: 32, color: '#1677ff', marginBottom: 8 }} />
              <div><Text strong>多会话管理</Text></div>
              <Text type="secondary">同时管理多个 Claude 会话</Text>
            </div>
            <div>
              <CodeOutlined style={{ fontSize: 32, color: '#1677ff', marginBottom: 8 }} />
              <div><Text strong>终端集成</Text></div>
              <Text type="secondary">内置终端与 Claude 无缝协作</Text>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '环境检测',
      icon: <CodeOutlined />,
      content: (
        <div style={{ padding: '20px 0' }}>
          <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>
            Claude CLI 环境检测
          </Title>
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8,
            padding: '24px 32px',
            maxWidth: 450,
            margin: '0 auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text>Claude CLI</Text>
              {claudeInstalled === null ? (
                <Tag color="processing">检测中...</Tag>
              ) : claudeInstalled ? (
                <Tag icon={<CheckCircleOutlined />} color="success">已安装</Tag>
              ) : (
                <Tag color="warning">未检测到</Tag>
              )}
            </div>
            {claudeInstalled === false && (
              <Paragraph type="warning" style={{ margin: 0 }}>
                未检测到 Claude CLI。请先安装 Claude Code，或在设置中配置 CLI 路径。
                你可以在稍后的 设置 → Claude Code 中进行配置。
              </Paragraph>
            )}
            {claudeInstalled && (
              <Paragraph type="success" style={{ margin: 0 }}>
                Claude CLI 已就绪，可以开始使用了！
              </Paragraph>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '快捷键',
      icon: <ThunderboltOutlined />,
      content: (
        <div style={{ padding: '20px 0' }}>
          <Title level={4} style={{ textAlign: 'center', marginBottom: 8 }}>
            快捷键速览
          </Title>
          <Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 24 }}>
            按 <Tag color="blue">Ctrl+K</Tag> 打开命令面板，随时发现所有功能
          </Paragraph>
          <div style={{ maxWidth: 420, margin: '0 auto' }}>
            {defaultShortcuts.map((s) => (
              <div
                key={s.keys}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Space>
                  <Tag style={{ fontFamily: 'monospace', minWidth: 120, textAlign: 'center' }}>
                    {s.keys}
                  </Tag>
                  <Text>{s.desc}</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>{s.category}</Text>
              </div>
            ))}
          </div>
          <Paragraph type="secondary" style={{ textAlign: 'center', marginTop: 16, fontSize: 12 }}>
            所有快捷键可在 设置 → 快捷键 中自定义
          </Paragraph>
        </div>
      ),
    },
    {
      title: '完成',
      icon: <CheckCircleOutlined />,
      content: (
        <Result
          status="success"
          title="准备就绪！"
          subTitle="现在可以开始使用 H CLIer 管理你的 Claude Code 会话了。"
          extra={[
            <Button type="primary" key="start" onClick={handleFinish}>
              开始使用
            </Button>,
          ]}
        />
      ),
    },
  ]

  return (
    <Modal
      open={visible}
      footer={null}
      closable={false}
      width={600}
      centered
      styles={{
        body: { padding: '24px 24px 16px' },
      }}
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={steps.map((s) => ({ title: s.title, icon: s.icon }))}
      />
      <div style={{ minHeight: 240 }}>
        {steps[currentStep].content}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Button onClick={handleSkip} type="text" size="small">
          跳过引导
        </Button>
        <Space>
          {currentStep > 0 && (
            <Button onClick={() => setCurrentStep(currentStep - 1)}>
              上一步
            </Button>
          )}
          {currentStep < steps.length - 1 && (
            <Button type="primary" onClick={() => setCurrentStep(currentStep + 1)}>
              下一步
            </Button>
          )}
        </Space>
      </div>
    </Modal>
  )
}

export default OnboardingModal
