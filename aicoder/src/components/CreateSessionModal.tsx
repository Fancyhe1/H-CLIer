import { useState, useEffect } from 'react'
import { Modal, Form, Input, Button, message, Space } from 'antd'
import { FolderOutlined, CodeOutlined, DesktopOutlined } from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useSessionStore } from '../stores/sessionStore'
import type { SessionType } from '../types/session'
import '../styles/CreateSessionModal.css'

interface CreateSessionModalProps {
  visible: boolean
  onClose: () => void
  sessionType: SessionType
  defaultProjectPath?: string
}

function CreateSessionModal({ visible, onClose, sessionType, defaultProjectPath }: CreateSessionModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [selectingFolder, setSelectingFolder] = useState(false)
  const [selectedPath, setSelectedPath] = useState('')
  const createSession = useSessionStore((state) => state.createSession)

  // 当默认路径变化时，更新表单
  useEffect(() => {
    if (visible && defaultProjectPath) {
      setSelectedPath(defaultProjectPath)
      form.setFieldsValue({ projectPath: defaultProjectPath })
    }
  }, [visible, defaultProjectPath, form])

  const handleSelectFolder = async () => {
    if (selectingFolder) return // 防止重复点击
    setSelectingFolder(true)
    try {
      const path = await invoke<string | null>('select_folder')
      if (path) {
        setSelectedPath(path)
        form.setFieldsValue({ projectPath: path })
      }
    } catch (err) {
      message.error('选择文件夹失败: ' + String(err))
    } finally {
      setSelectingFolder(false)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      const normalizedPath = values.projectPath.replace(/\\/g, '/')

      const session = await createSession({
        projectPath: normalizedPath,
        title: values.title,
        sessionType: sessionType,
      })

      if (session) {
        message.success('会话创建成功')
        form.resetFields()
        setSelectedPath('')
        onClose()
      }
    } catch (err) {
      message.error('创建会话失败: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    setSelectedPath('')
    onClose()
  }

  const modalTitle = sessionType === 'claude'
    ? (<><CodeOutlined /> 新建 Claude 会话</>)
    : (<><DesktopOutlined /> 新建终端会话</>)

  return (
    <Modal
      title={modalTitle}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="创建"
      cancelText="取消"
      width={500}
    >
      <Form form={form} layout="vertical" className="create-session-form">
        <Form.Item
          name="projectPath"
          label="项目路径"
          rules={[{ required: true, message: '请选择项目路径' }]}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="点击浏览选择文件夹"
              readOnly
              value={selectedPath}
            />
            <Button
              icon={<FolderOutlined />}
              onClick={handleSelectFolder}
              loading={selectingFolder}
              disabled={selectingFolder}
            >
              浏览
            </Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item
          name="title"
          label="会话标题（可选）"
        >
          <Input placeholder="留空则自动生成" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreateSessionModal
