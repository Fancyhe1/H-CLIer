import { useState, useEffect } from 'react'
import { Modal, Form, Input, message } from 'antd'
import { ImportOutlined } from '@ant-design/icons'
import { useSessionStore } from '../stores/sessionStore'

interface ImportSessionByIdModalProps {
  visible: boolean
  onClose: () => void
  projectPath: string
}

function ImportSessionByIdModal({ visible, onClose, projectPath }: ImportSessionByIdModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const createSession = useSessionStore((state) => state.createSession)

  useEffect(() => {
    if (visible) {
      form.resetFields()
    }
  }, [visible, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      const session = await createSession({
        projectPath: projectPath,
        title: values.sessionName,
        sessionType: 'claude',
        cliSessionId: values.sessionId,
      })

      if (session) {
        message.success('会话导入成功')
        form.resetFields()
        onClose()
      }
    } catch (err) {
      message.error('导入失败: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    onClose()
  }

  return (
    <Modal
      title={<><ImportOutlined /> 通过编号导入会话</>}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="导入"
      cancelText="取消"
      width={500}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="sessionId"
          label="会话编号"
          rules={[{ required: true, message: '请输入 Claude CLI 会话编号' }]}
        >
          <Input placeholder="输入 Claude CLI 会话编号（如 uuid）" />
        </Form.Item>

        <Form.Item
          name="sessionName"
          label="会话名称"
          rules={[{ required: true, message: '请输入会话名称' }]}
        >
          <Input placeholder="为导入的会话命名" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ImportSessionByIdModal
