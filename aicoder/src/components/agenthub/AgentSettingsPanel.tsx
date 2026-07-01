import React, { useEffect, useState } from 'react'
import {
  Card,
  List,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Modal,
  Form,
  message,
  Popconfirm,
  Typography,
  Empty,
} from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useAgentHubStore, type AgentRole } from '../../stores/agentHubStore'

const { Text } = Typography

const AgentSettingsPanel: React.FC = () => {
  const { agentRoles, loadAgentRoles, saveAgentRole, deleteAgentRole } =
    useAgentHubStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadAgentRoles()
  }, [])

  const handleAdd = () => {
    setEditingRole(null)
    form.resetFields()
    form.setFieldsValue({ model: 'sonnet' })
    setModalOpen(true)
  }

  const handleEdit = (role: AgentRole) => {
    setEditingRole(role)
    form.setFieldsValue(role)
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const role: AgentRole = {
        id: editingRole?.id || values.id,
        name: values.name,
        description: values.description || '',
        prompt: values.prompt || '',
        model: values.model || 'sonnet',
        tags: values.tags || [],
      }
      await saveAgentRole(role)
      message.success(editingRole ? '角色已更新' : '角色已创建')
      setModalOpen(false)
      form.resetFields()
    } catch (e: any) {
      if (e.errorFields) return
      message.error(`保存失败: ${e}`)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteAgentRole(id)
      message.success('角色已删除')
    } catch (e: any) {
      message.error(`删除失败: ${e}`)
    }
  }

  return (
    <div className="agent-settings-panel">
      <Card
        title="🤖 Agent 角色管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加角色
          </Button>
        }
      >
        {agentRoles.length === 0 ? (
          <Empty description="暂无 Agent 角色，点击上方按钮添加" />
        ) : (
          <List
            dataSource={agentRoles}
            renderItem={(role) => (
              <List.Item
                actions={[
                  <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(role)}
                  />,
                  <Popconfirm
                    key="delete"
                    title="确定删除此角色？"
                    onConfirm={() => handleDelete(role.id)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{role.name}</Text>
                      <Tag>{role.id}</Tag>
                      <Tag color="blue">{role.model}</Tag>
                    </Space>
                  }
                  description={
                    <div>
                      {role.description && (
                        <Text type="secondary">{role.description}</Text>
                      )}
                      {role.tags.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          {role.tags.map((tag) => (
                            <Tag key={tag}>
                              {tag}
                            </Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title={editingRole ? '编辑 Agent 角色' : '添加 Agent 角色'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {!editingRole && (
            <Form.Item
              name="id"
              label="角色ID"
              rules={[{ required: true, message: '请输入角色ID' }]}
            >
              <Input placeholder="例如：frontend、backend、devops" />
            </Form.Item>
          )}

          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如：前端开发、后端开发" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="角色职责描述..." />
          </Form.Item>

          <Form.Item name="prompt" label="角色提示词">
            <Input.TextArea
              rows={4}
              placeholder="作为这个角色，你应该...（Claude 会收到这段提示词作为角色指令）"
            />
          </Form.Item>

          <Form.Item name="model" label="默认模型">
            <Select
              options={[
                { value: 'sonnet', label: 'Claude Sonnet' },
                { value: 'opus', label: 'Claude Opus' },
                { value: 'haiku', label: 'Claude Haiku' },
              ]}
            />
          </Form.Item>

          <Form.Item name="tags" label="技能标签">
            <Select mode="tags" placeholder="输入标签后回车" tokenSeparators={[',']} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AgentSettingsPanel
