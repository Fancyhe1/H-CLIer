use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use std::path::Path;

// 会话类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionType {
    Claude,
    Terminal,
}

impl Default for SessionType {
    fn default() -> Self {
        Self::Claude
    }
}

impl From<String> for SessionType {
    fn from(s: String) -> Self {
        match s.as_str() {
            "terminal" => Self::Terminal,
            _ => Self::Claude,
        }
    }
}

impl SessionType {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Claude => "claude",
            Self::Terminal => "terminal",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project_path: String,
    pub title: String,
    #[serde(rename = "sessionType")]
    pub session_type: String,  // "claude" 或 "terminal"
    pub color: Option<String>,
    pub is_favorite: bool,
    pub is_active: bool,
    pub is_archived: bool,  // 是否归档
    pub created_at: DateTime<Utc>,
    pub last_activity_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,  // 删除时间，用于回收站
    pub archived_at: Option<DateTime<Utc>>,  // 归档时间
    pub message_count: i64,
    pub cli_session_id: Option<String>,
    pub description: Option<String>,
    pub sort_order: i64,
}

pub struct SessionManager {
    conn: Connection,
}

impl SessionManager {
    pub fn new(db_path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;

        // 创建表
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                project_path TEXT NOT NULL,
                title TEXT NOT NULL,
                session_type TEXT DEFAULT 'claude',
                color TEXT,
                is_favorite INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP,
                message_count INTEGER DEFAULT 0,
                cli_session_id TEXT,
                description TEXT
            )
            "#,
            [],
        )?;

        // 迁移：添加 session_type 列（如果不存在）
        let _ = conn.execute(
            "ALTER TABLE sessions ADD COLUMN session_type TEXT DEFAULT 'claude'",
            [],
        );

        // 迁移：添加 deleted_at 列（如果不存在）
        let _ = conn.execute(
            "ALTER TABLE sessions ADD COLUMN deleted_at TIMESTAMP",
            [],
        );

        // 迁移：添加 sort_order 列（如果不存在）
        let _ = conn.execute(
            "ALTER TABLE sessions ADD COLUMN sort_order INTEGER DEFAULT 0",
            [],
        );

        // 迁移：添加 is_archived 列（如果不存在）
        let _ = conn.execute(
            "ALTER TABLE sessions ADD COLUMN is_archived INTEGER DEFAULT 0",
            [],
        );

        // 迁移：添加 archived_at 列（如果不存在）
        let _ = conn.execute(
            "ALTER TABLE sessions ADD COLUMN archived_at TIMESTAMP",
            [],
        );

        // 创建索引
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_project_path ON sessions(project_path)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_last_activity ON sessions(last_activity_at DESC)",
            [],
        )?;

        // 保留 cli_session_id，用于判断会话是否曾经启动过
        // 不再在启动时清除，以便重新打开会话时使用 --resume

        Ok(Self { conn })
    }

    pub fn create_session(
        &self,
        project_path: &str,
        title: Option<&str>,
        session_type: Option<&str>,
        cli_session_id: Option<&str>,
    ) -> Result<Session, rusqlite::Error> {
        let id = uuid::Uuid::new_v4().to_string();
        let session_type = session_type.unwrap_or("claude").to_string();
        let title = title.map(|t| t.to_string())
            .unwrap_or_else(|| {
                let prefix = if session_type == "claude" { "Claude" } else { "终端" };
                format!("{} {}", prefix, chrono::Local::now().format("%m-%d %H:%M"))
            });

        let now = Utc::now();

        // 计算最小 sort_order，新会话排在最前面
        let min_sort_order: i64 = self.conn
            .query_row(
                "SELECT COALESCE(MIN(sort_order), 0) FROM sessions WHERE is_active = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let sort_order = min_sort_order - 1;

        self.conn.execute(
            r#"
            INSERT INTO sessions (id, project_path, title, session_type, color, is_favorite, is_active, is_archived,
                created_at, last_activity_at, deleted_at, archived_at, message_count, cli_session_id, description, sort_order)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
            "#,
            params![
                &id,
                project_path,
                &title,
                &session_type,
                None::<&str>,
                0i32,
                1i32,
                0i32,
                now,
                now,
                None::<DateTime<Utc>>,
                None::<DateTime<Utc>>,
                0i64,
                cli_session_id,
                None::<&str>,
                sort_order,
            ],
        )?;

        Ok(Session {
            id,
            project_path: project_path.to_string(),
            title,
            session_type,
            color: None,
            is_favorite: false,
            is_active: true,
            is_archived: false,
            created_at: now,
            last_activity_at: now,
            deleted_at: None,
            archived_at: None,
            message_count: 0,
            cli_session_id: cli_session_id.map(|s| s.to_string()),
            description: None,
            sort_order,
        })
    }

    pub fn get_sessions(&self) -> Result<Vec<Session>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT id, project_path, title, session_type, color, is_favorite, is_active, is_archived,
                created_at, last_activity_at, deleted_at, archived_at, message_count, cli_session_id, description, sort_order
            FROM sessions
            WHERE is_active = 1 AND (is_archived = 0 OR is_archived IS NULL)
            ORDER BY sort_order ASC, last_activity_at DESC
            "#
        )?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                project_path: row.get(1)?,
                title: row.get(2)?,
                session_type: row.get(3)?,
                color: row.get(4)?,
                is_favorite: row.get::<_, i32>(5)? != 0,
                is_active: row.get::<_, i32>(6)? != 0,
                is_archived: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                last_activity_at: row.get(9)?,
                deleted_at: row.get(10)?,
                archived_at: row.get(11)?,
                message_count: row.get(12)?,
                cli_session_id: row.get(13)?,
                description: row.get(14)?,
                sort_order: row.get(15)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    pub fn get_archived_sessions(&self) -> Result<Vec<Session>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT id, project_path, title, session_type, color, is_favorite, is_active, is_archived,
                created_at, last_activity_at, deleted_at, archived_at, message_count, cli_session_id, description, sort_order
            FROM sessions
            WHERE is_active = 1 AND is_archived = 1
            ORDER BY archived_at DESC
            "#
        )?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                project_path: row.get(1)?,
                title: row.get(2)?,
                session_type: row.get(3)?,
                color: row.get(4)?,
                is_favorite: row.get::<_, i32>(5)? != 0,
                is_active: row.get::<_, i32>(6)? != 0,
                is_archived: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                last_activity_at: row.get(9)?,
                deleted_at: row.get(10)?,
                archived_at: row.get(11)?,
                message_count: row.get(12)?,
                cli_session_id: row.get(13)?,
                description: row.get(14)?,
                sort_order: row.get(15)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    pub fn get_trash_sessions(&self) -> Result<Vec<Session>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT id, project_path, title, session_type, color, is_favorite, is_active, is_archived,
                created_at, last_activity_at, deleted_at, archived_at, message_count, cli_session_id, description, sort_order
            FROM sessions
            WHERE is_active = 0
            ORDER BY deleted_at DESC
            "#
        )?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                project_path: row.get(1)?,
                title: row.get(2)?,
                session_type: row.get(3)?,
                color: row.get(4)?,
                is_favorite: row.get::<_, i32>(5)? != 0,
                is_active: row.get::<_, i32>(6)? != 0,
                is_archived: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                last_activity_at: row.get(9)?,
                deleted_at: row.get(10)?,
                archived_at: row.get(11)?,
                message_count: row.get(12)?,
                cli_session_id: row.get(13)?,
                description: row.get(14)?,
                sort_order: row.get(15)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    /// 仅更新会话的最后活动时间
    pub fn touch_session(&self, session_id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE sessions SET last_activity_at = ?1 WHERE id = ?2",
            params![Utc::now(), session_id],
        )?;
        Ok(())
    }

    pub fn update_session(&self, session: &Session) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            r#"
            UPDATE sessions SET
                project_path = ?1,
                title = ?2,
                session_type = ?3,
                color = ?4,
                is_favorite = ?5,
                is_active = ?6,
                last_activity_at = ?7,
                deleted_at = ?8,
                message_count = ?9,
                cli_session_id = ?10,
                description = ?11,
                sort_order = ?12
            WHERE id = ?13
            "#,
            params![
                &session.project_path,
                &session.title,
                &session.session_type,
                &session.color,
                session.is_favorite as i32,
                session.is_active as i32,
                session.last_activity_at,
                &session.deleted_at,
                session.message_count,
                &session.cli_session_id,
                &session.description,
                session.sort_order,
                &session.id,
            ],
        )?;

        Ok(())
    }

    pub fn reorder_sessions(&self, session_ids: &[String]) -> Result<(), rusqlite::Error> {
        let tx = self.conn.unchecked_transaction()?;
        for (i, id) in session_ids.iter().enumerate() {
            tx.execute(
                "UPDATE sessions SET sort_order = ?1 WHERE id = ?2",
                params![i as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn move_to_trash(&self, session_id: &str) -> Result<(), rusqlite::Error> {
        let now = Utc::now();
        self.conn.execute(
            "UPDATE sessions SET is_active = 0, deleted_at = ?1 WHERE id = ?2",
            params![now, session_id],
        )?;

        Ok(())
    }

    pub fn restore_from_trash(&self, session_id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE sessions SET is_active = 1, deleted_at = NULL WHERE id = ?1",
            params![session_id],
        )?;

        Ok(())
    }

    pub fn permanently_delete(&self, session_id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM sessions WHERE id = ?1",
            params![session_id],
        )?;

        Ok(())
    }

    pub fn empty_trash(&self) -> Result<usize, rusqlite::Error> {
        let rows_affected = self.conn.execute(
            "DELETE FROM sessions WHERE is_active = 0",
            [],
        )?;

        Ok(rows_affected)
    }

    pub fn delete_session(&self, session_id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE sessions SET is_active = 0, deleted_at = ?1 WHERE id = ?2",
            params![Utc::now(), session_id],
        )?;

        Ok(())
    }

    pub fn delete_sessions_by_path(&self, project_path: &str) -> Result<usize, rusqlite::Error> {
        let now = Utc::now();
        let rows_affected = self.conn.execute(
            "UPDATE sessions SET is_active = 0, deleted_at = ?1 WHERE project_path = ?2",
            params![now, project_path],
        )?;

        Ok(rows_affected)
    }

    // 归档会话
    pub fn archive_session(&self, session_id: &str) -> Result<(), rusqlite::Error> {
        let now = Utc::now();
        self.conn.execute(
            "UPDATE sessions SET is_archived = 1, archived_at = ?1 WHERE id = ?2",
            params![now, session_id],
        )?;
        Ok(())
    }

    // 取消归档（恢复会话）
    pub fn unarchive_session(&self, session_id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE sessions SET is_archived = 0, archived_at = NULL WHERE id = ?1",
            params![session_id],
        )?;
        Ok(())
    }

    // 按路径归档整个工作空间的会话
    pub fn archive_sessions_by_path(&self, project_path: &str) -> Result<usize, rusqlite::Error> {
        let now = Utc::now();
        let rows_affected = self.conn.execute(
            "UPDATE sessions SET is_archived = 1, archived_at = ?1 WHERE project_path = ?2 AND is_active = 1",
            params![now, project_path],
        )?;
        Ok(rows_affected)
    }

    // 按路径取消归档整个工作空间的会话
    pub fn unarchive_sessions_by_path(&self, project_path: &str) -> Result<usize, rusqlite::Error> {
        let rows_affected = self.conn.execute(
            "UPDATE sessions SET is_archived = 0, archived_at = NULL WHERE project_path = ?2 AND is_active = 1",
            params![project_path],
        )?;
        Ok(rows_affected)
    }
}
