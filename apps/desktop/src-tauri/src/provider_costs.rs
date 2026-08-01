use crate::error::{AppError, AppResult};
use chrono::{Datelike, Local, TimeZone, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const COST_DB_FILE: &str = "provider-costs.sqlite3";

#[derive(Debug, Clone)]
pub struct ProviderCostRecord {
    pub provider_request_id: Option<String>,
    pub provider_id: String,
    pub model_id: String,
    pub upstream_provider: Option<String>,
    pub operation: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub cached_input_tokens: u64,
    pub reasoning_tokens: u64,
    pub cost_micros: Option<i64>,
    pub cost_source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCostBucket {
    pub provider_id: String,
    pub cost_micros: i64,
    pub request_count: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub estimated_request_count: u64,
    pub unpriced_request_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProviderCost {
    pub id: String,
    pub occurred_at: String,
    pub provider_id: String,
    pub model_id: String,
    pub upstream_provider: Option<String>,
    pub operation: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_micros: Option<i64>,
    pub cost_source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCostSummary {
    pub period_start: String,
    pub period_end: String,
    pub currency: String,
    pub total_cost_micros: i64,
    pub request_count: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub estimated_request_count: u64,
    pub unpriced_request_count: u64,
    pub lifetime_cost_micros: i64,
    pub lifetime_request_count: u64,
    pub monthly_budget_micros: Option<i64>,
    pub by_provider: Vec<ProviderCostBucket>,
    pub recent: Vec<RecentProviderCost>,
}

fn database_path(app: &AppHandle) -> AppResult<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::GenerationProvider(error.to_string()))?;
    std::fs::create_dir_all(&directory)?;
    Ok(directory.join(COST_DB_FILE))
}

fn open_database(app: &AppHandle) -> AppResult<Connection> {
    let connection = Connection::open(database_path(app)?)?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS provider_cost_events (
           id TEXT PRIMARY KEY,
           occurred_at TEXT NOT NULL,
           provider_request_id TEXT,
           provider_id TEXT NOT NULL,
           model_id TEXT NOT NULL,
           upstream_provider TEXT,
           operation TEXT NOT NULL,
           input_tokens INTEGER NOT NULL DEFAULT 0,
           output_tokens INTEGER NOT NULL DEFAULT 0,
           total_tokens INTEGER NOT NULL DEFAULT 0,
           cached_input_tokens INTEGER NOT NULL DEFAULT 0,
           reasoning_tokens INTEGER NOT NULL DEFAULT 0,
           cost_micros INTEGER,
           cost_source TEXT NOT NULL
         );
         CREATE UNIQUE INDEX IF NOT EXISTS provider_cost_request
           ON provider_cost_events(provider_id, provider_request_id)
           WHERE provider_request_id IS NOT NULL;
         CREATE INDEX IF NOT EXISTS provider_cost_occurred_at
           ON provider_cost_events(occurred_at DESC);
         CREATE INDEX IF NOT EXISTS provider_cost_provider
           ON provider_cost_events(provider_id, occurred_at DESC);",
    )?;
    Ok(connection)
}

pub fn record(app: &AppHandle, record: &ProviderCostRecord) -> AppResult<()> {
    let connection = open_database(app)?;
    connection.execute(
        "INSERT OR IGNORE INTO provider_cost_events (
           id, occurred_at, provider_request_id, provider_id, model_id,
           upstream_provider, operation, input_tokens, output_tokens, total_tokens,
           cached_input_tokens, reasoning_tokens, cost_micros, cost_source
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            Uuid::new_v4().to_string(),
            Utc::now().to_rfc3339(),
            record.provider_request_id,
            record.provider_id,
            record.model_id,
            record.upstream_provider,
            record.operation,
            record.input_tokens as i64,
            record.output_tokens as i64,
            record.total_tokens as i64,
            record.cached_input_tokens as i64,
            record.reasoning_tokens as i64,
            record.cost_micros,
            record.cost_source,
        ],
    )?;
    Ok(())
}

fn month_start() -> AppResult<String> {
    let now = Local::now();
    Local
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .map(|value| value.with_timezone(&Utc).to_rfc3339())
        .ok_or_else(|| AppError::GenerationProvider("could not determine this month".into()))
}

