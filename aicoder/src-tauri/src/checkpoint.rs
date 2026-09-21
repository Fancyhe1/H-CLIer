use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub file_count: i32,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointDiff {
    pub path: String,
    pub status: String, // "added", "modified", "deleted"
}

pub struct CheckpointManager {
    checkpoints_dir: std::path::PathBuf,
}

impl CheckpointManager {
    pub fn new(app_data_dir: &Path) -> Self {
        let checkpoints_dir = app_data_dir.join("checkpoints");
        fs::create_dir_all(&checkpoints_dir).ok();
        Self { checkpoints_dir }
    }

    fn get_session_checkpoints_dir(&self, session_id: &str) -> std::path::PathBuf {
        self.checkpoints_dir.join(session_id)
    }

    pub fn create_checkpoint(
        &self,
        session_id: &str,
        project_path: &str,
        name: &str,
        description: Option<&str>,
    ) -> Result<Checkpoint, String> {
        let checkpoint_id = Uuid::new_v4().to_string();
        let checkpoint_dir = self.get_session_checkpoints_dir(session_id).join(&checkpoint_id);

        // 创建检查点目录
        fs::create_dir_all(&checkpoint_dir).map_err(|e| e.to_string())?;

        // 复制项目文件
        let (file_count, size_bytes) = self.copy_directory(project_path, &checkpoint_dir)?;

        let checkpoint = Checkpoint {
            id: checkpoint_id,
            session_id: session_id.to_string(),
            name: name.to_string(),
            description: description.map(|s| s.to_string()),
            created_at: Utc::now(),
            file_count,
            size_bytes,
        };

        // 保存检查点元数据
        let meta_path = checkpoint_dir.join("checkpoint.json");
        let meta_json = serde_json::to_string_pretty(&checkpoint).map_err(|e| e.to_string())?;
        fs::write(meta_path, meta_json).map_err(|e| e.to_string())?;

        Ok(checkpoint)
    }

    fn copy_directory(&self, src: &str, dst: &Path) -> Result<(i32, i64), String> {
        let src_path = Path::new(src);
        let mut file_count = 0;
        let mut size_bytes = 0i64;

        if !src_path.exists() {
            return Ok((0, 0));
        }

        // 遍历源目录
        fn copy_recursive(
            src: &Path,
            dst: &Path,
            manager: &CheckpointManager,
            count: &mut i32,
            size: &mut i64,
        ) -> Result<(), String> {
            if src.is_dir() {
                fs::create_dir_all(dst).map_err(|e| e.to_string())?;

                for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let path = entry.path();
                    let file_name = entry.file_name();

                    // 跳过 .git, node_modules, target 等大目录
                    let file_name_str = file_name.to_string_lossy();
                    if file_name_str.starts_with('.')
                        || file_name_str == "node_modules"
                        || file_name_str == "target"
                        || file_name_str == "__pycache__"
                        || file_name_str == "dist"
                        || file_name_str == "build"
                    {
                        continue;
                    }

                    let dst_path = dst.join(&file_name);

                    if path.is_dir() {
                        copy_recursive(&path, &dst_path, manager, count, size)?;
                    } else {
                        // 复制文件
                        if let Ok(metadata) = fs::metadata(&path) {
                            *size += metadata.len() as i64;
                        }
                        fs::copy(&path, &dst_path).map_err(|e| e.to_string())?;
                        *count += 1;
                    }
                }
            }
            Ok(())
        }

        copy_recursive(src_path, dst, self, &mut file_count, &mut size_bytes)?;

