import React, { useEffect, useState } from 'react'
import {
  Card,
  List,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Typography,
  Empty,
  Divider,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { useAgentHubStore, type Workflow, type WorkflowNode, type WorkflowEdge, type Task } from '../../stores/agentHubStore'
import { useSessionStore } from '../../stores/sessionStore'

const { Text, Paragraph } = Typography

const WorkflowPanel: React.FC = () => {
  const {
    workflows,
    agentRoles,
    loadWorkflows,
    loadAgentRoles,
    saveWorkflow,
    deleteWorkflow,
    startWorkflow,
  } = useAgentHubStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null)
  const [form] = Form.useForm()
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [edges, setEdges] = useState<WorkflowEdge[]>([])
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [runWorkflowId, setRunWorkflowId] = useState<string | null>(null)
  const [runVariables, setRunVariables] = useState<Record<string, string>>({})

  useEffect(() => {
    loadWorkflows()
    loadAgentRoles()
  }, [])

  const handleAdd = () => {
    setEditingWorkflow(null)
    form.resetFields()
    setNodes([])
    setEdges([])
    setModalOpen(true)
  }

  const handleEdit = (workflow: Workflow) => {
    setEditingWorkflow(workflow)
    form.setFieldsValue({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
    })
    setNodes([...workflow.nodes])
    setEdges([...workflow.edges])
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const now = new Date().toISOString()
      const workflow: Workflow = {
        id: editingWorkflow?.id || values.id,
        name: values.name,
        description: values.description || '',
        nodes,
        edges,
        variables: {},
        created: editingWorkflow?.created || now,
        updated: now,
      }
      await saveWorkflow(workflow)
      message.success(editingWorkflow ? '工作流已更新' : '工作流已创建')
      setModalOpen(false)
    } catch (e: any) {
      if (e.errorFields) return
      message.error(`保存失败: ${e}`)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflow(id)
      message.success('工作流已删除')
    } catch (e: any) {
      message.error(`删除失败: ${e}`)
    }
  }

  const handleRunClick = (workflow: Workflow) => {
    setRunWorkflowId(workflow.id)
    // 提取模板变量
    const vars: Record<string, string> = {}
    workflow.nodes.forEach((node) => {
      const matches = node.taskTemplate.match(/\{(\w+)\}/g)
      if (matches) {
        matches.forEach((m) => {
          const key = m.slice(1, -1)
          if (!vars[key]) vars[key] = ''
        })
      }
    })
    setRunVariables(vars)
    setRunModalOpen(true)
  }

  const handleRunConfirm = async () => {
    if (!runWorkflowId) return
    try {
      console.log('[Workflow] 启动工作流:', runWorkflowId, '变量:', runVariables)

      // 1. 启动工作流（创建任务链 + 标记第一个为 ready）
      const tasks = await startWorkflow(runWorkflowId, runVariables)
      console.log('[Workflow] 创建的任务:', tasks)
      message.success(`工作流已启动，创建了 ${tasks.length} 个任务`)

      // 2. 找到 ready 状态的任务，自动创建会话
      const readyTask = tasks.find(t => t.status === 'ready')
      console.log('[Workflow] Ready 任务:', readyTask)

      if (readyTask) {
        await autoCreateSession(readyTask)
      } else {
        console.warn('[Workflow] 没有找到 ready 状态的任务')
      }

      setRunModalOpen(false)
    } catch (e: any) {
      console.error('[Workflow] 启动失败:', e)
      message.error(`启动工作流失败: ${e}`)
    }
  }

  // 自动为任务创建会话并注入上下文
  const autoCreateSession = async (task: Task) => {
    try {
      const { currentProjectPath } = useAgentHubStore.getState()
      const { fetchSessions, setActiveSession } = useSessionStore.getState()

      console.log('[Workflow] 自动创建会话, task:', task.id, 'projectPath:', currentProjectPath, 'agent:', task.assignedAgent)

      const projectPath = currentProjectPath || ''
      if (!projectPath) {
        message.warning('未检测到项目路径')
        return
      }

      // 1. 构建上下文（包含 agent 角色信息）
      const context = await invoke<string>('agenthub_build_context', {
        taskId: task.id,
        agentRoleId: task.assignedAgent || null,
        brainSections: null, // 注入所有 brain 内容
      })

      // 2. 创建会话
      const session = await invoke<{ id: string; title: string }>('create_session', {
        projectPath,
        title: `Workflow: ${task.title}`,
        sessionType: 'claude',
      })

      // 3. 更新 agent 记录的 sessionId
      const { activeAgents, updateAgentSession } = useAgentHubStore.getState()
      const agent = activeAgents.find(a => a.taskId === task.id)
      if (agent) {
        await updateAgentSession(agent.agentId, session.id)
      }

      // 4. 刷新会话列表并切换
      await fetchSessions()
      setActiveSession(session.id)

      // 5. 存储上下文，等待 PTY 就绪后注入
      sessionStorage.setItem(`agenthub-context-${session.id}`, context)
      // 存储 agent 名称（用于 --agent 参数）
      if (task.assignedAgent) {
        sessionStorage.setItem(`agenthub-agent-${session.id}`, task.assignedAgent)
      }

      message.info(`已为任务 ${task.id} 创建会话，等待 Claude 启动...`)
    } catch (e: any) {
      message.error(`创建会话失败: ${e}`)
    }
  }

  const addNode = () => {
    const id = `node-${Date.now()}`
    setNodes([...nodes, {
      id,
      role: agentRoles[0]?.name || 'default',
      taskTemplate: '',
      description: '',
      autoStart: false,
    }])
  }

  const updateNode = (index: number, updates: Partial<WorkflowNode>) => {
    const newNodes = [...nodes]
    newNodes[index] = { ...newNodes[index], ...updates }
    setNodes(newNodes)
  }

  const removeNode = (index: number) => {
    const nodeId = nodes[index].id
    setNodes(nodes.filter((_, i) => i !== index))
    setEdges(edges.filter((e) => e.from !== nodeId && e.to !== nodeId))
  }

  const addEdge = () => {
    if (nodes.length < 2) {
      message.warning('至少需要两个节点才能添加连线')
      return
    }
    setEdges([...edges, {
      from: nodes[0].id,
      to: nodes[1].id,
      action: 'delegate',
      condition: 'completed',
      description: '',
    }])
  }

  const updateEdge = (index: number, updates: Partial<WorkflowEdge>) => {
    const newEdges = [...edges]
    newEdges[index] = { ...newEdges[index], ...updates }
    setEdges(newEdges)
  }

  const removeEdge = (index: number) => {
    setEdges(edges.filter((_, i) => i !== index))
  }

  return (
    <div className="workflow-panel">
      <Card
        title="工作流"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新建工作流
          </Button>
        }
      >
        {workflows.length === 0 ? (
          <Empty description="暂无工作流" />
        ) : (
          <List
            dataSource={workflows}
            renderItem={(workflow) => (
              <List.Item
                actions={[
                  <Tooltip title="运行" key="run">
                    <Button
                      type="text"
                      icon={<PlayCircleOutlined />}
                      onClick={() => handleRunClick(workflow)}
                    />
                  </Tooltip>,
                  <Tooltip title="编辑" key="edit">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(workflow)}
                    />
                  </Tooltip>,
                  <Popconfirm
                    key="delete"
                    title="确定删除此工作流？"
                    onConfirm={() => handleDelete(workflow.id)}
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
                      <Text strong>{workflow.name}</Text>
                      <Tag>{workflow.id}</Tag>
                      <Tag>{workflow.nodes.length} 节点</Tag>
                      <Tag>{workflow.edges.length} 连线</Tag>
                    </Space>
                  }
                  description={
                    <div>
                      {workflow.description && (
                        <Paragraph type="secondary" ellipsis={{ rows: 1 }}>
                          {workflow.description}
                        </Paragraph>
                      )}
                      <Space size={4}>
                        {workflow.nodes.map((node) => (
                          <Tag key={node.id} color="blue">{node.role}</Tag>
                        ))}
                      </Space>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 工作流编辑弹窗 */}
      <Modal
        title={editingWorkflow ? '编辑工作流' : '新建工作流'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={600}
        maskClosable={false}
      >
        <Form form={form} layout="vertical">
          {!editingWorkflow && (
            <Form.Item name="id" label="工作流ID" rules={[{ required: true }]}>
              <Input placeholder="例如：feature-dev、bug-fix" />
            </Form.Item>
          )}
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="工作流名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="工作流描述..." />
          </Form.Item>
        </Form>

        <Divider />

        {/* 节点列表 */}
        <div style={{ marginBottom: 12 }}>
          <Space>
            <Text strong>节点（任务步骤）</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={addNode}>
              添加节点
            </Button>
          </Space>
        </div>
        {nodes.map((node, i) => (
          <Card key={node.id} size="small" style={{ marginBottom: 8 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Input
                  size="small"
                  placeholder="节点ID"
                  value={node.id}
                  onChange={(e) => updateNode(i, { id: e.target.value })}
                  style={{ width: 100 }}
                />
                <Select
                  size="small"
                  value={node.role}
                  onChange={(v) => updateNode(i, { role: v })}
                  style={{ width: 120 }}
                  options={agentRoles.map((r) => ({ value: r.name, label: r.name }))}
                />
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeNode(i)}
                />
              </Space>
              <Input
                size="small"
                placeholder="任务模板，例如：实现 {feature_name}"
                value={node.taskTemplate}
                onChange={(e) => updateNode(i, { taskTemplate: e.target.value })}
              />
            </Space>
          </Card>
        ))}

        <Divider />

        {/* 连线列表 */}
        <div style={{ marginBottom: 12 }}>
          <Space>
            <Text strong>连线（流转规则）</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={addEdge}>
              添加连线
            </Button>
          </Space>
        </div>
        {edges.map((edge, i) => (
          <Card key={i} size="small" style={{ marginBottom: 8 }}>
            <Space>
              <Select
                size="small"
                value={edge.from}
                onChange={(v) => updateEdge(i, { from: v })}
                style={{ width: 120 }}
                options={nodes.map((n) => ({ value: n.id, label: n.taskTemplate || n.id }))}
              />
              <NodeIndexOutlined />
              <Select
                size="small"
                value={edge.to}
                onChange={(v) => updateEdge(i, { to: v })}
                style={{ width: 120 }}
                options={nodes.map((n) => ({ value: n.id, label: n.taskTemplate || n.id }))}
              />
              <Select
                size="small"
                value={edge.action}
                onChange={(v) => updateEdge(i, { action: v })}
                style={{ width: 80 }}
                options={[
                  { value: 'delegate', label: '委派' },
                  { value: 'review', label: '审查' },
                  { value: 'help', label: '求助' },
                  { value: 'handoff', label: '交接' },
                ]}
              />
              <Select
                size="small"
                value={edge.condition}
                onChange={(v) => updateEdge(i, { condition: v })}
                style={{ width: 100 }}
                options={[
                  { value: 'completed', label: '完成时' },
                  { value: 'failed', label: '失败时' },
                  { value: 'needs_changes', label: '需修改' },
                ]}
              />
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeEdge(i)}
              />
            </Space>
          </Card>
        ))}
      </Modal>

      {/* 运行工作流弹窗 */}
      <Modal
        title="运行工作流"
        open={runModalOpen}
        onOk={handleRunConfirm}
        onCancel={() => setRunModalOpen(false)}
        okText="创建任务"
        cancelText="取消"
        maskClosable={false}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">填写模板变量：</Text>
        </div>
        {Object.entries(runVariables).map(([key, value]) => (
          <Form.Item key={key} label={key}>
            <Input
              value={value}
              onChange={(e) => setRunVariables({ ...runVariables, [key]: e.target.value })}
              placeholder={`输入 ${key} 的值`}
            />
          </Form.Item>
        ))}
        {Object.keys(runVariables).length === 0 && (
          <Text type="secondary">此工作流没有模板变量</Text>
        )}
      </Modal>
    </div>
  )
}

export default WorkflowPanel
