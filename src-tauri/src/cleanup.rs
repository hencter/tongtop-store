//! 安装包缓存清理：winget 安装时把安装包下载到 `%TEMP%\WinGet`，
//! 装完不会立即删（靠系统临时文件清理兜底，容易越积越大）。
//!
//! 安全规则（宁可不删，绝不删错）：
//! - 本应用任务引擎有任务进行中 → 禁止清理（调用方检查）；
//! - 系统里有 winget.exe 在跑（可能是别的终端发起的安装）→ 禁止清理；
//! - 删除失败的（被占用）→ 跳过并如实计数，不中断整体。

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone)]
pub struct CleanupItem {
    pub name: String,
    pub size: u64,
    pub files: u32,
    pub modified: u64,
}

#[derive(Debug, Clone)]
pub struct CleanupInfo {
    pub dir: String,
    pub total_bytes: u64,
    pub file_count: u32,
    pub dir_count: u32,
    /// 顶层子项按大小排序，最多保留 12 个
    pub items: Vec<CleanupItem>,
    pub winget_running: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CleanupResult {
    pub freed_bytes: u64,
    pub deleted: u32,
    pub skipped: u32,
}

fn winget_cache_dir() -> PathBuf {
    let temp = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(temp).join("WinGet")
}

/// 迭代式计算目录大小。mimenote 教训：用 `DirEntry::metadata()`（Windows 上
/// 复用目录枚举已返回的数据，零额外系统调用），不要 path-based `fs::metadata`。
pub fn dir_size(entry: &std::fs::DirEntry) -> (u64, u32) {
    let mut total = 0u64;
    let mut files = 0u32;
    let mut stack = vec![entry.path()];
    while let Some(p) = stack.pop() {
        if let Ok(rd) = std::fs::read_dir(&p) {
            for e in rd.flatten() {
                let Ok(meta) = e.metadata() else {
                    continue;
                };
                if meta.is_dir() {
                    stack.push(e.path());
                } else {
                    total += meta.len();
                    files += 1;
                }
            }
        }
    }
    (total, files)
}

/// 系统里是否有 winget 进程在跑（含其他终端发起的安装）。
pub fn winget_process_running() -> bool {
    let mut cmd = std::process::Command::new("tasklist");
    cmd.args(["/FI", "IMAGENAME eq winget.exe", "/NH"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    match cmd.output() {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .to_lowercase()
            .contains("winget.exe"),
        Err(_) => false,
    }
}

pub fn scan_at(dir: &Path) -> Result<CleanupInfo, String> {
    let mut info = CleanupInfo {
        dir: dir.to_string_lossy().into_owned(),
        total_bytes: 0,
        file_count: 0,
        dir_count: 0,
        items: vec![],
        winget_running: false,
    };
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Ok(info); // 目录不存在 = 没有缓存
    };
    for e in rd.flatten() {
        let Ok(meta) = e.metadata() else {
            continue;
        };
        let (size, files) = if meta.is_dir() {
            dir_size(&e)
        } else {
            (meta.len(), 1)
        };
        info.total_bytes += size;
        info.file_count += files;
        if meta.is_dir() {
            info.dir_count += 1;
        }
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        info.items.push(CleanupItem {
            name: e.file_name().to_string_lossy().into_owned(),
            size,
            files,
            modified,
        });
    }
    info.items.sort_by(|a, b| b.size.cmp(&a.size));
    info.items.truncate(12);
    Ok(info)
}

pub fn scan() -> Result<CleanupInfo, String> {
    let mut info = scan_at(&winget_cache_dir())?;
    info.winget_running = winget_process_running();
    Ok(info)
}

pub fn clean_at(dir: &Path) -> Result<CleanupResult, String> {
    let mut r = CleanupResult::default();
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Ok(r);
    };
    for e in rd.flatten() {
        let Ok(meta) = e.metadata() else {
            r.skipped += 1;
            continue;
        };
        let (size, _) = if meta.is_dir() {
            dir_size(&e)
        } else {
            (meta.len(), 1)
        };
        let ok = if meta.is_dir() {
            std::fs::remove_dir_all(e.path())
        } else {
            std::fs::remove_file(e.path())
        };
        match ok {
            Ok(_) => {
                r.freed_bytes += size;
                r.deleted += 1;
            }
            Err(_) => r.skipped += 1,
        }
    }
    Ok(r)
}

pub fn clean() -> Result<CleanupResult, String> {
    if winget_process_running() {
        return Err("系统里有 winget 正在运行，为避免破坏进行中的安装，已取消清理".into());
    }
    clean_at(&winget_cache_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "tongtop-clean-{}-{}-{}",
            tag,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("pkgA").join("sub")).unwrap();
        std::fs::write(dir.join("pkgA").join("a.exe"), vec![0u8; 1000]).unwrap();
        std::fs::write(dir.join("pkgA").join("sub").join("b.msi"), vec![0u8; 2000]).unwrap();
        std::fs::write(dir.join("loose.tmp"), vec![0u8; 500]).unwrap();
        dir
    }

    #[test]
    fn scan_totals_and_items() {
        let dir = fixture("x");
        let info = scan_at(&dir).unwrap();
        assert_eq!(info.total_bytes, 3500);
        assert_eq!(info.file_count, 3);
        assert_eq!(info.dir_count, 1);
        // 顶层项：pkgA(3000) 在 loose.tmp(500) 前
        assert_eq!(info.items[0].name, "pkgA");
        assert_eq!(info.items[0].size, 3000);
        assert_eq!(info.items[0].files, 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn clean_removes_and_reports_freed() {
        let dir = fixture("x");
        let r = clean_at(&dir).unwrap();
        assert_eq!(r.freed_bytes, 3500);
        assert_eq!(r.deleted, 2); // pkgA 目录 + loose.tmp
        assert_eq!(r.skipped, 0);
        // 目录本体保留，内容已空
        let left: Vec<_> = std::fs::read_dir(&dir).unwrap().collect();
        assert!(left.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_missing_dir_is_empty_not_error() {
        let info = scan_at(Path::new(r"D:\no-such-dir-xyz-123")).unwrap();
        assert_eq!(info.total_bytes, 0);
        assert!(info.items.is_empty());
    }
}
