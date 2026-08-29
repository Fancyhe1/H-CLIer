use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Claude Code 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfig {
    /// 自定义 Claude CLI 路径
    pub cli_path: Option<String>,
    /// 默认启动参数
    pub default_args: Vec<String>,
    /// 环境变量
    pub env_vars: Vec<(String, String)>,
    /// API 配置
    pub api_config: ApiConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    /// 是否使用自定义 API
    pub use_custom_api: bool,
    /// 自定义 API 基础 URL
    pub api_base_url: Option<String>,
    /// API Key（加密存储）
    pub api_key: Option<String>,
}

impl Default for ClaudeConfig {
    fn default() -> Self {
        Self {
            cli_path: None,
            default_args: vec![],
            env_vars: vec![],
            api_config: ApiConfig::default(),
        }
    }
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            use_custom_api: false,
            api_base_url: None,
            api_key: None,
        }
    }
}

/// 应用全局配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub claude: ClaudeConfig,
    pub general: GeneralConfig,
}

/// 常用语条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhraseItem {
    /// 唯一标识
    pub id: String,
    /// 显示名称
    pub label: String,
    /// 填充内容
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralConfig {
    /// 主题设置
    pub theme: String,
    /// 默认终端字体大小
    pub terminal_font_size: u32,
    /// 是否自动启动 Claude
    pub auto_start_claude: bool,
    /// 默认导出路径
    pub default_export_path: Option<String>,
    /// 自定义快捷键绑定：actionId -> keyCombo
    #[serde(default)]
    pub keybindings: Option<HashMap<String, String>>,
    /// 自定义常用语列表
    #[serde(default)]
    pub phrases: Option<Vec<PhraseItem>>,
    /// 是否已完成新手引导
    #[serde(default)]
    pub has_completed_onboarding: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            claude: ClaudeConfig::default(),
            general: GeneralConfig::default(),
        }
    }
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            terminal_font_size: 14,
            auto_start_claude: false,
            default_export_path: None,
            keybindings: None,
            phrases: None,
            has_completed_onboarding: false,
        }
    }
}

pub struct ConfigManager {
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(config_dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        fs::create_dir_all(config_dir)?;
        let config_path = config_dir.join("settings.json");

        Ok(Self { config_path })
    }

    /// 加载配置
    pub fn load(&self) -> Result<AppConfig, Box<dyn std::error::Error>> {
        if self.config_path.exists() {
            let content = fs::read_to_string(&self.config_path)?;
            let config: AppConfig = serde_json::from_str(&content)?;
            Ok(config)
        } else {
            Ok(AppConfig::default())
        }
    }

    /// 保存配置
    pub fn save(&self, config: &AppConfig) -> Result<(), Box<dyn std::error::Error>> {
        let content = serde_json::to_string_pretty(config)?;
        fs::write(&self.config_path, content)?;
        Ok(())
    }

    /// 更新 Claude 配置
    pub fn update_claude_config(
        &self,
        config: ClaudeConfig,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut app_config = self.load()?;
        app_config.claude = config;
        self.save(&app_config)
    }

    /// 更新通用配置
    pub fn update_general_config(
        &self,
        config: GeneralConfig,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut app_config = self.load()?;
        app_config.general = config;
        self.save(&app_config)
    }
}
