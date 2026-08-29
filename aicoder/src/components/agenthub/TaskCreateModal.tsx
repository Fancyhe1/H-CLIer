import React, { useState } from 'react'
import { Modal, Form, Input, Select, message } from 'antd'
import { useAgentHubStore } from '../../stores/agentHubStore'

interface TaskCreateModalProps {
  open: boolean
  onClose: () => void
}

const TaskCreateModal: React.FC<TaskCreateModalProps> = ({ open, onClose }) => {
  const { createTask, tasks } = useAgentHubStore()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      // 自动生成任务 ID
      const existingIds = tasks.map((t) => t.id)
      let nextNum = 1
      while (existingIds.includes(`T${String(nextNum).padStart(3, '0')}`)) {
        nextNum++
      }
      const taskId = `T${String(nextNum).padStart(3, '0')}`

      await createTask({
        id: taskId,
        title: values.title,
        description: values.description || '',
        priority: values.priority || 'medium',
        tags: values.tags || [],
      })

      message.success(`任务 ${taskId} 创建成功`)
      form.resetFields()
      onClose()
    } catch (e: any) {
      if (e.errorFields) {
        // 表单验证错误，不处理
        return
      }
      message.error(`创建失败: ${e}`)
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
      title="新建任务"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="创建"
      cancelText="取消"
      destroyOnClose
      maskClosable={false}
    >
      <Form form={form} layout="vertical" initialValues={{ priority: 'medium' }}>
        <Form.Item
          name="title"
          label="任务标题"
          rules={[{ required: true, message: '请输入任务标题' }]}
        >
          <Input placeholder="例如：实现用户登录功能" />
        </Form.Item>

        <Form.Item name="description" label="任务描述">
          <Input.TextArea rows={3} placeholder="详细描述任务需求..." />
        </Form.Item>

        <Form.Item name="priority" label="优先级">
          <Select
            options={[
              { value: 'low', label: '低' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' },
              { value: 'critical', label: '紧急' },
            ]}
          />
        </Form.Item>

        <Form.Item name="tags" label="标签">
          <Select
            mode="tags"
            placeholder="输入标签后回车"
            tokenSeparators={[',']}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default TaskCreateModal
