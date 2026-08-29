use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use chrono::Utc;

// ============================================================
// 数据结构定义（与 CLI/Web 面板共享的格式）
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Assigned,
    Running,
    Ready,
    Done,
    Failed,
    Blocked,
}

impl Default for TaskStatus {
    fn default() -> Self {
        Self::Pending
    }
}

impl TaskStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Pending => "pending",
            Self::Assigned => "assigned",
            Self::Running => "running",
            Self::Ready => "ready",
            Self::Done => "done",
            Self::Failed => "failed",
            Self::Blocked => "blocked",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "assigned" => Self::Assigned,
            "running" => Self::Running,
            "ready" => Self::Ready,
            "done" => Self::Done,
            "failed" => Self::Failed,
            "blocked" => Self::Blocked,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Medium,
    High,
    Critical,
}

impl Default for Priority {
    fn default() -> Self {
        Self::Medium
    }
}

impl Priority {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "low" => Self::Low,
            "high" => Self::High,
            "critical" => Self::Critical,
            _ => Self::Medium,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subtask {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub status: TaskStatus,
    #[serde(default)]
    pub priority: Priority,
    #[serde(default)]
    pub assigned_agent: Option<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub subtasks: Vec<Subtask>,
    pub created: String,
    #[serde(default)]
    pub updated: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub result: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub retry_count: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdate {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<TaskStatus>,
    #[serde(default)]
    pub priority: Option<Priority>,
    #[serde(default)]
    pub assigned_agent: Option<Option<String>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub result: Option<Option<String>>,
    #[serde(default)]
    pub error: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRole {
    #[serde(default)]
    pub id: String,  // 兼容旧数据，新数据用 name 作为标识
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn default_model() -> String {
    "sonnet".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveAgent {
    pub agent_id: String,
    pub role: String,
    pub task_id: String,
    #[serde(default)]
    pub session_id: Option<String>,
    pub started_at: String,
    pub last_heartbeat: String,
    #[serde(default = "default_agent_status")]
    pub status: String,
    #[serde(default)]
    pub current_action: String,
    #[serde(default)]
    pub pid: Option<u32>,
}

fn default_agent_status() -> String {
    "running".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainMeta {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tech_stack: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub repo_path: String,
    #[serde(default = "default_model")]
    pub default_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubEvent {
    pub ts: String,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub files_changed: Option<Vec<String>>,
}

// YAML 文件的顶层结构
#[derive(Debug, Clone, Serialize, Deserialize)]
struct TasksFile {
    version: u32,
    #[serde(default)]
    tasks: Vec<Task>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AgentsFile {
    #[serde(default)]
    agents: Vec<AgentRole>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub action: String,  // delegate, review, help, handoff, notify, decision
    pub content: String,
    #[serde(default)]
    pub context: Option<serde_json::Value>,
    pub ts: String,
    #[serde(default)]
    pub read: bool,
}

// ============================================================
// 工作流定义
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNode {
    pub id: String,
    pub role: String,           // Agent 角色名称
    pub task_template: String,  // 任务模板，支持 {variable} 占位符
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub auto_start: bool,       // 是否自动启动
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEdge {
    pub from: String,           // 源节点 ID
    pub to: String,             // 目标节点 ID
    pub action: String,         // 动作类型：review, delegate, help, handoff
    pub condition: String,      // 触发条件：completed, failed, needs_changes
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub nodes: Vec<WorkflowNode>,
    #[serde(default)]
    pub edges: Vec<WorkflowEdge>,
    #[serde(default)]
    pub variables: std::collections::HashMap<String, String>,  // 模板变量
    pub created: String,
    #[serde(default)]
    pub updated: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkflowsFile {
    version: u32,
    #[serde(default)]
    workflows: Vec<Workflow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_id: String,
    pub status: String,         // running, completed, failed
    pub started_at: String,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub node_states: std::collections::HashMap<String, String>,  // node_id -> status
    #[serde(default)]
    pub variables: std::collections::HashMap<String, String>,    // 运行时变量
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ActiveAgentsFile {
    #[serde(default)]
    active: Vec<ActiveAgent>,
}

// ============================================================
// AgentHubManager — 核心管理器
// ============================================================

pub struct AgentHubManager {
    hub_path: Option<PathBuf>,
    global_config_path: Option<PathBuf>,  // 全局配置目录（存储共享的 agent 角色）
}

impl AgentHubManager {
    pub fn new() -> Self {
        Self { hub_path: None, global_config_path: None }
    }

    /// 设置全局配置目录
    pub fn set_global_config_path(&mut self, path: PathBuf) {
        self.global_config_path = Some(path);
    }

    /// 初始化 AgentHub 目录结构
    pub fn init(&mut self, project_path: &Path) -> Result<(), String> {
        let hub_path = project_path.join(".agent-hub");

        // 创建目录结构
        let dirs = [
            hub_path.join("brain").join("state"),
            hub_path.join("tasks").join("archive"),
            hub_path.join("agents").join("logs"),
            hub_path.join("state"),
        ];
        for dir in &dirs {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("创建目录失败 {}: {}", dir.display(), e))?;
        }

        // 创建默认 tasks.yaml（如果不存在）
        let tasks_file = hub_path.join("tasks").join("tasks.yaml");
        if !tasks_file.exists() {
            let default_tasks = TasksFile {
                version: 1,
                tasks: vec![],
            };
            let yaml = serde_yaml::to_string(&default_tasks)
                .map_err(|e| format!("序列化 tasks.yaml 失败: {}", e))?;
            std::fs::write(&tasks_file, yaml)
                .map_err(|e| format!("写入 tasks.yaml 失败: {}", e))?;
        }

        // 创建默认 registry.yaml（如果不存在）
        let registry_file = hub_path.join("agents").join("registry.yaml");
        if !registry_file.exists() {
            let default_agents = AgentsFile { agents: vec![] };
            let yaml = serde_yaml::to_string(&default_agents)
                .map_err(|e| format!("序列化 registry.yaml 失败: {}", e))?;
            std::fs::write(&registry_file, yaml)
                .map_err(|e| format!("写入 registry.yaml 失败: {}", e))?;
        }

        // 创建默认 active-agents.yaml（如果不存在）
        let active_file = hub_path.join("state").join("active-agents.yaml");
        if !active_file.exists() {
            let default_active = ActiveAgentsFile { active: vec![] };
            let yaml = serde_yaml::to_string(&default_active)
                .map_err(|e| format!("序列化 active-agents.yaml 失败: {}", e))?;
            std::fs::write(&active_file, yaml)
                .map_err(|e| format!("写入 active-agents.yaml 失败: {}", e))?;
        }

        // 创建默认 config.yaml（如果不存在）
        let config_file = hub_path.join("config.yaml");
        if !config_file.exists() {
            let default_config = format!(
                "# AgentHub 配置\nversion: 1\ndefault_model: sonnet\nheartbeat_interval: 30\n"
            );
            std::fs::write(&config_file, default_config)
                .map_err(|e| format!("写入 config.yaml 失败: {}", e))?;
        }

        // 创建默认 brain meta.yaml（如果不存在）
        let brain_meta_file = hub_path.join("brain").join("meta.yaml");
        if !brain_meta_file.exists() {
            let project_name = project_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let default_meta = BrainMeta {
                name: project_name,
                description: String::new(),
                tech_stack: std::collections::HashMap::new(),
                repo_path: project_path.to_string_lossy().to_string(),
                default_model: "sonnet".to_string(),
            };
            let yaml = serde_yaml::to_string(&default_meta)
                .map_err(|e| format!("序列化 meta.yaml 失败: {}", e))?;
            std::fs::write(&brain_meta_file, yaml)
                .map_err(|e| format!("写入 meta.yaml 失败: {}", e))?;
        }

        self.hub_path = Some(hub_path);
        Ok(())
    }

    /// 检查项目是否已初始化 AgentHub
    pub fn is_initialized(&self, project_path: &Path) -> bool {
        let hub_path = project_path.join(".agent-hub");
        hub_path.exists() && hub_path.join("tasks").join("tasks.yaml").exists()
    }

    /// 设置当前工作路径（在 init 或检测到已初始化后调用）
    pub fn set_hub_path(&mut self, project_path: &Path) {
        self.hub_path = Some(project_path.join(".agent-hub"));
    }

    /// 获取 .agent-hub 路径，未初始化或目录已删除则返回错误
    fn get_hub_path(&self) -> Result<&PathBuf, String> {
        let path = self.hub_path.as_ref().ok_or_else(|| {
            "AgentHub 未初始化，请先调用 agenthub_init".to_string()
        })?;
        if !path.exists() {
            return Err("AGENTHUB_DIR_DELETED".to_string());
        }
        Ok(path)
    }

    // ============================================================
    // 任务操作
    // ============================================================

    pub fn load_tasks(&self) -> Result<Vec<Task>, String> {
        let hub_path = self.get_hub_path()?;
        let tasks_file = hub_path.join("tasks").join("tasks.yaml");

        if !tasks_file.exists() {
            return Ok(vec![]);
        }

        let content = std::fs::read_to_string(&tasks_file)
            .map_err(|e| format!("读取 tasks.yaml 失败: {}", e))?;

        let tasks_file_data: TasksFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 tasks.yaml 失败: {}", e))?;

        Ok(tasks_file_data.tasks)
    }

    pub fn create_task(&self, task: &Task) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let tasks_file = hub_path.join("tasks").join("tasks.yaml");

        let mut tasks_data = if tasks_file.exists() {
            let content = std::fs::read_to_string(&tasks_file)
                .map_err(|e| format!("读取 tasks.yaml 失败: {}", e))?;
            serde_yaml::from_str::<TasksFile>(&content)
                .map_err(|e| format!("解析 tasks.yaml 失败: {}", e))?
        } else {
            TasksFile { version: 1, tasks: vec![] }
        };

        // 检查 ID 是否重复
        if tasks_data.tasks.iter().any(|t| t.id == task.id) {
            return Err(format!("任务 ID {} 已存在", task.id));
        }

        tasks_data.tasks.push(task.clone());

        let yaml = serde_yaml::to_string(&tasks_data)
            .map_err(|e| format!("序列化 tasks.yaml 失败: {}", e))?;
        std::fs::write(&tasks_file, yaml)
            .map_err(|e| format!("写入 tasks.yaml 失败: {}", e))?;

        // 追加事件
        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "task_created".to_string(),
            task_id: Some(task.id.clone()),
            agent: None,
            message: Some(format!("创建任务: {}", task.title)),
            files_changed: None,
        })?;

        Ok(())
    }

    pub fn update_task(&self, id: &str, updates: &TaskUpdate) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let tasks_file = hub_path.join("tasks").join("tasks.yaml");

        let content = std::fs::read_to_string(&tasks_file)
            .map_err(|e| format!("读取 tasks.yaml 失败: {}", e))?;
        let mut tasks_data: TasksFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 tasks.yaml 失败: {}", e))?;

        let task = tasks_data.tasks.iter_mut().find(|t| t.id == id)
            .ok_or_else(|| format!("任务 {} 不存在", id))?;

        // 应用更新（顺序重要：assigned_agent 必须在 status 之前更新）
        if let Some(title) = &updates.title {
            task.title = title.clone();
        }
        if let Some(desc) = &updates.description {
            task.description = desc.clone();
        }
        if let Some(assigned) = &updates.assigned_agent {
            task.assigned_agent = assigned.clone();
        }
        if let Some(status) = &updates.status {
            let old_status = task.status.clone();
            task.status = status.clone();
            // 自动设置时间戳
            match status {
                TaskStatus::Running | TaskStatus::Ready => {
                    if task.started_at.is_none() {
                        task.started_at = Some(Utc::now().to_rfc3339());
                    }
                }
                TaskStatus::Done => {
                    task.completed_at = Some(Utc::now().to_rfc3339());
                }
                _ => {}
            }
            // 同步更新 Agent 状态（使用更新后的 assigned_agent）
            if let Some(ref agent_id) = task.assigned_agent {
                let agent_status = match status {
                    TaskStatus::Running => "running",
                    TaskStatus::Ready => "ready",
                    TaskStatus::Done => "done",
                    TaskStatus::Failed => "failed",
                    _ => "idle",
                };
                let _ = self.update_agent_status(agent_id, agent_status, &format!("任务状态: {}", status.as_str()));

                // 仅在 pending 状态时移除 Agent（重置任务）
                if matches!(status, TaskStatus::Pending) {
                    let _ = self.remove_active_agent(agent_id);
                }
            }
        }
        if let Some(tags) = &updates.tags {
            task.tags = tags.clone();
        }
        if let Some(result) = &updates.result {
            task.result = result.clone();
        }
        if let Some(error) = &updates.error {
            task.error = error.clone();
        }
        task.updated = Some(Utc::now().to_rfc3339());

        let yaml = serde_yaml::to_string(&tasks_data)
            .map_err(|e| format!("序列化 tasks.yaml 失败: {}", e))?;
        std::fs::write(&tasks_file, yaml)
            .map_err(|e| format!("写入 tasks.yaml 失败: {}", e))?;

        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let tasks_file = hub_path.join("tasks").join("tasks.yaml");

        let content = std::fs::read_to_string(&tasks_file)
            .map_err(|e| format!("读取 tasks.yaml 失败: {}", e))?;
        let mut tasks_data: TasksFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 tasks.yaml 失败: {}", e))?;

        // 找到要删除的任务，获取其关联的 agent_id
        let task_to_delete = tasks_data.tasks.iter().find(|t| t.id == id);
        let agent_id_to_remove = task_to_delete
            .and_then(|t| t.assigned_agent.clone());

        let original_len = tasks_data.tasks.len();
        tasks_data.tasks.retain(|t| t.id != id);

        if tasks_data.tasks.len() == original_len {
            return Err(format!("任务 {} 不存在", id));
        }

        let yaml = serde_yaml::to_string(&tasks_data)
            .map_err(|e| format!("序列化 tasks.yaml 失败: {}", e))?;
        std::fs::write(&tasks_file, yaml)
            .map_err(|e| format!("写入 tasks.yaml 失败: {}", e))?;

        // 同时删除关联的活跃 Agent
        if let Some(agent_id) = agent_id_to_remove {
            let _ = self.remove_active_agent(&agent_id);
        }

        // 追加事件
        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "task_deleted".to_string(),
            task_id: Some(id.to_string()),
            agent: None,
            message: Some(format!("删除任务: {}", id)),
            files_changed: None,
        })?;

        Ok(())
    }

    // ============================================================
    // Agent 角色操作
    // ============================================================

    /// 获取全局 agent 角色配置文件路径
    fn get_global_registry_path(&self) -> Result<PathBuf, String> {
        let config_path = self.global_config_path.as_ref()
            .ok_or("全局配置路径未设置")?;
        let agents_dir = config_path.join("agents");
        std::fs::create_dir_all(&agents_dir)
            .map_err(|e| format!("创建 agents 目录失败: {}", e))?;
        Ok(agents_dir.join("registry.yaml"))
    }

    pub fn load_agent_roles(&self) -> Result<Vec<AgentRole>, String> {
        let registry_file = self.get_global_registry_path()?;

        if !registry_file.exists() {
            return Ok(vec![]);
        }

        let content = std::fs::read_to_string(&registry_file)
            .map_err(|e| format!("读取 registry.yaml 失败: {}", e))?;

        let agents_file: AgentsFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 registry.yaml 失败: {}", e))?;

        Ok(agents_file.agents)
    }

    pub fn save_agent_role(&self, role: &AgentRole) -> Result<(), String> {
        let registry_file = self.get_global_registry_path()?;

        let mut agents_data = if registry_file.exists() {
            let content = std::fs::read_to_string(&registry_file)
                .map_err(|e| format!("读取 registry.yaml 失败: {}", e))?;
            serde_yaml::from_str::<AgentsFile>(&content)
                .map_err(|e| format!("解析 registry.yaml 失败: {}", e))?
        } else {
            AgentsFile { agents: vec![] }
        };

        // 更新或插入（用 name 作为标识）
        if let Some(existing) = agents_data.agents.iter_mut().find(|a| a.name == role.name) {
            *existing = role.clone();
        } else {
            agents_data.agents.push(role.clone());
        }

        let yaml = serde_yaml::to_string(&agents_data)
            .map_err(|e| format!("序列化 registry.yaml 失败: {}", e))?;
        std::fs::write(&registry_file, yaml)
            .map_err(|e| format!("写入 registry.yaml 失败: {}", e))?;

        Ok(())
    }

    pub fn delete_agent_role(&self, id: &str) -> Result<(), String> {
        let registry_file = self.get_global_registry_path()?;

        let content = std::fs::read_to_string(&registry_file)
            .map_err(|e| format!("读取 registry.yaml 失败: {}", e))?;
        let mut agents_data: AgentsFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 registry.yaml 失败: {}", e))?;

        agents_data.agents.retain(|a| a.id != id && a.name != id);

        let yaml = serde_yaml::to_string(&agents_data)
            .map_err(|e| format!("序列化 registry.yaml 失败: {}", e))?;
        std::fs::write(&registry_file, yaml)
            .map_err(|e| format!("写入 registry.yaml 失败: {}", e))?;

        Ok(())
    }

    // ============================================================
    // 活跃 Agent 操作
    // ============================================================

    pub fn load_active_agents(&self) -> Result<Vec<ActiveAgent>, String> {
        let hub_path = self.get_hub_path()?;
        let active_file = hub_path.join("state").join("active-agents.yaml");

        if !active_file.exists() {
            return Ok(vec![]);
        }

        let content = std::fs::read_to_string(&active_file)
            .map_err(|e| format!("读取 active-agents.yaml 失败: {}", e))?;

        let active_data: ActiveAgentsFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 active-agents.yaml 失败: {}", e))?;

        Ok(active_data.active)
    }

    pub fn update_agent_status(
        &self,
        agent_id: &str,
        status: &str,
        current_action: &str,
    ) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let active_file = hub_path.join("state").join("active-agents.yaml");

        let content = std::fs::read_to_string(&active_file)
            .map_err(|e| format!("读取 active-agents.yaml 失败: {}", e))?;
        let mut active_data: ActiveAgentsFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 active-agents.yaml 失败: {}", e))?;

        if let Some(agent) = active_data.active.iter_mut().find(|a| a.agent_id == agent_id) {
            agent.status = status.to_string();
            agent.current_action = current_action.to_string();
            agent.last_heartbeat = Utc::now().to_rfc3339();
        } else {
            // Agent 不存在时静默成功（可能已被清理）
            return Ok(());
        }

        let yaml = serde_yaml::to_string(&active_data)
            .map_err(|e| format!("序列化 active-agents.yaml 失败: {}", e))?;
        std::fs::write(&active_file, yaml)
            .map_err(|e| format!("写入 active-agents.yaml 失败: {}", e))?;

        Ok(())
    }

    /// 从活跃列表中移除 agent
    pub fn remove_active_agent(&self, agent_id: &str) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let active_file = hub_path.join("state").join("active-agents.yaml");

        if !active_file.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(&active_file)
            .map_err(|e| format!("读取 active-agents.yaml 失败: {}", e))?;
        let mut active_data: ActiveAgentsFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 active-agents.yaml 失败: {}", e))?;

        active_data.active.retain(|a| a.agent_id != agent_id);

        let yaml = serde_yaml::to_string(&active_data)
            .map_err(|e| format!("序列化 active-agents.yaml 失败: {}", e))?;
        std::fs::write(&active_file, yaml)
            .map_err(|e| format!("写入 active-agents.yaml 失败: {}", e))?;

        Ok(())
    }

    // ============================================================
    // 项目大脑操作
    // ============================================================

    pub fn load_brain_meta(&self) -> Result<BrainMeta, String> {
        let hub_path = self.get_hub_path()?;
        let meta_file = hub_path.join("brain").join("meta.yaml");

        if !meta_file.exists() {
            return Err("brain/meta.yaml 不存在，请先初始化 AgentHub".to_string());
        }

        let content = std::fs::read_to_string(&meta_file)
            .map_err(|e| format!("读取 meta.yaml 失败: {}", e))?;

        let meta: BrainMeta = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 meta.yaml 失败: {}", e))?;

        Ok(meta)
    }

    pub fn load_brain_section(&self, section: &str) -> Result<String, String> {
        let hub_path = self.get_hub_path()?;
        let section_file = hub_path.join("brain").join(format!("{}.md", section));

        if !section_file.exists() {
            return Ok(String::new());
        }

        std::fs::read_to_string(&section_file)
            .map_err(|e| format!("读取 brain/{}.md 失败: {}", section, e))
    }

    pub fn update_brain_section(&self, section: &str, content: &str) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let section_file = hub_path.join("brain").join(format!("{}.md", section));

        std::fs::write(&section_file, content)
            .map_err(|e| format!("写入 brain/{}.md 失败: {}", section, e))?;

        Ok(())
    }

    /// 从 brain 各部分拼接上下文 prompt
    pub fn build_context(&self, task_id: &str) -> Result<String, String> {
        let tasks = self.load_tasks()?;
        let task = tasks.iter().find(|t| t.id == task_id)
            .ok_or_else(|| format!("任务 {} 不存在", task_id))?;

        let mut context = String::new();

        // 加载 brain 各部分
        let sections = ["architecture", "decisions", "conventions"];
        for section in &sections {
            if let Ok(content) = self.load_brain_section(section) {
                if !content.trim().is_empty() {
                    context.push_str(&format!("## {}\n\n{}\n\n", section, content));
                }
            }
        }

        // 加载当前状态
        if let Ok(state) = self.load_brain_section("state/current") {
            if !state.trim().is_empty() {
                context.push_str(&format!("## 当前状态\n\n{}\n\n", state));
            }
        }

        // 加载阻塞项
        if let Ok(blockers) = self.load_brain_section("state/blockers") {
            if !blockers.trim().is_empty() {
                context.push_str(&format!("## 已知阻塞项\n\n{}\n\n", blockers));
            }
        }

        // 构建任务描述
        context.push_str(&format!(
            "## 当前任务\n\n**ID**: {}\n**标题**: {}\n**描述**: {}\n**优先级**: {}\n",
            task.id, task.title, task.description, task.priority.as_str()
        ));

        if !task.tags.is_empty() {
            context.push_str(&format!("**标签**: {}\n", task.tags.join(", ")));
        }

        if !task.dependencies.is_empty() {
            context.push_str(&format!("**依赖**: {}\n", task.dependencies.join(", ")));
        }

        if !task.subtasks.is_empty() {
            context.push_str("**子任务**:\n");
            for sub in &task.subtasks {
                context.push_str(&format!("- [{}] {}\n", sub.status, sub.title));
            }
        }

        Ok(context)
    }

    /// 构建包含 Agent 角色信息的上下文
    pub fn build_context_with_agent(&self, task_id: &str, agent_role: Option<&AgentRole>, brain_sections: Option<&[String]>) -> Result<String, String> {
        let mut context = String::new();

        // 1. Agent 角色信息
        if let Some(role) = agent_role {
            context.push_str(&format!(
                "## 你的角色\n\n你是 **{}**。\n",
                role.name
            ));
            if !role.description.is_empty() {
                context.push_str(&format!("{}\n", role.description));
            }
            if !role.prompt.is_empty() {
                context.push_str(&format!("\n{}\n", role.prompt));
            }
            if !role.tags.is_empty() {
                context.push_str(&format!("\n技能标签: {}\n", role.tags.join(", ")));
            }
            context.push_str(&format!("默认模型: {}\n", role.model));
            context.push('\n');
        }

        // 2. 项目 brain（可选择性注入）
        let section_labels = [
            ("architecture", "架构概述"),
            ("structure", "目录结构"),
            ("decisions", "技术决策"),
            ("conventions", "代码规范"),
            ("other", "其他补充"),
            ("state/current", "当前状态"),
        ];
        for (key, label) in &section_labels {
            // 如果指定了 brain_sections，只注入选中的部分
            if let Some(ref sections) = brain_sections {
                if !sections.iter().any(|s| s == *key) {
                    continue;
                }
            }
            if let Ok(content) = self.load_brain_section(key) {
                if !content.trim().is_empty() {
                    context.push_str(&format!("## {}\n\n{}\n\n", label, content));
                }
            }
        }

        // 3. 任务描述
        let tasks = self.load_tasks()?;
        let task = tasks.iter().find(|t| t.id == task_id)
            .ok_or_else(|| format!("任务 {} 不存在", task_id))?;

        context.push_str(&format!(
            "## 当前任务\n\n**ID**: {}\n**标题**: {}\n**描述**: {}\n**优先级**: {}\n",
            task.id, task.title, task.description, task.priority.as_str()
        ));

        if !task.tags.is_empty() {
            context.push_str(&format!("**标签**: {}\n", task.tags.join(", ")));
        }

        if !task.dependencies.is_empty() {
            context.push_str(&format!("**依赖**: {}\n", task.dependencies.join(", ")));
        }

        if !task.subtasks.is_empty() {
            context.push_str("**子任务**:\n");
            for sub in &task.subtasks {
                context.push_str(&format!("- [{}] {}\n", sub.status, sub.title));
            }
        }

        Ok(context)
    }

    /// 构建包含文件路径引用的上下文（不嵌入文件内容，让 agent 自己读取）
    pub fn build_context_with_paths(&self, task_id: &str, agent_role: Option<&AgentRole>, brain_sections: Option<&[String]>) -> Result<String, String> {
        let mut context = String::new();

        // 1. Agent 角色信息
        if let Some(role) = agent_role {
            context.push_str(&format!(
                "## 你的角色\n\n你是 **{}**。\n",
                role.name
            ));
            if !role.description.is_empty() {
                context.push_str(&format!("{}\n", role.description));
            }
            if !role.prompt.is_empty() {
                context.push_str(&format!("\n{}\n", role.prompt));
            }
            if !role.tags.is_empty() {
                context.push_str(&format!("\n技能标签: {}\n", role.tags.join(", ")));
            }
            context.push_str(&format!("默认模型: {}\n", role.model));
            context.push('\n');
        }

        // 2. 项目 brain（以文件路径引用方式注入）
        let section_labels = [
            ("architecture", "架构概述"),
            ("structure", "目录结构"),
            ("decisions", "技术决策"),
            ("conventions", "代码规范"),
            ("other", "其他补充"),
            ("state/current", "当前状态"),
        ];
        let mut path_refs: Vec<String> = Vec::new();
        for (key, label) in &section_labels {
            if let Some(ref sections) = brain_sections {
                if !sections.iter().any(|s| s == *key) {
                    continue;
                }
            }
            let file_path = format!(".agent-hub/brain/{}.md", key);
            // 检查文件是否存在且非空
            let hub_path = self.get_hub_path()?;
            let section_file = hub_path.join("brain").join(format!("{}.md", key));
            if section_file.exists() {
                if let Ok(content) = std::fs::read_to_string(&section_file) {
                    if !content.trim().is_empty() {
                        path_refs.push(format!("- {}: @{}", label, file_path));
                    }
                }
            }
        }
        if !path_refs.is_empty() {
            context.push_str("## 项目知识\n\n请阅读以下文件了解项目背景：\n");
            for path_ref in &path_refs {
                context.push_str(&format!("{}\n", path_ref));
            }
            context.push('\n');
        }

        // 3. 任务描述
        let tasks = self.load_tasks()?;
        let task = tasks.iter().find(|t| t.id == task_id)
            .ok_or_else(|| format!("任务 {} 不存在", task_id))?;

        context.push_str(&format!(
            "## 当前任务\n\n**ID**: {}\n**标题**: {}\n**描述**: {}\n**优先级**: {}\n",
            task.id, task.title, task.description, task.priority.as_str()
        ));

        if !task.tags.is_empty() {
            context.push_str(&format!("**标签**: {}\n", task.tags.join(", ")));
        }

        if !task.dependencies.is_empty() {
            context.push_str(&format!("**依赖**: {}\n", task.dependencies.join(", ")));
        }

        if !task.subtasks.is_empty() {
            context.push_str("**子任务**:\n");
            for sub in &task.subtasks {
                context.push_str(&format!("- [{}] {}\n", sub.status, sub.title));
            }
        }

        Ok(context)
    }

    /// 更新 agent 的 session_id
    pub fn update_agent_session(&self, agent_id: &str, session_id: &str) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let active_file = hub_path.join("state").join("active-agents.yaml");

        let content = std::fs::read_to_string(&active_file)
            .map_err(|e| format!("读取 active-agents.yaml 失败: {}", e))?;
        let mut active_data: ActiveAgentsFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 active-agents.yaml 失败: {}", e))?;

        if let Some(agent) = active_data.active.iter_mut().find(|a| a.agent_id == agent_id) {
            agent.session_id = Some(session_id.to_string());
        }

        let yaml = serde_yaml::to_string(&active_data)
            .map_err(|e| format!("序列化 active-agents.yaml 失败: {}", e))?;
        std::fs::write(&active_file, yaml)
            .map_err(|e| format!("写入 active-agents.yaml 失败: {}", e))?;

        Ok(())
    }