        Ok((file_count, size_bytes))
    }

    pub fn list_checkpoints(&self, session_id: &str) -> Result<Vec<Checkpoint>, String> {
        let dir = self.get_session_checkpoints_dir(session_id);

        if !dir.exists() {
            return Ok(vec![]);
        }

        let mut checkpoints = Vec::new();

        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();

            if path.is_dir() {
                let meta_path = path.join("checkpoint.json");
                if meta_path.exists() {
                    if let Ok(content) = fs::read_to_string(&meta_path) {
                        if let Ok(checkpoint) = serde_json::from_str::<Checkpoint>(&content) {
                            checkpoints.push(checkpoint);
                        }
                    }
                }
            }
        }

        // 按创建时间倒序
        checkpoints.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(checkpoints)
    }

    pub fn restore_checkpoint(
        &self,
        session_id: &str,
        checkpoint_id: &str,
        project_path: &str,
    ) -> Result<CheckpointDiff, String> {
        let checkpoint_dir = self
            .get_session_checkpoints_dir(session_id)
            .join(checkpoint_id);

        if !checkpoint_dir.exists() {
            return Err("检查点不存在".to_string());
        }

        let mut diffs = Vec::new();
        let project_path = Path::new(project_path);

        // 递归比较并恢复文件
        fn restore_recursive(
            src: &Path,
            dst: &Path,
            diffs: &mut Vec<CheckpointDiff>,
        ) -> Result<(), String> {
            if src.is_dir() {
                // 如果目标不存在，先创建目录
                if !dst.exists() {
                    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
                }

                for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let src_path = entry.path();
                    let file_name = entry.file_name();

                    let file_name_str = file_name.to_string_lossy().to_string();

                    // 跳过检查点元数据文件
                    if file_name_str == "checkpoint.json" {
                        continue;
                    }

                    let dst_path = dst.join(&file_name);

                    if src_path.is_dir() {
                        restore_recursive(&src_path, &dst_path, diffs)?;
                    } else {
                        let status = if dst_path.exists() {
                            // 检查是否修改
                            if let (Ok(src_meta), Ok(dst_meta)) =
                                (fs::metadata(&src_path), fs::metadata(&dst_path))
                            {
                                if src_meta.len() != dst_meta.len()
                                    || src_meta.modified().ok() != dst_meta.modified().ok()
                                {
                                    "modified"
                                } else {
                                    continue; // 未修改，跳过
                                }
                            } else {
                                continue;
                            }
                        } else {
                            "added"
                        };

                        // 确保父目录存在
                        if let Some(parent) = dst_path.parent() {
                            fs::create_dir_all(parent).ok();
                        }

                        fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;

                        diffs.push(CheckpointDiff {
                            path: dst_path
                                .strip_prefix(dst)
                                .unwrap_or(&dst_path)
                                .to_string_lossy()
                                .to_string(),
                            status: status.to_string(),
                        });
                    }
                }

                // 检查目标中是否有检查点中不存在的文件（需要删除的）
                if dst.exists() {
                    for entry in fs::read_dir(dst).map_err(|e| e.to_string())? {
                        let entry = entry.map_err(|e| e.to_string())?;
                        let dst_path = entry.path();
                        let file_name = entry.file_name();
                        let src_path = src.join(&file_name);

                        if !src_path.exists() && file_name.to_string_lossy() != "checkpoint.json" {
                            // 文件在检查点中不存在，说明是多余的，需要删除
                            if dst_path.is_dir() {
                                fs::remove_dir_all(&dst_path).map_err(|e| e.to_string())?;
                            } else {
                                fs::remove_file(&dst_path).map_err(|e| e.to_string())?;
                            }
                            diffs.push(CheckpointDiff {
                                path: file_name.to_string_lossy().to_string(),
                                status: "deleted".to_string(),
                            });
                        }
                    }
                }
            }
            Ok(())
        }

        restore_recursive(&checkpoint_dir, project_path, &mut diffs)?;

        // 返回汇总信息
        let summary = if diffs.is_empty() {
            CheckpointDiff {
                path: "no_changes".to_string(),
                status: "no_changes".to_string(),
            }
        } else {
            diffs.first().cloned().unwrap_or(CheckpointDiff {
                path: "multiple".to_string(),
                status: "multiple".to_string(),
            })
        };

        Ok(summary)
    }

    pub fn delete_checkpoint(&self, session_id: &str, checkpoint_id: &str) -> Result<(), String> {
        let checkpoint_dir = self
            .get_session_checkpoints_dir(session_id)
            .join(checkpoint_id);

        if checkpoint_dir.exists() {
            fs::remove_dir_all(&checkpoint_dir).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn get_checkpoint_diff(
        &self,
        session_id: &str,
        checkpoint_id: &str,
        project_path: &str,
    ) -> Result<Vec<CheckpointDiff>, String> {
        let checkpoint_dir = self
            .get_session_checkpoints_dir(session_id)
            .join(checkpoint_id);

        if !checkpoint_dir.exists() {
            return Err("检查点不存在".to_string());
        }

        let mut diffs = Vec::new();
        let project_path = Path::new(project_path);

        fn compare_recursive(
            src: &Path,
            dst: &Path,
            diffs: &mut Vec<CheckpointDiff>,
        ) -> Result<(), String> {
            if src.is_dir() {
                for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let src_path = entry.path();
                    let file_name = entry.file_name();
                    let file_name_str = file_name.to_string_lossy().to_string();

                    // 跳过检查点元数据文件
                    if file_name_str == "checkpoint.json" {
                        continue;
                    }

                    let dst_path = dst.join(&file_name);

                    if src_path.is_dir() {
                        if !dst_path.exists() {
                            diffs.push(CheckpointDiff {
                                path: format!("{}/", file_name_str),
                                status: "added".to_string(),
                            });
                        }
                        compare_recursive(&src_path, &dst_path, diffs)?;
                    } else {
                        let status = if !dst_path.exists() {
                            "added"
                        } else if let (Ok(src_meta), Ok(dst_meta)) =
                            (fs::metadata(&src_path), fs::metadata(&dst_path))
                        {
                            if src_meta.len() != dst_meta.len() {
                                "modified"
                            } else {
                                continue; // 未修改
                            }
                        } else {
                            continue;
                        };

                        diffs.push(CheckpointDiff {
                            path: file_name_str,
                            status: status.to_string(),
                        });
                    }
                }

                // 检查被删除的文件
                if dst.exists() {
                    for entry in fs::read_dir(dst).map_err(|e| e.to_string())? {
                        let entry = entry.map_err(|e| e.to_string())?;
                        let dst_path = entry.path();
                        let src_path = src.join(entry.file_name());

                        if !src_path.exists() && entry.file_name().to_string_lossy() != "checkpoint.json" {
                            diffs.push(CheckpointDiff {
                                path: entry.file_name().to_string_lossy().to_string(),
                                status: "deleted".to_string(),
                            });
                        }
                    }
                }
            }
            Ok(())
        }

        compare_recursive(&checkpoint_dir, project_path, &mut diffs)?;

        Ok(diffs)
    }
}