pub fn summary(
    app: &AppHandle,
    monthly_budget_micros: Option<i64>,
) -> AppResult<ProviderCostSummary> {
    let connection = open_database(app)?;
    let period_start = month_start()?;
    let period_end = Utc::now().to_rfc3339();
    let totals = connection.query_row(
        "SELECT
           COALESCE(SUM(cost_micros), 0),
           COUNT(*),
           COALESCE(SUM(input_tokens), 0),
           COALESCE(SUM(output_tokens), 0),
           COALESCE(SUM(CASE WHEN cost_source = 'catalog-estimate' THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN cost_micros IS NULL THEN 1 ELSE 0 END), 0)
         FROM provider_cost_events WHERE occurred_at >= ?1 AND occurred_at <= ?2",
        params![period_start, period_end],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)? as u64,
                row.get::<_, i64>(2)? as u64,
                row.get::<_, i64>(3)? as u64,
                row.get::<_, i64>(4)? as u64,
                row.get::<_, i64>(5)? as u64,
            ))
        },
    )?;
    let lifetime = connection.query_row(
        "SELECT COALESCE(SUM(cost_micros), 0), COUNT(*) FROM provider_cost_events",
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)? as u64)),
    )?;

    let mut bucket_statement = connection.prepare(
        "SELECT
           provider_id,
           COALESCE(SUM(cost_micros), 0),
           COUNT(*),
           COALESCE(SUM(input_tokens), 0),
           COALESCE(SUM(output_tokens), 0),
           COALESCE(SUM(CASE WHEN cost_source = 'catalog-estimate' THEN 1 ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN cost_micros IS NULL THEN 1 ELSE 0 END), 0)
         FROM provider_cost_events
         WHERE occurred_at >= ?1 AND occurred_at <= ?2
         GROUP BY provider_id
         ORDER BY COALESCE(SUM(cost_micros), 0) DESC, COUNT(*) DESC",
    )?;
    let by_provider = bucket_statement
        .query_map(params![period_start, period_end], |row| {
            Ok(ProviderCostBucket {
                provider_id: row.get(0)?,
                cost_micros: row.get(1)?,
                request_count: row.get::<_, i64>(2)? as u64,
                input_tokens: row.get::<_, i64>(3)? as u64,
                output_tokens: row.get::<_, i64>(4)? as u64,
                estimated_request_count: row.get::<_, i64>(5)? as u64,
                unpriced_request_count: row.get::<_, i64>(6)? as u64,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut recent_statement = connection.prepare(
        "SELECT id, occurred_at, provider_id, model_id, upstream_provider, operation,
                input_tokens, output_tokens, cost_micros, cost_source
         FROM provider_cost_events ORDER BY occurred_at DESC LIMIT 20",
    )?;
    let recent = recent_statement
        .query_map([], |row| {
            Ok(RecentProviderCost {
                id: row.get(0)?,
                occurred_at: row.get(1)?,
                provider_id: row.get(2)?,
                model_id: row.get(3)?,
                upstream_provider: row.get(4)?,
                operation: row.get(5)?,
                input_tokens: row.get::<_, i64>(6)? as u64,
                output_tokens: row.get::<_, i64>(7)? as u64,
                cost_micros: row.get(8)?,
                cost_source: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(ProviderCostSummary {
        period_start,
        period_end,
        currency: "USD".into(),
        total_cost_micros: totals.0,
        request_count: totals.1,
        input_tokens: totals.2,
        output_tokens: totals.3,
        estimated_request_count: totals.4,
        unpriced_request_count: totals.5,
        lifetime_cost_micros: lifetime.0,
        lifetime_request_count: lifetime.1,
        monthly_budget_micros,
        by_provider,
        recent,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn cost_schema_deduplicates_provider_request_ids() {
        let directory = tempdir().expect("tempdir");
        let connection = Connection::open(directory.path().join("costs.sqlite3")).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE provider_cost_events (
                   id TEXT PRIMARY KEY,
                   provider_id TEXT NOT NULL,
                   provider_request_id TEXT
                 );
                 CREATE UNIQUE INDEX provider_cost_request
                   ON provider_cost_events(provider_id, provider_request_id)
                   WHERE provider_request_id IS NOT NULL;",
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO provider_cost_events VALUES ('1', 'openrouter', 'req-1')",
                [],
            )
            .unwrap();
        let changed = connection
            .execute(
                "INSERT OR IGNORE INTO provider_cost_events VALUES ('2', 'openrouter', 'req-1')",
                [],
            )
            .unwrap();
        assert_eq!(changed, 0);
    }
}