    // ============================================================
    // 事件操作
    // ============================================================

    pub fn load_events(&self, limit: usize) -> Result<Vec<HubEvent>, String> {
        let hub_path = self.get_hub_path()?;
        let events_file = hub_path.join("state").join("events.jsonl");

        if !events_file.exists() {
            return Ok(vec![]);
        }

        let content = std::fs::read_to_string(&events_file)
            .map_err(|e| format!("读取 events.jsonl 失败: {}", e))?;

        let mut events: Vec<HubEvent> = Vec::new();
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(event) = serde_json::from_str::<HubEvent>(line) {
                events.push(event);
            }
        }

        // 按时间倒序，取最新的 limit 条
        events.reverse();
        events.truncate(limit);

        Ok(events)
    }

    pub fn append_event(&self, event: &HubEvent) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let events_file = hub_path.join("state").join("events.jsonl");

        let json_line = serde_json::to_string(event)
            .map_err(|e| format!("序列化事件失败: {}", e))?;

        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&events_file)
            .map_err(|e| format!("打开 events.jsonl 失败: {}", e))?;

        writeln!(file, "{}", json_line)
            .map_err(|e| format!("写入事件失败: {}", e))?;

        Ok(())
    }

    // ============================================================
    // 扫描项目（自动推断 brain 内容）
    // ============================================================

    pub fn scan_project(&self, project_path: &Path) -> Result<BrainMeta, String> {
        let project_name = project_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let mut tech_stack = std::collections::HashMap::new();

        // 检测技术栈
        if project_path.join("package.json").exists() {
            if let Ok(content) = std::fs::read_to_string(project_path.join("package.json")) {
                if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(deps) = pkg.get("dependencies").and_then(|d| d.as_object()) {
                        if deps.contains_key("react") {
                            tech_stack.insert("frontend".to_string(), "React".to_string());
                        }
                        if deps.contains_key("vue") {
                            tech_stack.insert("frontend".to_string(), "Vue".to_string());
                        }
                        if deps.contains_key("next") {
                            tech_stack.insert("framework".to_string(), "Next.js".to_string());
                        }
                    }
                    if let Some(dev_deps) = pkg.get("devDependencies").and_then(|d| d.as_object()) {
                        if dev_deps.contains_key("typescript") {
                            tech_stack.insert("language".to_string(), "TypeScript".to_string());
                        }
                    }
                }
            }
        }

        if project_path.join("Cargo.toml").exists() {
            tech_stack.insert("language".to_string(), "Rust".to_string());
        }

        if project_path.join("tsconfig.json").exists() && !tech_stack.contains_key("language") {
            tech_stack.insert("language".to_string(), "TypeScript".to_string());
        }

        if project_path.join("pyproject.toml").exists() || project_path.join("requirements.txt").exists() {
            tech_stack.insert("language".to_string(), "Python".to_string());
        }

        let meta = BrainMeta {
            name: project_name,
            description: String::new(),
            tech_stack,
            repo_path: project_path.to_string_lossy().to_string(),
            default_model: "sonnet".to_string(),
        };

        // 如果已初始化，保存扫描结果
        if self.is_initialized(project_path) {
            let hub_path = project_path.join(".agent-hub");
            let meta_file = hub_path.join("brain").join("meta.yaml");
            if let Ok(yaml) = serde_yaml::to_string(&meta) {
                let _ = std::fs::write(&meta_file, yaml);
            }
        }

        Ok(meta)
    }

    // ============================================================
    // 项目深度扫描（收集原始数据，供 AI 分析使用）
    // ============================================================

    /// 收集项目原始数据（目录结构、关键文件、依赖等）
    pub fn collect_project_raw_data(&self, project_path: &Path, scope: &[String]) -> Result<String, String> {
        let mut data = String::new();

        // 1. 目录结构
        if scope.contains(&"structure".to_string()) {
            data.push_str("## 目录结构\n\n```\n");
            data.push_str(&self.build_directory_tree(project_path, 0, 3)?);
            data.push_str("```\n\n");
        }

        // 2. 关键文件内容
        if scope.contains(&"key-files".to_string()) {
            data.push_str("## 关键文件\n\n");
            let key_files = self.find_key_files(project_path);
            for file_path in &key_files {
                if let Ok(content) = std::fs::read_to_string(file_path) {
                    let relative = file_path.strip_prefix(project_path)
                        .unwrap_or(file_path)
                        .to_string_lossy();
                    // 限制每个文件最多 200 行
                    let lines: Vec<&str> = content.lines().collect();
                    let truncated = if lines.len() > 200 {
                        format!("{}... ({} 行，已截断)", lines[..200].join("\n"), lines.len())
                    } else {
                        content
                    };
                    data.push_str(&format!("### {}\n\n```\n{}\n```\n\n", relative, truncated));
                }
            }
        }

        // 3. 依赖信息
        if scope.contains(&"architecture".to_string()) {
            data.push_str("## 依赖信息\n\n");
            data.push_str(&self.collect_dependency_info(project_path));
            data.push('\n');
        }

        // 4. Git 状态
        if scope.contains(&"current".to_string()) {
            data.push_str("## Git 状态\n\n");
            data.push_str(&self.collect_git_status(project_path));
            data.push('\n');
        }

        Ok(data)
    }

    /// 构建目录树（递归，限制深度）
    fn build_directory_tree(&self, path: &Path, depth: usize, max_depth: usize) -> Result<String, String> {
        if depth > max_depth {
            return Ok(String::new());
        }

        let mut tree = String::new();
        let indent = "  ".repeat(depth);

        let entries = std::fs::read_dir(path)
            .map_err(|e| format!("读取目录失败: {}", e))?;

        let mut dirs = Vec::new();
        let mut files = Vec::new();

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let name = entry.file_name().to_string_lossy().to_string();

            // 跳过隐藏目录和常见忽略目录
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "__pycache__" {
                continue;
            }

            let file_type = entry.file_type().map_err(|e| format!("获取文件类型失败: {}", e))?;
            if file_type.is_dir() {
                dirs.push(name);
            } else if depth < max_depth {
                files.push(name);
            }
        }

        dirs.sort();
        files.sort();

        for dir in &dirs {
            tree.push_str(&format!("{}{}/\n", indent, dir));
            let sub_path = path.join(dir);
            tree.push_str(&self.build_directory_tree(&sub_path, depth + 1, max_depth)?);
        }

        if depth < max_depth {
            for file in &files {
                tree.push_str(&format!("{}{}\n", indent, file));
            }
        }

        Ok(tree)
    }

    /// 查找关键文件
    fn find_key_files(&self, project_path: &Path) -> Vec<PathBuf> {
        let key_patterns = vec![
            "README.md", "README.rst", "README.txt", "README",
            "package.json", "Cargo.toml", "pyproject.toml", "requirements.txt",
            "tsconfig.json", "webpack.config.js", "vite.config.ts", "vite.config.js",
            ".gitignore", "Dockerfile", "docker-compose.yml",
            "Makefile", "CMakeLists.txt",
        ];

        let mut result = Vec::new();
        for pattern in key_patterns {
            let path = project_path.join(pattern);
            if path.exists() {
                result.push(path);
            }
        }

        // 也查找 src/ 下的主要入口文件
        let src_dir = project_path.join("src");
        if src_dir.exists() {
            let entry_files = vec!["main.rs", "lib.rs", "main.ts", "index.ts", "main.py", "__init__.py"];
            for entry in entry_files {
                let path = src_dir.join(entry);
                if path.exists() {
                    result.push(path);
                }
            }
        }

        result
    }

    /// 收集依赖信息
    fn collect_dependency_info(&self, project_path: &Path) -> String {
        let mut info = String::new();

        // package.json
        let pkg_path = project_path.join("package.json");
        if pkg_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&pkg_path) {
                if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(deps) = pkg.get("dependencies").and_then(|d| d.as_object()) {
                        info.push_str("### npm 依赖\n\n");
                        for (name, version) in deps {
                            info.push_str(&format!("- {}: {}\n", name, version));
                        }
                        info.push('\n');
                    }
                    if let Some(dev_deps) = pkg.get("devDependencies").and_then(|d| d.as_object()) {
                        info.push_str("### 开发依赖\n\n");
                        for (name, version) in dev_deps {
                            info.push_str(&format!("- {}: {}\n", name, version));
                        }
                        info.push('\n');
                    }
                }
            }
        }

        // Cargo.toml
        let cargo_path = project_path.join("Cargo.toml");
        if cargo_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&cargo_path) {
                info.push_str("### Cargo.toml\n\n```toml\n");
                info.push_str(&content);
                info.push_str("\n```\n\n");
            }
        }

        // requirements.txt
        let req_path = project_path.join("requirements.txt");
        if req_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&req_path) {
                info.push_str("### Python 依赖\n\n");
                for line in content.lines() {
                    if !line.trim().is_empty() && !line.starts_with('#') {
                        info.push_str(&format!("- {}\n", line));
                    }
                }
                info.push('\n');
            }
        }

        if info.is_empty() {
            info = "未检测到依赖文件\n".to_string();
        }

        info
    }

    /// 收集 Git 状态
    fn collect_git_status(&self, project_path: &Path) -> String {
        let mut status = String::new();

        // 当前分支
        if let Ok(output) = std::process::Command::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(project_path)
            .output()
        {
            if let Ok(branch) = String::from_utf8(output.stdout) {
                status.push_str(&format!("当前分支: {}\n", branch.trim()));
            }
        }

        // 最近 5 次提交
        if let Ok(output) = std::process::Command::new("git")
            .args(["log", "--oneline", "-5"])
            .current_dir(project_path)
            .output()
        {
            if let Ok(log) = String::from_utf8(output.stdout) {
                status.push_str("\n最近提交:\n");
                status.push_str(&log);
            }
        }

        // 未提交的更改
        if let Ok(output) = std::process::Command::new("git")
            .args(["status", "--short"])
            .current_dir(project_path)
            .output()
        {
            if let Ok(status_output) = String::from_utf8(output.stdout) {
                if !status_output.trim().is_empty() {
                    status.push_str("\n未提交的更改:\n");
                    status.push_str(&status_output);
                }
            }
        }

        if status.is_empty() {
            status = "非 Git 仓库或 Git 不可用\n".to_string();
        }

        status
    }

    /// 保存分析 manifest
    pub fn save_analysis_manifest(&self, scope: &[String], file_hashes: std::collections::HashMap<String, String>) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let manifest_path = hub_path.join("brain").join(".analysis-manifest.yaml");

        let manifest = AnalysisManifest {
            last_analysis: Utc::now().to_rfc3339(),
            scope: scope.to_vec(),
            file_hashes,
        };

        let yaml = serde_yaml::to_string(&manifest)
            .map_err(|e| format!("序列化 manifest 失败: {}", e))?;
        std::fs::write(&manifest_path, yaml)
            .map_err(|e| format!("写入 manifest 失败: {}", e))?;

        Ok(())
    }

    /// 读取分析 manifest
    pub fn load_analysis_manifest(&self) -> Result<Option<AnalysisManifest>, String> {
        let hub_path = self.get_hub_path()?;
        let manifest_path = hub_path.join("brain").join(".analysis-manifest.yaml");

        if !manifest_path.exists() {
            return Ok(None);
        }

        let content = std::fs::read_to_string(&manifest_path)
            .map_err(|e| format!("读取 manifest 失败: {}", e))?;
        let manifest: AnalysisManifest = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 manifest 失败: {}", e))?;

        Ok(Some(manifest))
    }

    /// 构建 AI 分析 prompt
    pub fn build_analysis_prompt(&self, project_path: &Path, scope: &[String], mode: &str, raw_data: &str) -> Result<String, String> {
        let mut prompt = String::new();

        let project_name = project_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        prompt.push_str(&format!("请分析项目 \"{}\"，", project_name));

        // 根据模式调整指令
        match mode {
            "full" => {
                prompt.push_str("生成完整的项目大脑文档。\n\n");
            }
            "incremental" => {
                // 读取现有 brain 内容作为参考
                let existing = self.read_existing_brain()?;
                if !existing.is_empty() {
                    prompt.push_str("以下是现有的分析结果，请在此基础上更新（只修改需要更新的部分）：\n\n");
                    prompt.push_str(&existing);
                    prompt.push_str("\n\n---\n\n以下是项目的当前数据：\n\n");
                } else {
                    prompt.push_str("生成完整的项目大脑文档。\n\n");
                }
            }
            _ => {
                prompt.push_str("生成项目大脑文档。\n\n");
            }
        }

        // 添加范围说明
        prompt.push_str("请将分析结果写入以下文件（使用 Write 工具）：\n\n");
        prompt.push_str("写入目录：.agent-hub/brain/\n\n");

        if scope.contains(&"architecture".to_string()) {
            prompt.push_str("- architecture.md：项目架构概述，包括技术栈、框架选择、设计模式、系统架构图\n");
        }
        if scope.contains(&"structure".to_string()) {
            prompt.push_str("- structure.md：目录结构，列出主要目录和每个目录的职责说明\n");
        }
        if scope.contains(&"decisions".to_string()) {
            prompt.push_str("- decisions.md：技术决策记录，记录关键技术选型的理由和权衡\n");
        }
        if scope.contains(&"conventions".to_string()) {
            prompt.push_str("- conventions.md：代码规范，包括命名规则、文件组织、编码风格，给出具体例子\n");
        }
        if scope.contains(&"other".to_string()) {
            prompt.push_str("- other.md：其他补充信息，如特殊说明、注意事项、已知问题等\n");
        }
        if scope.contains(&"current".to_string()) {
            prompt.push_str("- state/current.md：当前项目状态，包括开发进度、活跃分支、最近变更\n");
        }

        prompt.push_str("\n要求：\n");
        prompt.push_str("- 内容要具体、实用，不要泛泛而谈\n");
        prompt.push_str("- 使用中文撰写\n");
        prompt.push_str("- 使用 Markdown 格式\n");
        prompt.push_str("- 对于代码规范，给出具体的例子\n");
        prompt.push_str("- 每个文件独立完整，可以单独阅读\n\n");

        // 添加原始数据
        prompt.push_str("以下是项目的原始数据：\n\n");
        prompt.push_str(raw_data);

        Ok(prompt)
    }

    /// 读取现有 brain 内容（用于增量分析）
    fn read_existing_brain(&self) -> Result<String, String> {
        let hub_path = self.get_hub_path()?;
        let mut content = String::new();

        let sections = ["structure", "architecture", "conventions", "key-files"];
        for section in &sections {
            let file_path = hub_path.join("brain").join(format!("{}.md", section));
            if file_path.exists() {
                if let Ok(file_content) = std::fs::read_to_string(&file_path) {
                    if !file_content.trim().is_empty() {
                        content.push_str(&format!("### {}\n\n{}\n\n", section, file_content));
                    }
                }
            }
        }

        Ok(content)
    }

    /// 计算文件 hash（用于增量分析）
    pub fn compute_file_hash(&self, path: &Path) -> String {
        if let Ok(content) = std::fs::read_to_string(path) {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            content.hash(&mut hasher);
            format!("{:x}", hasher.finish())
        } else {
            String::new()
        }
    }

    /// 扫描项目并计算关键文件 hash
    pub fn scan_project_hashes(&self, project_path: &Path) -> std::collections::HashMap<String, String> {
        let mut hashes = std::collections::HashMap::new();
        let key_files = self.find_key_files(project_path);
        for file_path in &key_files {
            if let Ok(relative) = file_path.strip_prefix(project_path) {
                let hash = self.compute_file_hash(file_path);
                hashes.insert(relative.to_string_lossy().to_string(), hash);
            }
        }
        hashes
    }

    // ============================================================
    // 项目大脑 - CLAUDE.md 生成
    // ============================================================

    /// 从 brain 各部分生成 CLAUDE.md 内容
    pub fn generate_claude_md(&self) -> Result<String, String> {
        let hub_path = self.get_hub_path()?;
        let meta = self.load_brain_meta().ok();

        let mut md = String::new();

        let project_name = meta.as_ref().map(|m| m.name.as_str()).unwrap_or("Project");
        md.push_str(&format!("# CLAUDE.md — {}\n\n", project_name));
        md.push_str("> 由 AgentHub 自动生成，请勿手动编辑此文件。\n\n");

        if let Some(ref meta) = meta {
            if !meta.description.is_empty() {
                md.push_str(&format!("## 项目简介\n\n{}\n\n", meta.description));
            }
            if !meta.tech_stack.is_empty() {
                md.push_str("## 技术栈\n\n");
                for (key, value) in &meta.tech_stack {
                    md.push_str(&format!("- **{}**: {}\n", key, value));
                }
                md.push('\n');
            }
        }

        let sections_to_include = [
            ("architecture", "架构概述"),
            ("structure", "目录结构"),
            ("decisions", "技术决策"),
            ("conventions", "代码规范"),
            ("other", "其他补充"),
            ("state/current", "当前状态"),
        ];

        for (section_key, section_title) in &sections_to_include {
            // 支持嵌套路径，如 state/current.md
            let section_file = hub_path.join("brain").join(format!("{}.md", section_key));
            if section_file.exists() {
                if let Ok(content) = std::fs::read_to_string(&section_file) {
                    let trimmed = content.trim();
                    if !trimmed.is_empty() {
                        md.push_str(&format!("## {}\n\n{}\n\n", section_title, trimmed));
                    }
                }
            }
        }

        if let Ok(tasks) = self.load_tasks() {
            let active_tasks: Vec<_> = tasks.iter()
                .filter(|t| matches!(t.status, TaskStatus::Running | TaskStatus::Assigned))
                .collect();
            if !active_tasks.is_empty() {
                md.push_str("## 活跃任务\n\n");
                for task in &active_tasks {
                    md.push_str(&format!("- **[{}]** {} — {}\n", task.id, task.title, task.status.as_str()));
                }
                md.push('\n');
            }
        }

        Ok(md)
    }

    /// 生成 CLAUDE.md 并写入项目根目录
    pub fn sync_claude_md(&self) -> Result<String, String> {
        let hub_path = self.get_hub_path()?;
        let project_path = hub_path.parent()
            .ok_or("无法获取项目根目录")?;

        let content = self.generate_claude_md()?;
        let claude_md_path = project_path.join("CLAUDE.md");

        std::fs::write(&claude_md_path, &content)
            .map_err(|e| format!("写入 CLAUDE.md 失败: {}", e))?;

        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "claude_md_synced".to_string(),
            task_id: None,
            agent: None,
            message: Some("同步 CLAUDE.md 到项目根目录".to_string()),
            files_changed: Some(vec!["CLAUDE.md".to_string()]),
        })?;

        Ok(content)
    }

    // ============================================================
    // 任务执行
    // ============================================================

    /// 启动任务：更新状态、注册活跃 agent、追加事件
    pub fn run_task(&self, task_id: &str, agent_role_id: Option<&str>, brain_sections: Option<&[String]>) -> Result<String, String> {
        let tasks = self.load_tasks()?;
        let task = tasks.iter().find(|t| t.id == task_id)
            .ok_or_else(|| format!("任务 {} 不存在", task_id))?;

        if task.status.as_str() == "running" {
            return Err(format!("任务 {} 已在运行中", task_id));
        }

        // 查找 Agent 角色
        let agent_roles = self.load_agent_roles()?;
        let agent_role = agent_role_id
            .and_then(|id| agent_roles.iter().find(|r| r.id == id || r.name == id));

        // 使用角色名称作为 Worker ID，没有角色时用 "default"
        let worker_id = agent_role
            .map(|r| r.name.clone())
            .unwrap_or_else(|| "default".to_string());

        // 构建上下文（Agent 角色 + 项目 brain 文件路径引用 + 任务描述）
        let context = self.build_context_with_paths(task_id, agent_role, brain_sections)?;

        // 1. 先创建 Agent（状态为 ready）
        let active_agent = ActiveAgent {
            agent_id: worker_id.clone(),
            role: agent_role_id.unwrap_or("default").to_string(),
            task_id: task_id.to_string(),
            session_id: None,
            started_at: Utc::now().to_rfc3339(),
            last_heartbeat: Utc::now().to_rfc3339(),
            status: "ready".to_string(),
            current_action: format!("就绪: {}", task.title),
            pid: None,
        };
        self.register_active_agent(&active_agent)?;

        // 2. 再更新任务状态（会同步更新 Agent 状态）
        self.update_task(task_id, &TaskUpdate {
            status: Some(TaskStatus::Ready),
            assigned_agent: Some(Some(worker_id.clone())),
            ..Default::default()
        })?;

        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "task_started".to_string(),
            task_id: Some(task_id.to_string()),
            agent: Some(worker_id),
            message: Some(format!("开始执行任务: {}", task.title)),
            files_changed: None,
        })?;

        Ok(context)
    }

    /// 停止 agent
    /// 停止 Agent 追踪（不停止 Session，任务回 pending）
    pub fn stop_agent(&self, agent_id: &str) -> Result<Option<String>, String> {
        let active_agents = self.load_active_agents()?;
        let agent = active_agents.iter().find(|a| a.agent_id == agent_id)
            .ok_or_else(|| format!("Agent {} 不在活跃列表中", agent_id))?
            .clone();

        // 任务回到 pending
        if agent.task_id.starts_with('T') {
            let _ = self.update_task(&agent.task_id, &TaskUpdate {
                status: Some(TaskStatus::Pending),
                ..Default::default()
            });
        }

        // 移除活跃 agent
        self.remove_active_agent(agent_id)?;

        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "agent_stopped".to_string(),
            task_id: Some(agent.task_id.clone()),
            agent: Some(agent_id.to_string()),
            message: Some(format!("停止追踪 Agent {}，任务回到待处理", agent_id)),
            files_changed: None,
        })?;

        // 返回 session_id，让前端决定是否关闭
        Ok(agent.session_id)
    }

    /// 终止任务（关闭 Session + 标记失败）
    pub fn terminate_task(&self, task_id: &str, agent_id: &str, error: &str) -> Result<Option<String>, String> {
        let active_agents = self.load_active_agents()?;
        let agent = active_agents.iter().find(|a| a.agent_id == agent_id);

        let session_id = agent.and_then(|a| a.session_id.clone());

        // update_task 会自动同步 Agent 状态为 failed
        self.update_task(task_id, &TaskUpdate {
            status: Some(TaskStatus::Failed),
            error: Some(Some(error.to_string())),
            ..Default::default()
        })?;

        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "task_terminated".to_string(),
            task_id: Some(task_id.to_string()),
            agent: Some(agent_id.to_string()),
            message: Some(format!("任务 {} 已终止: {}", task_id, error)),
            files_changed: None,
        })?;

        Ok(session_id)
    }

    /// 更新 agent 心跳
    pub fn heartbeat_agent(&self, agent_id: &str, current_action: &str) -> Result<(), String> {
        self.update_agent_status(agent_id, "running", current_action)
    }

    /// 完成任务
    pub fn complete_task(&self, task_id: &str, agent_id: &str, result: &str) -> Result<(), String> {
        // update_task 会自动同步 Agent 状态为 done
        self.update_task(task_id, &TaskUpdate {
            status: Some(TaskStatus::Done),
            result: Some(Some(result.to_string())),
            ..Default::default()
        })?;

        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "task_completed".to_string(),
            task_id: Some(task_id.to_string()),
            agent: Some(agent_id.to_string()),
            message: Some(format!("任务 {} 已完成", task_id)),
            files_changed: None,
        })?;

        Ok(())
    }

    /// 失败任务
    pub fn fail_task(&self, task_id: &str, agent_id: &str, error: &str) -> Result<(), String> {
        // update_task 会自动同步 Agent 状态为 failed
        self.update_task(task_id, &TaskUpdate {
            status: Some(TaskStatus::Failed),
            error: Some(Some(error.to_string())),
            ..Default::default()
        })?;

        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "task_failed".to_string(),
            task_id: Some(task_id.to_string()),
            agent: Some(agent_id.to_string()),
            message: Some(format!("任务 {} 失败: {}", task_id, error)),
            files_changed: None,
        })?;

        Ok(())
    }

    /// 注册活跃 agent
    fn register_active_agent(&self, agent: &ActiveAgent) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let active_file = hub_path.join("state").join("active-agents.yaml");

        let mut active_data = if active_file.exists() {
            let content = std::fs::read_to_string(&active_file)
                .map_err(|e| format!("读取 active-agents.yaml 失败: {}", e))?;
            serde_yaml::from_str::<ActiveAgentsFile>(&content)
                .map_err(|e| format!("解析 active-agents.yaml 失败: {}", e))?
        } else {
            ActiveAgentsFile { active: vec![] }
        };

        active_data.active.retain(|a| a.agent_id != agent.agent_id);
        active_data.active.push(agent.clone());

        let yaml = serde_yaml::to_string(&active_data)
            .map_err(|e| format!("序列化 active-agents.yaml 失败: {}", e))?;
        std::fs::write(&active_file, yaml)
            .map_err(|e| format!("写入 active-agents.yaml 失败: {}", e))?;

        Ok(())
    }

    // ============================================================
    // Agent 间消息通信
    // ============================================================

    /// 发送消息
    pub fn send_message(
        &self,
        from: &str,
        to: &str,
        action: &str,
        content: &str,
        task_id: Option<&str>,
        context: Option<serde_json::Value>,
    ) -> Result<Message, String> {
        let hub_path = self.get_hub_path()?;
        let messages_file = hub_path.join("state").join("messages.jsonl");

        let message = Message {
            id: format!("msg-{}", uuid::Uuid::new_v4().to_string()[..8].to_string()),
            from: from.to_string(),
            to: to.to_string(),
            task_id: task_id.map(|s| s.to_string()),
            action: action.to_string(),
            content: content.to_string(),
            context,
            ts: Utc::now().to_rfc3339(),
            read: false,
        };

        let json_line = serde_json::to_string(&message)
            .map_err(|e| format!("序列化消息失败: {}", e))?;

        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&messages_file)
            .map_err(|e| format!("打开 messages.jsonl 失败: {}", e))?;

        writeln!(file, "{}", json_line)
            .map_err(|e| format!("写入消息失败: {}", e))?;

        // 追加事件
        self.append_event(&HubEvent {
            ts: Utc::now().to_rfc3339(),
            event_type: "message_sent".to_string(),
            task_id: task_id.map(|s| s.to_string()),
            agent: Some(from.to_string()),
            message: Some(format!("{} → {}: {}", from, to, content)),
            files_changed: None,
        })?;

        Ok(message)
    }

    /// 获取消息列表
    pub fn get_messages(&self, agent_id: Option<&str>, limit: usize) -> Result<Vec<Message>, String> {
        let hub_path = self.get_hub_path()?;
        let messages_file = hub_path.join("state").join("messages.jsonl");

        if !messages_file.exists() {
            return Ok(vec![]);
        }

        let content = std::fs::read_to_string(&messages_file)
            .map_err(|e| format!("读取 messages.jsonl 失败: {}", e))?;

        let mut messages: Vec<Message> = Vec::new();
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(msg) = serde_json::from_str::<Message>(line) {
                // 如果指定了 agent_id，只返回发送给该 agent 的消息
                if let Some(agent) = agent_id {
                    if msg.to != agent && msg.from != agent {
                        continue;
                    }
                }
                messages.push(msg);
            }
        }

        // 按时间倒序
        messages.reverse();
        messages.truncate(limit);

        Ok(messages)
    }

    /// 获取指定 agent 的未读消息
    pub fn get_unread_messages(&self, agent_id: &str) -> Result<Vec<Message>, String> {
        let hub_path = self.get_hub_path()?;
        let messages_file = hub_path.join("state").join("messages.jsonl");

        if !messages_file.exists() {
            return Ok(vec![]);
        }

        let content = std::fs::read_to_string(&messages_file)
            .map_err(|e| format!("读取 messages.jsonl 失败: {}", e))?;

        let mut messages: Vec<Message> = Vec::new();
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(msg) = serde_json::from_str::<Message>(line) {
                if msg.to == agent_id && !msg.read {
                    messages.push(msg);
                }
            }
        }

        Ok(messages)
    }

    /// 标记消息为已读
    pub fn mark_message_read(&self, message_id: &str) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let messages_file = hub_path.join("state").join("messages.jsonl");

        if !messages_file.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(&messages_file)
            .map_err(|e| format!("读取 messages.jsonl 失败: {}", e))?;

        let mut messages: Vec<Message> = Vec::new();
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(mut msg) = serde_json::from_str::<Message>(line) {
                if msg.id == message_id {
                    msg.read = true;
                }
                messages.push(msg);
            }
        }

        // 重写文件
        let mut new_content = String::new();
        for msg in &messages {
            if let Ok(json) = serde_json::to_string(msg) {
                new_content.push_str(&json);
                new_content.push('\n');
            }
        }

        std::fs::write(&messages_file, new_content)
            .map_err(|e| format!("写入 messages.jsonl 失败: {}", e))?;

        Ok(())
    }

    /// 构建消息上下文（用于注入到 agent 会话）
    pub fn build_message_context(&self, agent_id: &str) -> Result<String, String> {
        let messages = self.get_unread_messages(agent_id)?;

        if messages.is_empty() {
            return Ok(String::new());
        }

        let mut context = String::new();
        context.push_str(&format!("## 收到的消息（共 {} 条未读）\n\n", messages.len()));

        for msg in &messages {
            context.push_str(&format!(
                "### 来自 {}\n**动作**: {}\n**内容**:\n{}\n\n",
                msg.from, msg.action, msg.content
            ));

            if let Some(ref ctx) = msg.context {
                if let Some(obj) = ctx.as_object() {
                    for (key, value) in obj {
                        context.push_str(&format!("**{}**: {}\n", key, value));
                    }
                    context.push('\n');
                }
            }
        }

        // 标记为已读
        for msg in &messages {
            let _ = self.mark_message_read(&msg.id);
        }

        Ok(context)
    }

    // ============================================================
    // 工作流管理
    // ============================================================

    fn get_workflows_path(&self) -> Result<PathBuf, String> {
        let hub_path = self.get_hub_path()?;
        let workflows_dir = hub_path.join("workflows");
        std::fs::create_dir_all(&workflows_dir)
            .map_err(|e| format!("创建 workflows 目录失败: {}", e))?;
        Ok(workflows_dir.join("workflows.yaml"))
    }

    /// 加载所有工作流
    pub fn load_workflows(&self) -> Result<Vec<Workflow>, String> {
        let workflows_file = self.get_workflows_path()?;

        if !workflows_file.exists() {
            return Ok(vec![]);
        }

        let content = std::fs::read_to_string(&workflows_file)
            .map_err(|e| format!("读取 workflows.yaml 失败: {}", e))?;

        let data: WorkflowsFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 workflows.yaml 失败: {}", e))?;

        Ok(data.workflows)
    }

    /// 保存工作流（创建或更新）
    pub fn save_workflow(&self, workflow: &Workflow) -> Result<(), String> {
        let workflows_file = self.get_workflows_path()?;

        let mut data = if workflows_file.exists() {
            let content = std::fs::read_to_string(&workflows_file)
                .map_err(|e| format!("读取 workflows.yaml 失败: {}", e))?;
            serde_yaml::from_str::<WorkflowsFile>(&content)
                .map_err(|e| format!("解析 workflows.yaml 失败: {}", e))?
        } else {
            WorkflowsFile { version: 1, workflows: vec![] }
        };

        // 更新或插入
        if let Some(existing) = data.workflows.iter_mut().find(|w| w.id == workflow.id) {
            *existing = workflow.clone();
        } else {
            data.workflows.push(workflow.clone());
        }

        let yaml = serde_yaml::to_string(&data)
            .map_err(|e| format!("序列化 workflows.yaml 失败: {}", e))?;
        std::fs::write(&workflows_file, yaml)
            .map_err(|e| format!("写入 workflows.yaml 失败: {}", e))?;

        Ok(())
    }

    /// 删除工作流
    pub fn delete_workflow(&self, id: &str) -> Result<(), String> {
        let workflows_file = self.get_workflows_path()?;

        let content = std::fs::read_to_string(&workflows_file)
            .map_err(|e| format!("读取 workflows.yaml 失败: {}", e))?;
        let mut data: WorkflowsFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("解析 workflows.yaml 失败: {}", e))?;

        data.workflows.retain(|w| w.id != id);

        let yaml = serde_yaml::to_string(&data)
            .map_err(|e| format!("序列化 workflows.yaml 失败: {}", e))?;
        std::fs::write(&workflows_file, yaml)
            .map_err(|e| format!("写入 workflows.yaml 失败: {}", e))?;

        Ok(())
    }

    /// 从工作流创建任务链
    pub fn create_tasks_from_workflow(
        &self,
        workflow_id: &str,
        variables: &std::collections::HashMap<String, String>,
    ) -> Result<Vec<Task>, String> {
        let workflows = self.load_workflows()?;
        let workflow = workflows.iter().find(|w| w.id == workflow_id)
            .ok_or_else(|| format!("工作流 {} 不存在", workflow_id))?;

        let mut created_tasks = Vec::new();
        let now = Utc::now().to_rfc3339();

        for node in &workflow.nodes {
            // 替换模板变量
            let mut title = node.task_template.clone();
            for (key, value) in variables {
                title = title.replace(&format!("{{{}}}", key), value);
            }

            // 生成任务 ID
            let existing_ids: Vec<String> = self.load_tasks()?.iter().map(|t| t.id.clone()).collect();
            let mut next_num = 1;
            while existing_ids.contains(&format!("T{:03}", next_num)) {
                next_num += 1;
            }
            let task_id = format!("T{:03}", next_num);

            let task = Task {
                id: task_id.clone(),
                title: title.clone(),
                description: node.description.clone(),
                status: TaskStatus::Pending,
                priority: Priority::Medium,
                assigned_agent: Some(node.role.clone()),
                dependencies: vec![],
                tags: vec!["workflow".to_string(), workflow_id.to_string()],
                subtasks: vec![],
                created: now.clone(),
                updated: None,
                started_at: None,
                completed_at: None,
                result: None,
                error: None,
                retry_count: 0,
            };

            self.create_task(&task)?;
            created_tasks.push(task);
        }

        // 追加事件
        self.append_event(&HubEvent {
            ts: now,
            event_type: "workflow_started".to_string(),
            task_id: None,
            agent: None,
            message: Some(format!("从工作流 '{}' 创建了 {} 个任务", workflow.name, created_tasks.len())),
            files_changed: None,
        })?;

        Ok(created_tasks)
    }

    /// 启动工作流：创建任务链并启动第一个节点
    pub fn start_workflow(
        &self,
        workflow_id: &str,
        variables: &std::collections::HashMap<String, String>,
    ) -> Result<Vec<Task>, String> {
        // 1. 创建所有任务
        let tasks = self.create_tasks_from_workflow(workflow_id, variables)?;

        // 2. 找到第一个节点（没有入边的节点）
        let workflows = self.load_workflows()?;
        let workflow = workflows.iter().find(|w| w.id == workflow_id)
            .ok_or_else(|| format!("工作流 {} 不存在", workflow_id))?;

        let nodes_with_incoming: Vec<String> = workflow.edges.iter()
            .map(|e| e.to.clone())
            .collect();

        let first_node = workflow.nodes.iter()
            .find(|n| !nodes_with_incoming.contains(&n.id));

        // 3. 启动第一个任务
        if let Some(first) = first_node {
            if let Some(task) = tasks.iter().find(|t| t.assigned_agent.as_deref() == Some(&first.role)) {
                self.update_task(&task.id, &TaskUpdate {
                    status: Some(TaskStatus::Ready),
                    ..Default::default()
                })?;
            }
        }

        // 4. 保存工作流运行状态
        let run_id = format!("run-{}", uuid::Uuid::new_v4().to_string()[..8].to_string());
        let mut node_states = std::collections::HashMap::new();
        for node in &workflow.nodes {
            let is_first = first_node.map(|n| n.id.as_str()) == Some(node.id.as_str());
            let status = if is_first {
                "active".to_string()
            } else {
                "pending".to_string()
            };
            node_states.insert(node.id.clone(), status);
        }

        let run = WorkflowRun {
            id: run_id,
            workflow_id: workflow_id.to_string(),
            status: "running".to_string(),
            started_at: Utc::now().to_rfc3339(),
            completed_at: None,
            node_states,
            variables: variables.clone(),
        };

        self.save_workflow_run(&run)?;

        Ok(tasks)
    }

    /// 处理任务完成：根据工作流规则决定下一步
    pub fn handle_task_completed(&self, task_id: &str) -> Result<Option<String>, String> {
        let tasks = self.load_tasks()?;
        let task = tasks.iter().find(|t| t.id == task_id)
            .ok_or_else(|| format!("任务 {} 不存在", task_id))?;

        // 检查任务是否属于某个工作流
        let workflow_tag = task.tags.iter().find(|t| !t.starts_with("workflow")).cloned();
        if workflow_tag.is_none() {
            return Ok(None); // 不属于任何工作流
        }

        // 找到对应的工作流
        let workflows = self.load_workflows()?;
        let workflow = workflows.iter().find(|w| {
            task.tags.contains(&w.id)
        });

        if let Some(workflow) = workflow {
            // 找到当前任务对应的节点
            let current_node = workflow.nodes.iter().find(|n| {
                task.assigned_agent.as_deref() == Some(&n.role)
            });

            if let Some(current_node) = current_node {
                // 找到从当前节点出发的边，条件为 "completed"
                let next_edges: Vec<_> = workflow.edges.iter()
                    .filter(|e| e.from == current_node.id && e.condition == "completed")
                    .collect();

                if let Some(next_edge) = next_edges.first() {
                    // 找到下一个节点
                    let next_node = workflow.nodes.iter().find(|n| n.id == next_edge.to);

                    if let Some(next_node) = next_node {
                        // 创建下一个任务
                        let existing_ids: Vec<String> = tasks.iter().map(|t| t.id.clone()).collect();
                        let mut next_num = 1;
                        while existing_ids.contains(&format!("T{:03}", next_num)) {
                            next_num += 1;
                        }
                        let next_task_id = format!("T{:03}", next_num);

                        let next_task = Task {
                            id: next_task_id.clone(),
                            title: next_node.task_template.clone(),
                            description: next_node.description.clone(),
                            status: TaskStatus::Ready,
                            priority: Priority::Medium,
                            assigned_agent: Some(next_node.role.clone()),
                            dependencies: vec![task_id.to_string()],
                            tags: vec!["workflow".to_string(), workflow.id.clone()],
                            subtasks: vec![],
                            created: Utc::now().to_rfc3339(),
                            updated: None,
                            started_at: Some(Utc::now().to_rfc3339()),
                            completed_at: None,
                            result: None,
                            error: None,
                            retry_count: 0,
                        };

                        self.create_task(&next_task)?;

                        // 更新工作流运行状态
                        self.update_workflow_run_node(&workflow.id, &current_node.id, "completed")?;
                        self.update_workflow_run_node(&workflow.id, &next_node.id, "active")?;

                        // 追加事件
                        self.append_event(&HubEvent {
                            ts: Utc::now().to_rfc3339(),
                            event_type: "workflow_next".to_string(),
                            task_id: Some(next_task_id.clone()),
                            agent: Some(next_node.role.clone()),
                            message: Some(format!(
                                "工作流 '{}': 任务 {} 完成，启动下一个任务 {}",
                                workflow.name, task_id, next_task_id
                            )),
                            files_changed: None,
                        })?;

                        return Ok(Some(next_task_id));
                    }
                }

                // 没有下一个节点，工作流完成
                self.update_workflow_run_node(&workflow.id, &current_node.id, "completed")?;
                self.complete_workflow_run(&workflow.id)?;

                self.append_event(&HubEvent {
                    ts: Utc::now().to_rfc3339(),
                    event_type: "workflow_completed".to_string(),
                    task_id: None,
                    agent: None,
                    message: Some(format!("工作流 '{}' 已完成", workflow.name)),
                    files_changed: None,
                })?;
            }
        }

        Ok(None)
    }

    /// 处理消息驱动的任务路由
    pub fn handle_message_routing(&self, message: &Message) -> Result<Option<String>, String> {
        // 检查发送方的任务是否属于某个工作流
        let tasks = self.load_tasks()?;
        let sender_task = tasks.iter().find(|t| {
            t.assigned_agent.as_deref() == Some(&message.from) && t.status.as_str() == "running"
        });

        if let Some(task) = sender_task {
            let workflows = self.load_workflows()?;
            let workflow = workflows.iter().find(|w| task.tags.contains(&w.id));

            if let Some(workflow) = workflow {
                let current_node = workflow.nodes.iter().find(|n| {
                    task.assigned_agent.as_deref() == Some(&n.role)
                });

                if let Some(current_node) = current_node {
                    // 根据消息动作找对应的边
                    let matching_edge = workflow.edges.iter().find(|e| {
                        e.from == current_node.id && e.action == message.action
                    });

                    if let Some(edge) = matching_edge {
                        let next_node = workflow.nodes.iter().find(|n| n.id == edge.to);

                        if let Some(next_node) = next_node {
                            // 创建下一个任务，将消息内容作为上下文
                            let existing_ids: Vec<String> = tasks.iter().map(|t| t.id.clone()).collect();
                            let mut next_num = 1;
                            while existing_ids.contains(&format!("T{:03}", next_num)) {
                                next_num += 1;
                            }
                            let next_task_id = format!("T{:03}", next_num);

                            let description = format!(
                                "来自 {} 的消息：\n\n{}",
                                message.from, message.content
                            );

                            let next_task = Task {
                                id: next_task_id.clone(),
                                title: next_node.task_template.clone(),
                                description,
                                status: TaskStatus::Ready,
                                priority: Priority::Medium,
                                assigned_agent: Some(next_node.role.clone()),
                                dependencies: vec![task.id.clone()],
                                tags: vec!["workflow".to_string(), workflow.id.clone()],
                                subtasks: vec![],
                                created: Utc::now().to_rfc3339(),
                                updated: None,
                                started_at: Some(Utc::now().to_rfc3339()),
                                completed_at: None,
                                result: None,
                                error: None,
                                retry_count: 0,
                            };

                            self.create_task(&next_task)?;

                            self.append_event(&HubEvent {
                                ts: Utc::now().to_rfc3339(),
                                event_type: "workflow_message_route".to_string(),
                                task_id: Some(next_task_id.clone()),
                                agent: Some(next_node.role.clone()),
                                message: Some(format!(
                                    "工作流 '{}': {} 发送 {} 消息，触发任务 {}",
                                    workflow.name, message.from, message.action, next_task_id
                                )),
                                files_changed: None,
                            })?;

                            return Ok(Some(next_task_id));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// 保存工作流运行状态
    fn save_workflow_run(&self, run: &WorkflowRun) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let runs_dir = hub_path.join("workflows").join("runs");
        std::fs::create_dir_all(&runs_dir)
            .map_err(|e| format!("创建 runs 目录失败: {}", e))?;

        let run_file = runs_dir.join(format!("{}.yaml", run.id));
        let yaml = serde_yaml::to_string(run)
            .map_err(|e| format!("序列化运行状态失败: {}", e))?;
        std::fs::write(&run_file, yaml)
            .map_err(|e| format!("写入运行状态失败: {}", e))?;

        Ok(())
    }

    /// 更新工作流运行中节点的状态
    fn update_workflow_run_node(&self, workflow_id: &str, node_id: &str, status: &str) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let runs_dir = hub_path.join("workflows").join("runs");

        if !runs_dir.exists() {
            return Ok(());
        }

        // 找到最新的运行记录
        let entries = std::fs::read_dir(&runs_dir)
            .map_err(|e| format!("读取 runs 目录失败: {}", e))?;

        let mut latest_run: Option<WorkflowRun> = None;
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("yaml") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(run) = serde_yaml::from_str::<WorkflowRun>(&content) {
                        if run.workflow_id == workflow_id && run.status == "running" {
                            latest_run = Some(run);
                        }
                    }
                }
            }
        }

        if let Some(mut run) = latest_run {
            run.node_states.insert(node_id.to_string(), status.to_string());
            self.save_workflow_run(&run)?;
        }

        Ok(())
    }

    /// 完成工作流运行
    fn complete_workflow_run(&self, workflow_id: &str) -> Result<(), String> {
        let hub_path = self.get_hub_path()?;
        let runs_dir = hub_path.join("workflows").join("runs");

        if !runs_dir.exists() {
            return Ok(());
        }

        let entries = std::fs::read_dir(&runs_dir)
            .map_err(|e| format!("读取 runs 目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("yaml") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(mut run) = serde_yaml::from_str::<WorkflowRun>(&content) {
                        if run.workflow_id == workflow_id && run.status == "running" {
                            run.status = "completed".to_string();
                            run.completed_at = Some(Utc::now().to_rfc3339());
                            self.save_workflow_run(&run)?;
                            return Ok(());
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

// ============================================================
// Claude Code Agent 读取
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeAgent {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub source: String,  // "claude-code" 或 "agent-hub"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisManifest {
    pub last_analysis: String,
    #[serde(default)]
    pub scope: Vec<String>,
    #[serde(default)]
    pub file_hashes: std::collections::HashMap<String, String>,
}

/// 读取 Claude Code 的 agents 目录
pub fn load_claude_code_agents() -> Result<Vec<ClaudeCodeAgent>, String> {
    let home_dir = dirs::home_dir()
        .ok_or("无法获取用户主目录")?;
    let agents_dir = home_dir.join(".claude").join("agents");

    if !agents_dir.exists() {
        return Ok(vec![]);
    }

    let mut agents = Vec::new();

    let entries = std::fs::read_dir(&agents_dir)
        .map_err(|e| format!("读取 agents 目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        // 只读取 .json 文件
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    match serde_json::from_str::<ClaudeCodeAgent>(&content) {
                        Ok(mut agent) => {
                            agent.source = "claude-code".to_string();
                            agents.push(agent);
                        }
                        Err(e) => {
                            eprintln!("[AgentHub] 解析 {:?} 失败: {}", path, e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[AgentHub] 读取 {:?} 失败: {}", path, e);
                }
            }
        }
    }

    Ok(agents)
}
