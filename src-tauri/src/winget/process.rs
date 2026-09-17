//! winget 进程调用与输出解码。
//!
//! 性能要点：
//! - 搜索 / 列表 / 详情都是**一次进程调用拿到整张表**（避免 N 次小调用）；
//! - 安装类输出走**增量字节流**，按 `\n` / `\r` 切分段落（GBK 多字节字符的
//!   尾字节范围是 0x40–0xFE，绝不含 0x0A / 0x0D，所以字节级切分是安全的）；
//! - 事件在 lib.rs 侧按时间窗合并后再发给前端，避免进度条 `\r` 高频刷新打爆 IPC。

use std::process::{Command, Stdio};

/// Windows 下不弹控制台黑窗。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 构造一个 winget 命令（stdout/stderr 管道、无窗口）。
pub fn winget_cmd(args: &[String]) -> Command {
    let mut cmd = Command::new("winget");
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// 跑一次 winget 并收集全部输出（用于 search / list / upgrade / show 这类快命令）。
pub fn run_capture(args: &[String]) -> Result<String, String> {
    let out = winget_cmd(args)
        .output()
        .map_err(|e| format!("无法启动 winget：{e}"))?;
    // winget 的表在 stdout；报错信息在 stderr。谁有内容解谁。
    let bytes = if out.stdout.is_empty() {
        &out.stderr
    } else {
        &out.stdout
    };
    Ok(decode(bytes))
}

/// 先按 UTF-8 解，失败回退 GBK（中文 Windows 的 OEM 代码页）。
pub fn decode(bytes: &[u8]) -> String {
    match String::from_utf8(bytes.to_vec()) {
        Ok(s) => s,
        Err(_) => {
            let (s, _, _) = encoding_rs::GBK.decode(bytes);
            s.into_owned()
        }
    }
}

/// 把字节流按 `\n` / `\r` 切成段，已完成段解码后推入 `out`，未完成部分留在 `pending`。
/// 进度条用 `\r` 原地刷新，所以 `\r` 也视为段边界。
pub fn split_segments(pending: &mut Vec<u8>, chunk: &[u8], out: &mut Vec<String>) {
    pending.extend_from_slice(chunk);
    let mut start = 0;
    for i in 0..pending.len() {
        let b = pending[i];
        if b == b'\n' || b == b'\r' {
            if i > start {
                out.push(decode(&pending[start..i]));
            }
            start = i + 1;
        }
    }
    pending.drain(..start);
}

/// 下载进度（含字节数：算速度要用）
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DownloadProgress {
    pub pct: u8,
    pub done: u64,
    pub total: u64,
}

fn size_to_bytes(v: f64, unit: &str) -> Option<f64> {
    let factor = match unit {
        "KB" => 1024.0,
        "MB" => 1024.0 * 1024.0,
        "GB" => 1024.0 * 1024.0 * 1024.0,
        "TB" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some(v * factor)
}

fn parse_num_unit(s: &str) -> Option<(f64, String)> {
    let mut num = String::new();
    let mut unit = String::new();
    let mut seen_digit = false;
    for c in s.trim().chars() {
        if c.is_ascii_digit() || c == '.' {
            num.push(c);
            seen_digit = true;
        } else if seen_digit {
            unit.push(c);
        }
    }
    let v: f64 = num.parse().ok()?;
    Some((v, unit.trim().to_ascii_uppercase()))
}

/// 解析 "8.00 MB / 30.0 MB" 形态的下载进度（含块字符/中文前缀都行）。
pub fn parse_download(seg: &str) -> Option<DownloadProgress> {
    let slash = seg.find('/')?;
    let (a, au) = parse_num_unit(&seg[..slash])?;
    let (b, bu) = parse_num_unit(&seg[slash + 1..])?;
    let done = size_to_bytes(a, &au)?;
    let total = size_to_bytes(b, &bu)?;
    if total <= 0.0 || done < 0.0 {
        return None;
    }
    Some(DownloadProgress {
        pct: (done / total * 100.0).round().clamp(0.0, 100.0) as u8,
        done: done as u64,
        total: total as u64,
    })
}

/// 从 winget 输出行里解析下载进度百分比。
/// 两种形态：直接百分比（"45%"）与大小比（"8.00 MB / 30.0 MB"）。
pub fn parse_progress(seg: &str) -> Option<u8> {
    // 形态 1：N%（取百分号前最近的一串数字）
    if let Some(pct) = seg.find('%') {
        let digits: String = seg[..pct]
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        if let Ok(v) = digits.parse::<u32>() {
            if v <= 100 && !digits.is_empty() {
                return Some(v as u8);
            }
        }
    }
    parse_download(seg).map(|d| d.pct)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_utf8_then_gbk() {
        assert_eq!(decode("你好 winget".as_bytes()), "你好 winget");
        // "中文" 的 GBK 编码
        let gbk = [0xD6u8, 0xD0, 0xCE, 0xC4];
        assert_eq!(decode(&gbk), "中文");
    }

    #[test]
    fn split_segments_handles_cr_and_lf() {
        let mut pending = Vec::new();
        let mut out = Vec::new();
        split_segments(&mut pending, b"abc\rdef\nghi", &mut out);
        assert_eq!(out, vec!["abc".to_string(), "def".to_string()]);
        assert_eq!(pending, b"ghi".to_vec());
        split_segments(&mut pending, b"jkl\n", &mut out);
        assert_eq!(out.last().unwrap(), "ghijkl");
        assert!(pending.is_empty());
    }

    #[test]
    fn split_segments_gbk_bytes_across_chunks() {
        // "中" 的 GBK 是 0xD6 0xD0，拆到两个 chunk 里也不能出乱码
        let mut pending = Vec::new();
        let mut out = Vec::new();
        split_segments(&mut pending, &[0xD6u8], &mut out);
        split_segments(&mut pending, &[0xD0u8, b'\n'], &mut out);
        assert_eq!(out, vec!["中".to_string()]);
    }

    #[test]
    fn progress_from_percent_and_ratio() {
        assert_eq!(parse_progress("下载进度：45%"), Some(45));
        assert_eq!(parse_progress("  ██████▏  8.00 MB / 30.0 MB"), Some(27));
        assert_eq!(parse_progress("已下载 512 KB / 1.0 MB"), Some(50));
        assert_eq!(parse_progress("正在安装…"), None);
        assert_eq!(parse_progress("100%"), Some(100));
    }

    #[test]
    fn download_parses_bytes() {
        let d = parse_download("  ██████▏  8.00 MB / 30.0 MB").unwrap();
        assert_eq!(d.pct, 27);
        assert_eq!(d.done, 8 * 1024 * 1024);
        assert_eq!(d.total, 30 * 1024 * 1024);
        let d2 = parse_download("已下载 512 KB / 1.0 MB").unwrap();
        assert_eq!(d2.done, 512 * 1024);
        assert!(parse_download("没有进度").is_none());
    }
}
