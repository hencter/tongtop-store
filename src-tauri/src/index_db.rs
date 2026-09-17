//! SQLite 缓存索引（mimenote 式：缓存可删可重建，删掉即自动重建）。
//!
//! 启动时后台跑一遍 `winget list / upgrade` → 快照落库；
//! 界面先读库（毫秒级），后台刷新完成再更新界面。
//! **更新（失效）问题由三条规则解决**：
//! 1. TTL：快照超过 10 分钟视为陈旧，启动时后台重跑；
//! 2. 任务成功即失效：任何 winget 安装/卸载/更新成功后强制重跑；
//! 3. 手动刷新按钮强制重跑。
//!
//! 另有一张 kv 表承接搜索/详情/GitHub 发布的 TTL 缓存（替代原 JSON 文件缓存）。

use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn db_path() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join(r"com.tongtianlu.store\cache\store.db")
}

fn open() -> Result<Connection, String> {
    open_at(&db_path())
}

fn open_at(path: &Path) -> Result<Connection, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| format!("打开缓存库失败：{e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            time INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS apps (
            kind TEXT NOT NULL,
            id TEXT NOT NULL,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            available TEXT,
            PRIMARY KEY (kind, id)
        );
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value INTEGER NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

// ---------- KV（TTL 缓存） ----------

fn kv_get_at(conn: &Connection, key: &str, ttl_secs: u64) -> Option<String> {
    let (value, time): (String, i64) = conn
        .query_row("SELECT value, time FROM kv WHERE key = ?1", params![key], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .ok()?;
    if now().saturating_sub(time as u64) >= ttl_secs {
        return None;
    }
    Some(value)
}

pub fn kv_get(key: &str, ttl_secs: u64) -> Option<String> {
    let conn = open().ok()?;
    kv_get_at(&conn, key, ttl_secs)
}

fn kv_set_at(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO kv (key, value, time) VALUES (?1, ?2, ?3)",
        params![key, value, now() as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn kv_set(key: &str, value: &str) {
    if let Ok(conn) = open() {
        let _ = kv_set_at(&conn, key, value);
    }
}

// ---------- 快照（installed / upgrade） ----------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppRow {
    pub id: String,
    pub name: String,
    pub version: String,
    pub available: Option<String>,
}

fn read_kind(conn: &Connection, kind: &str) -> Result<(Vec<AppRow>, u64), String> {
    let mut stmt = conn
        .prepare("SELECT id, name, version, available FROM apps WHERE kind = ?1 ORDER BY name COLLATE NOCASE")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![kind], |r| {
            Ok(AppRow {
                id: r.get(0)?,
                name: r.get(1)?,
                version: r.get(2)?,
                available: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    let at: i64 = conn
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![format!("fetched_at_{kind}")],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok((out, at as u64))
}

/// 读 (installed, fetched_at) 与 (upgrade, fetched_at)。
pub fn read_snapshot() -> Result<((Vec<AppRow>, u64), (Vec<AppRow>, u64)), String> {
    let conn = open()?;
    Ok((read_kind(&conn, "installed")?, read_kind(&conn, "upgrade")?))
}

fn write_kind_at(path: &Path, kind: &str, rows: &[AppRow]) -> Result<(), String> {
    let mut conn = open_at(path)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM apps WHERE kind = ?1", params![kind])
        .map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare("INSERT INTO apps (kind, id, name, version, available) VALUES (?1, ?2, ?3, ?4, ?5)")
            .map_err(|e| e.to_string())?;
        for r in rows {
            stmt.execute(params![kind, r.id, r.name, r.version, r.available])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        params![format!("fetched_at_{kind}"), now() as i64],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

pub fn write_kind(kind: &str, rows: &[AppRow]) -> Result<(), String> {
    write_kind_at(&db_path(), kind, rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "tongtop-test-{}-{}-{}.db",
            tag,
            std::process::id(),
            now()
        ));
        let _ = std::fs::remove_file(&p);
        p
    }

    fn cleanup(p: &Path) {
        let _ = std::fs::remove_file(p);
        let _ = std::fs::remove_file(p.with_extension("db-wal"));
        let _ = std::fs::remove_file(p.with_extension("db-shm"));
    }

    #[test]
    fn kv_roundtrip_and_ttl() {
        let p = temp_db("kv");
        let conn = open_at(&p).unwrap();
        kv_set_at(&conn, "k1", "hello").unwrap();
        assert_eq!(kv_get_at(&conn, "k1", 3600).as_deref(), Some("hello"));
        assert!(kv_get_at(&conn, "k1", 0).is_none()); // ttl=0 立即过期
        assert!(kv_get_at(&conn, "nope", 3600).is_none());
        drop(conn);
        cleanup(&p);
    }

    #[test]
    fn snapshot_write_read_overwrite() {
        let p = temp_db("snap");
        let rows = vec![
            AppRow { id: "B.B".into(), name: "B应用".into(), version: "1.0".into(), available: None },
            AppRow { id: "A.A".into(), name: "a应用".into(), version: "2.0".into(), available: Some("3.0".into()) },
        ];
        write_kind_at(&p, "installed", &rows).unwrap();
        let conn = open_at(&p).unwrap();
        let (read, at) = read_kind(&conn, "installed").unwrap();
        assert!(at > 0);
        // ORDER BY name COLLATE NOCASE：a 在 B 前
        assert_eq!(read.len(), 2);
        assert_eq!(read[0].id, "A.A");
        assert_eq!(read[1].id, "B.B");
        assert_eq!(read[0].available.as_deref(), Some("3.0"));
        assert!(read[1].available.is_none());
        drop(conn);
        // 重写 = 全量替换，不叠加
        write_kind_at(&p, "installed", &rows[..1]).unwrap();
        let conn = open_at(&p).unwrap();
        let (read2, _) = read_kind(&conn, "installed").unwrap();
        assert_eq!(read2.len(), 1);
        assert_eq!(read2[0].id, "B.B");
        drop(conn);
        cleanup(&p);
    }
}
