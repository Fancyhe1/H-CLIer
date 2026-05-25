use serde::{Deserialize, Serialize};
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
    pub timestamp: String,
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

/// Incrementally scan a Claude session JSONL file for token usage since last_offset.
pub fn scan_session_usage(
    session_id: &str,
    project_path: &str,
    last_offset: u64,
) -> Result<SessionUsageDelta, String> {
    let jsonl_path = get_session_jsonl_path(session_id, project_path)?;

    if !jsonl_path.exists() {
        return Ok(SessionUsageDelta {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            cost: 0.0,
            model: String::new(),
            timestamp: String::new(),
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

    let mut total_input: u64 = 0;
    let mut total_output: u64 = 0;
    let mut total_cache_creation: u64 = 0;
    let mut total_cache_read: u64 = 0;
    let mut model = String::new();
    let mut last_timestamp = String::new();

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

        total_input += input;
        total_output += output;
        total_cache_creation += cache_creation;
        total_cache_read += cache_read;

        // Track model and timestamp from the latest entry
        if let Some(m) = v.get("message").and_then(|m| m.get("model")).and_then(|m| m.as_str()) {
            model = m.to_string();
        }
        if let Some(ts) = v.get("timestamp").and_then(|t| t.as_str()) {
            last_timestamp = ts.to_string();
        }
    }

    // Calculate new offset (current file position)
    let new_offset = offset + {
        // Re-read to get actual bytes consumed
        // The BufReader may have buffered past what we consumed,
        // so use file_len as the new offset since we read to EOF
        file_len - offset
    };

    let pricing = get_model_pricing(&model);
    let cost = calculate_cost(&pricing, total_input, total_output, total_cache_creation, total_cache_read);

    Ok(SessionUsageDelta {
        input_tokens: total_input,
        output_tokens: total_output,
        cache_creation_tokens: total_cache_creation,
        cache_read_tokens: total_cache_read,
        cost,
        model,
        timestamp: last_timestamp,
        new_file_offset: file_len,
    })
}
