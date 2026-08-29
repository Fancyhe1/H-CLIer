use chrono::{DateTime, Utc};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::path::Path;

// License state persisted in SQLite
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseState {
    pub is_activated: bool,
    pub invitation_code: Option<String>,
    pub machine_id: String,
    pub activated_at: Option<DateTime<Utc>>,
    pub last_validated_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub license_tier: Option<String>,
    pub server_signature: Option<String>,
    pub offline_grace_days: i32,
}

impl Default for LicenseState {
    fn default() -> Self {
        Self {
            is_activated: false,
            invitation_code: None,
            machine_id: String::new(),
            activated_at: None,
            last_validated_at: None,
            expires_at: None,
            license_tier: None,
            server_signature: None,
            offline_grace_days: 7,
        }
    }
}

// License status returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub is_activated: bool,
    pub status: String, // "not_activated", "activated", "expired", "invalid"
    pub tier: Option<String>,
    pub expires_at: Option<String>,
    pub message: Option<String>,
}

impl Default for LicenseStatus {
    fn default() -> Self {
        Self {
            is_activated: false,
            status: "not_activated".to_string(),
            tier: None,
            expires_at: None,
            message: None,
        }
    }
}

// Server validation response
#[derive(Debug, Deserialize)]
pub struct ValidationResponse {
    pub valid: bool,
    #[serde(default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub offline_grace_days: Option<i32>,
    #[serde(default)]
    pub signature: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
}

pub struct LicenseManager {
    conn: Connection,
    machine_id: String,
    server_url: String,
}

impl LicenseManager {
    pub fn new(db_path: &Path, app_dir: &Path) -> Result<Self, String> {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open license database: {}", e))?;

        // Create license table
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS license (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                is_activated INTEGER NOT NULL DEFAULT 0,
                invitation_code TEXT,
                machine_id TEXT NOT NULL,
                activated_at TEXT,
                last_validated_at TEXT,
                expires_at TEXT,
                license_tier TEXT,
                server_signature TEXT,
                offline_grace_days INTEGER DEFAULT 7
            )
            "#,
            [],
        )
        .map_err(|e| format!("Failed to create license table: {}", e))?;

        // Generate or load machine ID
        let machine_id = Self::generate_machine_id(app_dir)?;

        // License server URL: env var > default
        // TODO: 发布时改为生产地址
        let server_url = std::env::var("LICENSE_SERVER_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string());

        Ok(Self { conn, machine_id, server_url })
    }

