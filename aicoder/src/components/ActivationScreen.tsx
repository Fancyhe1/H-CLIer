import { useState } from 'react'
import { Modal, Input, Button, Typography, Alert, Spin, message } from 'antd'
import { KeyOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'

const { Title, Text } = Typography

interface LicenseState {
  is_activated: boolean
  invitation_code: string | null
  machine_id: string
  activated_at: string | null
  last_validated_at: string | null
  expires_at: string | null
  license_tier: string | null
  offline_grace_days: number
}

interface ActivationScreenProps {
  open: boolean
  onSuccess: () => void
}

export function ActivationScreen({ open, onSuccess }: ActivationScreenProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleActivate = async () => {
    if (!code.trim()) {
      setError('请输入邀请码')
      return
    }

    // Format code to remove spaces and uppercase
    const formattedCode = code.trim().toUpperCase()

    setLoading(true)
    setError(null)

    try {
      await invoke<LicenseState>('activate_license', { code: formattedCode })
      message.success('激活成功')
      onSuccess()
    } catch (err) {
      console.error('Activation failed:', err)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      closable={false}
      maskClosable={false}
      footer={null}
      centered
      width={400}
      styles={{ body: { padding: '40px 24px' } }}
    >
      <div style={{ textAlign: 'center', padding: '20px 0 40px' }}>
        <SafetyCertificateOutlined style={{ fontSize: 64, color: '#1677ff' }} />
        <Title level={3} style={{ marginTop: 16, marginBottom: 8 }}>激活 H CLIer</Title>
        <Text type="secondary">
          请输入您的邀请码以激活应用
        </Text>
      </div>

      <Input
        size="large"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        prefix={<KeyOutlined />}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        style={{ marginBottom: 16, textAlign: 'center', fontSize: 16, letterSpacing: 2 }}
        onPressEnter={handleActivate}
        maxLength={19}
      />

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Button
        type="primary"
        size="large"
        block
        loading={loading}
        onClick={handleActivate}
        style={{ height: 44 }}
      >
        激活
      </Button>

      <Text type="secondary" style={{ display: 'block', marginTop: 16, textAlign: 'center' }}>
        激活后将绑定此设备
      </Text>

      {loading && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">
            <Spin size="small" style={{ marginRight: 8 }} />
            正在验证邀请码...
          </Text>
        </div>
      )}
    </Modal>
  )
}

export default ActivationScreen
