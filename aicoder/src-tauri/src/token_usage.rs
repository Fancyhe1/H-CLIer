use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Seek, SeekFrom};

use crate::history::get_session_jsonl_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageDelta {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub cost: f64,
    pub model: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageResult {
    pub deltas: Vec<SessionUsageDelta>,
    pub new_file_offset: u64,
}

struct ModelPricing {
    input_per_million: f64,
    output_per_million: f64,
    cache_creation_per_million: f64,
    cache_read_per_million: f64,
}

fn get_model_pricing(model: &str) -> ModelPricing {
    if model.starts_with("claude-opus-4") || model.starts_with("claude-4-opus") {
        ModelPricing {
            input_per_million: 15.0,
            output_per_million: 75.0,
            cache_creation_per_million: 18.75,
            cache_read_per_million: 1.50,
        }
    } else if model.starts_with("claude-sonnet-4") || model.starts_with("claude-4-sonnet") {
        ModelPricing {
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_creation_per_million: 3.75,
            cache_read_per_million: 0.30,
        }
    } else if model.starts_with("claude-3-5-sonnet") || model.starts_with("claude-3.5-sonnet") {
        ModelPricing {
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_creation_per_million: 3.75,
            cache_read_per_million: 0.30,
        }
    } else if model.starts_with("claude-3-opus") {
        ModelPricing {
            input_per_million: 15.0,
            output_per_million: 75.0,
            cache_creation_per_million: 18.75,
            cache_read_per_million: 1.50,
        }
    } else if model.starts_with("claude-3-haiku") || model.starts_with("claude-3.5-haiku") {
        ModelPricing {
            input_per_million: 0.80,
            output_per_million: 4.0,
            cache_creation_per_million: 1.0,
            cache_read_per_million: 0.08,
        }
    } else {
        // Default to Sonnet pricing
        ModelPricing {
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_creation_per_million: 3.75,
            cache_read_per_million: 0.30,
        }
    }
}

fn calculate_cost(pricing: &ModelPricing, input: u64, output: u64, cache_create: u64, cache_read: u64) -> f64 {
    (input as f64 / 1_000_000.0) * pricing.input_per_million
        + (output as f64 / 1_000_000.0) * pricing.output_per_million
        + (cache_create as f64 / 1_000_000.0) * pricing.cache_creation_per_million
        + (cache_read as f64 / 1_000_000.0) * pricing.cache_read_per_million
}

struct DailyAccumulator {
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
    model: String,
}

/// Incrementally scan a Claude session JSONL file for token usage since last_offset.
/// Returns per-date usage deltas.
pub fn scan_session_usage(
    session_id: &str,
    project_path: &str,
    last_offset: u64,
) -> Result<SessionUsageResult, String> {
    let jsonl_path = get_session_jsonl_path(session_id, project_path)?;

    if !jsonl_path.exists() {
        return Ok(SessionUsageResult {
            deltas: Vec::new(),
            new_file_offset: 0,
        });
    }

    let file = fs::File::open(&jsonl_path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let file_len = file.metadata().map(|m| m.len()).unwrap_or(0);

    // If file was truncated (shorter than last_offset), reset to beginning
    let offset = if last_offset > file_len {
        0
    } else {
        last_offset
    };

    let mut reader = BufReader::new(file);
    if offset > 0 {
        reader.seek(SeekFrom::Start(offset))
            .map_err(|e| format!("Failed to seek: {}", e))?;
    }

    // 按日期分组累加
    let mut daily_map: HashMap<String, DailyAccumulator> = HashMap::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = match v.get("type").and_then(|t| t.as_str()) {
            Some(t) => t,
            None => continue,
        };

        if event_type != "assistant" {
            continue;
        }

        let usage = match v.get("message").and_then(|m| m.get("usage")) {
            Some(u) => u,
            None => continue,
        };

        let input = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let output = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_creation = usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_read = usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);

        let model = v.get("message")
            .and_then(|m| m.get("model"))
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_string();

        let timestamp = v.get("timestamp")
            .and_then(|t| t.as_str())
            .unwrap_or("");

        // 从 timestamp 提取日期 (前10个字符: "2026-04-16")
        let date = if timestamp.len() >= 10 {
            timestamp[..10].to_string()
        } else {
            continue // 无法确定日期，跳过
        };

        let entry = daily_map.entry(date).or_insert(DailyAccumulator {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            model: model.clone(),
        });
        entry.input_tokens += input;
        entry.output_tokens += output;
        entry.cache_creation_tokens += cache_creation;
        entry.cache_read_tokens += cache_read;
        // 保留最新的 model
        if !model.is_empty() {
            entry.model = model;
        }
    }

    // 转换为 Vec<SessionUsageDelta>
    let deltas: Vec<SessionUsageDelta> = daily_map
        .into_iter()
        .map(|(date, acc)| {
            let pricing = get_model_pricing(&acc.model);
            let cost = calculate_cost(
                &pricing,
                acc.input_tokens,
                acc.output_tokens,
                acc.cache_creation_tokens,
                acc.cache_read_tokens,
            );
            SessionUsageDelta {
                input_tokens: acc.input_tokens,
                output_tokens: acc.output_tokens,
                cache_creation_tokens: acc.cache_creation_tokens,
                cache_read_tokens: acc.cache_read_tokens,
                cost,
                model: acc.model,
                date,
            }
        })
        .collect();

    Ok(SessionUsageResult {
        deltas,
        new_file_offset: file_len,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTotalUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub cost: f64,
    pub model: String,
}

/// Scan entire JSONL file and return total token usage for the session.
pub fn get_session_total_usage(
    session_id: &str,
    project_path: &str,
) -> Result<SessionTotalUsage, String> {
    let jsonl_path = get_session_jsonl_path(session_id, project_path)?;

    if !jsonl_path.exists() {
        return Ok(SessionTotalUsage {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            cost: 0.0,
            model: String::new(),
        });
    }

    let file = fs::File::open(&jsonl_path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;
    let reader = BufReader::new(file);

    let mut total_input: u64 = 0;
    let mut total_output: u64 = 0;
    let mut total_cache_creation: u64 = 0;
    let mut total_cache_read: u64 = 0;
    let mut model = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if v.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }

        let usage = match v.get("message").and_then(|m| m.get("usage")) {
            Some(u) => u,
            None => continue,
        };

        total_input += usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        total_output += usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        total_cache_creation += usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        total_cache_read += usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);

        if let Some(m) = v.get("message").and_then(|m| m.get("model")).and_then(|m| m.as_str()) {
            model = m.to_string();
        }
    }

    let pricing = get_model_pricing(&model);
    let cost = calculate_cost(&pricing, total_input, total_output, total_cache_creation, total_cache_read);

    Ok(SessionTotalUsage {
        input_tokens: total_input,
        output_tokens: total_output,
        cache_creation_tokens: total_cache_creation,
        cache_read_tokens: total_cache_read,
        cost,
        model,
    })
}