    fn generate_machine_id(app_dir: &Path) -> Result<String, String> {
        // First, try to load existing machine ID from license table
        let db_path = app_dir.join("sessions.db");
        if db_path.exists() {
            if let Ok(conn) = Connection::open(&db_path) {
                let result: Result<String, _> = conn.query_row(
                    "SELECT machine_id FROM license WHERE id = 1",
                    [],
                    |row| row.get(0),
                );
                if let Ok(machine_id) = result {
                    if !machine_id.is_empty() {
                        return Ok(machine_id);
                    }
                }
            }
        }

        // Generate new machine ID using Windows Machine GUID
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let output = Command::new("reg")
                .args([
                    "query",
                    "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
                    "/v",
                    "MachineGuid",
                ])
                .output();

            if let Ok(output) = output {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if line.contains("MachineGuid") {
                        if let Some(guid) = line.split_whitespace().last() {
                            let mut hasher = Sha256::new();
                            hasher.update(guid.as_bytes());
                            let result = hasher.finalize();
                            return Ok(format!("{:x}", result));
                        }
                    }
                }
            }
        }

        // Fallback: generate random UUID and store
        let uuid = uuid::Uuid::new_v4().to_string();
        let mut hasher = Sha256::new();
        hasher.update(uuid.as_bytes());
        let result = hasher.finalize();
        Ok(format!("{:x}", result))
    }

    pub fn get_machine_id(&self) -> String {
        self.machine_id.clone()
    }

    pub fn get_state(&self) -> Result<LicenseState, String> {
        let state = self
            .conn
            .query_row(
                "SELECT is_activated, invitation_code, machine_id, activated_at, last_validated_at, expires_at, license_tier, server_signature, offline_grace_days FROM license WHERE id = 1",
                [],
                |row| {
                    Ok(LicenseState {
                        is_activated: row.get::<_, i32>(0)? != 0,
                        invitation_code: row.get(1)?,
                        machine_id: row.get(2)?,
                        activated_at: row.get::<_, Option<String>>(3)?
                            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                            .map(|dt| dt.with_timezone(&Utc)),
                        last_validated_at: row.get::<_, Option<String>>(4)?
                            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                            .map(|dt| dt.with_timezone(&Utc)),
                        expires_at: row.get::<_, Option<String>>(5)?
                            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                            .map(|dt| dt.with_timezone(&Utc)),
                        license_tier: row.get(6)?,
                        server_signature: row.get(7)?,
                        offline_grace_days: row.get::<_, i32>(8)?,
                    })
                },
            )
            .unwrap_or_default();

        Ok(state)
    }

    pub fn get_status(&self) -> Result<LicenseStatus, String> {
        let state = self.get_state()?;

        if !state.is_activated {
            return Ok(LicenseStatus {
                is_activated: false,
                status: "not_activated".to_string(),
                tier: None,
                expires_at: None,
                message: Some("请输入邀请码激活应用".to_string()),
            });
        }

        // Check expiry
        if let Some(expires_at) = state.expires_at {
            if Utc::now() > expires_at {
                return Ok(LicenseStatus {
                    is_activated: false,
                    status: "expired".to_string(),
                    tier: state.license_tier,
                    expires_at: Some(expires_at.to_rfc3339()),
                    message: Some("许可证已过期，请续费".to_string()),
                });
            }
        }

        // Check offline grace period
        if let Some(last_validated) = state.last_validated_at {
            let grace_end = last_validated + chrono::Duration::days(state.offline_grace_days as i64);
            if Utc::now() > grace_end {
                return Ok(LicenseStatus {
                    is_activated: false,
                    status: "expired".to_string(),
                    tier: state.license_tier,
                    expires_at: state.expires_at.map(|e| e.to_rfc3339()),
                    message: Some("离线宽限期已过，请联网验证".to_string()),
                });
            }
        }

        Ok(LicenseStatus {
            is_activated: true,
            status: "activated".to_string(),
            tier: state.license_tier,
            expires_at: state.expires_at.map(|e| e.to_rfc3339()),
            message: None,
        })
    }

    pub fn activate(&self, invitation_code: &str) -> Result<LicenseState, String> {
        // Try online validation
        let response = self.validate_online(invitation_code)?;

        if !response.valid {
            return Err(response.error_message.unwrap_or_else(|| "邀请码无效".to_string()));
        }

        let now = Utc::now();
        let expires_at = response.expires_at
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc));

        let offline_grace_days = response.offline_grace_days.unwrap_or(7);

        // Upsert license state
        self.conn.execute(
            r#"
            INSERT INTO license (id, is_activated, invitation_code, machine_id, activated_at, last_validated_at, expires_at, license_tier, server_signature, offline_grace_days)
            VALUES (1, 1, ?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
                is_activated = 1,
                invitation_code = ?1,
                machine_id = ?2,
                activated_at = ?3,
                last_validated_at = ?3,
                expires_at = ?4,
                license_tier = ?5,
                server_signature = ?6,
                offline_grace_days = ?7
            "#,
            params![
                invitation_code,
                self.machine_id,
                now.to_rfc3339(),
                expires_at.map(|e| e.to_rfc3339()),
                response.tier,
                response.signature,
                offline_grace_days,
            ],
        ).map_err(|e| format!("Failed to save license: {}", e))?;

        self.get_state()
    }

    fn validate_online(&self, invitation_code: &str) -> Result<ValidationResponse, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("HTTP client error: {}", e))?;

        #[derive(Serialize)]
        struct RequestBody<'a> {
            invitation_code: &'a str,
            machine_id: &'a str,
            app_version: &'a str,
        }

        let request_body = RequestBody {
            invitation_code,
            machine_id: &self.machine_id,
            app_version: env!("CARGO_PKG_VERSION"),
        };

        let response = client
            .post(&format!("{}/api/v1/validate", self.server_url))
            .json(&request_body)
            .send();

        match response {
            Ok(resp) => {
                if resp.status().is_success() {
                    resp.json::<ValidationResponse>()
                        .map_err(|e| format!("Failed to parse response: {}", e))
                } else {
                    Err(format!("Server error: {}", resp.status()))
                }
            }
            Err(e) => {
                Err(format!("无法连接到验证服务器: {}", e))
            }
        }
    }

    pub fn revalidate(&self) -> Result<LicenseStatus, String> {
        // For simplicity, just return current status
        // In production, this would attempt online re-validation
        self.get_status()
    }

    /// Check if the current license is Pro tier
    pub fn is_pro(&self) -> bool {
        let status = self.get_status().unwrap_or_default();
        status.is_activated && status.tier.as_deref() == Some("pro")
    }

    /// Check free-tier limits
    pub fn check_limit(&self, feature: &str, current_count: usize) -> Result<(), String> {
        if self.is_pro() {
            return Ok(());
        }

        match feature {
            "project_sessions" => {
                if current_count >= 3 {
                    return Err("免费版最多支持 3 个项目会话，升级 Pro 解锁无限".to_string());
                }
            }
            "terminal_sessions" => {
                if current_count >= 2 {
                    return Err("免费版最多支持 2 个终端会话，升级 Pro 解锁无限".to_string());
                }
            }
            "checkpoints_per_project" => {
                if current_count >= 3 {
                    return Err("免费版每项目最多 3 个快照，升级 Pro 解锁无限".to_string());
                }
            }
            _ => {}
        }

        Ok(())
    }
}
