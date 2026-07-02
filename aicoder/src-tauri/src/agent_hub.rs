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
    pub id: String,
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

        let original_len = tasks_data.tasks.len();
        tasks_data.tasks.retain(|t| t.id != id);

        if tasks_data.tasks.len() == original_len {
            return Err(format!("任务 {} 不存在", id));
        }

        let yaml = serde_yaml::to_string(&tasks_data)
            .map_err(|e| format!("序列化 tasks.yaml 失败: {}", e))?;
        std::fs::write(&tasks_file, yaml)
            .map_err(|e| format!("写入 tasks.yaml 失败: {}", e))?;

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

        // 更新或插入
        if let Some(existing) = agents_data.agents.iter_mut().find(|a| a.id == role.id) {
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

        agents_data.agents.retain(|a| a.id != id);

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
    pub fn build_context_with_agent(&self, task_id: &str, agent_role: Option<&AgentRole>) -> Result<String, String> {
        let mut context = String::new();

        // 1. Agent 角色信息
        if let Some(role) = agent_role {
            context.push_str(&format!(
                "## 你的角色\n\n你是 **{}**（{}）。\n",
                role.name, role.id
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

        // 2. 项目 brain
        let sections = ["architecture", "decisions", "conventions"];
        for section in &sections {
            if let Ok(content) = self.load_brain_section(section) {
                if !content.trim().is_empty() {
                    context.push_str(&format!("## {}\n\n{}\n\n", section, content));
                }
            }
        }

        if let Ok(state) = self.load_brain_section("state/current") {
            if !state.trim().is_empty() {
                context.push_str(&format!("## 当前状态\n\n{}\n\n", state));
            }
        }

        if let Ok(blockers) = self.load_brain_section("state/blockers") {
            if !blockers.trim().is_empty() {
                context.push_str(&format!("## 已知阻塞项\n\n{}\n\n", blockers));
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
            ("conventions", "代码规范"),
            ("decisions", "技术决策"),
            ("other", "其他补充"),
        ];

        for (section_key, section_title) in &sections_to_include {
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

        let state_file = hub_path.join("brain").join("state").join("current.md");
        if state_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&state_file) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    md.push_str(&format!("## 当前状态\n\n{}\n\n", trimmed));
                }
            }
        }

        let blockers_file = hub_path.join("brain").join("state").join("blockers.md");
        if blockers_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&blockers_file) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    md.push_str(&format!("## 已知阻塞项\n\n{}\n\n", trimmed));
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
    pub fn run_task(&self, task_id: &str, agent_role_id: Option<&str>) -> Result<String, String> {
        let tasks = self.load_tasks()?;
        let task = tasks.iter().find(|t| t.id == task_id)
            .ok_or_else(|| format!("任务 {} 不存在", task_id))?;

        if task.status.as_str() == "running" {
            return Err(format!("任务 {} 已在运行中", task_id));
        }

        // 查找 Agent 角色
        let agent_roles = self.load_agent_roles()?;
        let agent_role = agent_role_id
            .and_then(|id| agent_roles.iter().find(|r| r.id == id));

        // 生成 Worker ID
        let worker_id = format!("{}-{}", task_id, uuid::Uuid::new_v4().to_string()[..8].to_string());

        // 构建上下文（Agent 角色 + 项目 brain + 任务描述）
        let context = self.build_context_with_agent(task_id, agent_role)?;

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
