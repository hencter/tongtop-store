//! 多连接分段下载（安装包加速）。
//!
//! - 同一文件的多条线路（原地址 + GitHub 加速代理）先探测：支持 Range 且大小一致的线路参与分段下载；
//! - 分片按实测速度派给更快的线路，线路连续失败即剔除；请求中断时只把**未写完的剩余区间**放回队列，
//!   慢网络下超时也不会丢进度；
//! - 慢连接让位：某个请求的速度远低于最快线路（或已到收尾阶段、有连接空闲）时主动中断，
//!   剩余区间交给更快的连接，避免最后几片卡在慢线路上；
//! - 跨任务断点续传：已完成的分片记在 `<文件>.dlstate`（首行 = 大小 + 原地址），
//!   失败/取消后保留临时文件，下次同一文件只补缺的分片；成功后删除记录；
//! - 全部线路都不支持 Range 时退回单连接（无法续传）；
//! - 本模块不做内容认证：调用方负责校验（winget 清单 SHA256 / 自更新 minisign），
//!   因此经第三方代理下载是安全的。
//!
//! winget 预下载：winget 安装前会检查 `%TEMP%\WinGet\<Id>.<Version>\<SHA256>`，
//! 文件存在且哈希与清单一致就跳过下载（winget-cli DownloadFlow::CheckForExistingInstaller），
//! 所以把文件下到这里，后续 `winget install/upgrade` 原样执行即可复用。

use std::collections::{HashSet, VecDeque};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const MAX_CONNECTIONS: usize = 8;
const CHUNK: u64 = 2 * 1024 * 1024;
/// 单个分片请求的总时限：超时只放回剩余区间，不丢已写入的部分
const CHUNK_TIMEOUT: Duration = Duration::from_secs(90);
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
/// 线路连续失败这么多次即剔除
const MAX_SOURCE_FAILS: u32 = 3;
const MAX_PROXIES: usize = 3;
/// 请求至少跑这么久才评估是否让位（避开 TCP 慢启动）
const YIELD_AFTER: Duration = Duration::from_secs(4);
/// 请求速度低于最快线路平均速度的这个比例即让位
const YIELD_RATIO: f64 = 0.3;
/// 剩余不足这么多就不让位了，直接下完
const YIELD_MIN_REMAINING: u64 = 256 * 1024;

/// 从 `winget show` 解析出的安装包信息
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WingetInstaller {
    pub version: String,
    pub url: String,
    pub sha256: String,
}

/// 解析 `winget show -e --id <id>` 输出（与界面语言无关）：
/// - 版本：标题行 `[<id>]` 之后若带版本（"… [7zip.7zip] Version 26.03"）取其末词，
///   否则取紧随标题的下一行的值（管道输出的形态："已找到 7-Zip [7zip.7zip]" + "版本: 26.03"）；
/// - SHA256：值为 64 位十六进制的行；
/// - 安装包 URL：SHA256 行之前最近的一个 http(s) 值（主页/许可证等 URL 都在它更前面）。
pub fn parse_winget_show(id: &str, text: &str) -> Option<WingetInstaller> {
    let lines: Vec<&str> = text.lines().collect();
    let tag = format!("[{}]", id.to_lowercase());
    let head = lines.iter().position(|l| l.to_lowercase().contains(&tag))?;
    let after_tag = lines[head].rsplit(']').next().unwrap_or("");
    let version = after_tag
        .split_whitespace()
        .last()
        .filter(|v| v.chars().any(|c| c.is_ascii_digit()))
        .or_else(|| {
            let (_, v) = lines.get(head + 1)?.split_once([':', '：'])?;
            Some(v.trim()).filter(|v| !v.is_empty() && !v.contains(char::is_whitespace))
        })?
        .to_string();
    let (sha_idx, sha256) = lines.iter().enumerate().find_map(|(i, l)| {
        let v = l.rsplit([' ', ':', '：', '\t']).next()?.trim();
        (v.len() == 64 && v.chars().all(|c| c.is_ascii_hexdigit())).then(|| (i, v.to_lowercase()))
    })?;
    let url = lines[..sha_idx].iter().rev().find_map(|l| {
        let at = l.find("https://").or_else(|| l.find("http://"))?;
        Some(l[at..].trim().to_string())
    })?;
    Some(WingetInstaller { version, url, sha256 })
}

/// winget 复用已下载安装包的位置
pub fn winget_cache_path(id: &str, inst: &WingetInstaller) -> PathBuf {
    std::env::temp_dir()
        .join("WinGet")
        .join(format!("{id}.{}", inst.version))
        .join(&inst.sha256)
}

fn is_github_url(url: &str) -> bool {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or("");
    let host = rest.split(['/', ':']).next().unwrap_or("").to_ascii_lowercase();
    matches!(
        host.as_str(),
        "github.com" | "objects.githubusercontent.com" | "raw.githubusercontent.com" | "codeload.github.com"
    )
}

/// 下载线路：原地址在前；GitHub 资源追加加速代理（前缀式，如 `https://ghfast.top/`）。
pub fn sources_for(url: &str, proxies: &[String]) -> Vec<String> {
    let mut out = vec![url.to_string()];
    if is_github_url(url) {
        for p in proxies.iter().map(|p| p.trim()) {
            if out.len() > MAX_PROXIES {
                break;
            }
            if !p.starts_with("https://") {
                continue;
            }
            let prefix = if p.ends_with('/') { p.to_string() } else { format!("{p}/") };
            let s = format!("{prefix}{url}");
            if !out.contains(&s) {
                out.push(s);
            }
        }
    }
    out
}

fn agent(timeout: Duration) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(8)))
        .timeout_global(Some(timeout))
        .user_agent("tongtop-store/fastdl")
        .build()
        .into()
}

struct Probe {
    idx: usize,
    /// Some(total)：支持 Range 且知道总大小
    ranged_total: Option<u64>,
}

/// 用 `Range: bytes=0-0` 探测：206 + Content-Range 总大小 = 可分段；200 = 可达但只能单连接。
fn probe(idx: usize, url: &str) -> Option<Probe> {
    let resp = agent(PROBE_TIMEOUT).get(url).header("Range", "bytes=0-0").call().ok()?;
    let ranged_total = if resp.status().as_u16() == 206 {
        resp.headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit('/').next())
            .and_then(|t| t.trim().parse::<u64>().ok())
    } else {
        None
    };
    Some(Probe { idx, ranged_total })
}

#[derive(Default, Clone)]
struct SourceStat {
    bytes: u64,
    secs: f64,
    tries: u32,
    fails: u32,
    disabled: bool,
}

impl SourceStat {
    fn speed(&self) -> f64 {
        if self.secs > 0.5 {
            self.bytes as f64 / self.secs
        } else {
            0.0
        }
    }
}

/// 未试过的线路先各试一次；之后派给实测最快的线路；尚无测速数据时按 worker 序号分散。
fn pick_source(stats: &mut [SourceStat], hint: usize) -> Option<usize> {
    let alive: Vec<usize> = (0..stats.len()).filter(|&i| !stats[i].disabled).collect();
    if alive.is_empty() {
        return None;
    }
    let chosen = if let Some(&i) = alive.iter().find(|&&i| stats[i].tries == 0) {
        i
    } else {
        let best = alive
            .iter()
            .copied()
            .max_by(|&a, &b| stats[a].speed().total_cmp(&stats[b].speed()))
            .unwrap();
        if stats[best].speed() > 0.0 {
            best
        } else {
            alive[hint % alive.len()]
        }
    };
    stats[chosen].tries += 1;
    Some(chosen)
}

enum FetchErr {
    /// 主动让位给更快的连接（不计入线路失败）
    Yield,
    /// 失败即重派（剩余区间回队列），具体错误不保留——连续失败由线路计数兜底
    Fail,
}

/// 下载 [start, end]（闭区间）写入文件对应偏移；返回实际写入字节数（出错时也返回已写部分）。
/// `should_yield(本请求速度 B/s, 剩余字节)` 每 0.5 秒评估一次，为 true 即中断让位。
fn fetch_range(
    url: &str,
    file: &mut std::fs::File,
    start: u64,
    end: u64,
    done: &AtomicU64,
    cancel: &AtomicBool,
    should_yield: &dyn Fn(f64, u64) -> bool,
) -> (u64, Result<(), FetchErr>) {
    let mut written = 0u64;
    let t0 = Instant::now();
    let result = (|| -> Result<(), FetchErr> {
        let mut resp = agent(CHUNK_TIMEOUT)
            .get(url)
            .header("Range", &format!("bytes={start}-{end}"))
            .call()
            .map_err(|_| FetchErr::Fail)?;
        if resp.status().as_u16() != 206 {
            return Err(FetchErr::Fail);
        }
        file.seek(SeekFrom::Start(start)).map_err(|_| FetchErr::Fail)?;
        let want = end - start + 1;
        let mut reader = resp.body_mut().as_reader();
        let mut buf = [0u8; 65536];
        let mut last_check = Instant::now();
        while written < want {
            if cancel.load(Ordering::Relaxed) {
                return Err(FetchErr::Fail);
            }
            let n = reader.read(&mut buf).map_err(|_| FetchErr::Fail)?;
            if n == 0 {
                return Err(FetchErr::Fail);
            }
            let n = n.min((want - written) as usize);
            file.write_all(&buf[..n]).map_err(|_| FetchErr::Fail)?;
            written += n as u64;
            done.fetch_add(n as u64, Ordering::Relaxed);
            let elapsed = t0.elapsed();
            if elapsed >= YIELD_AFTER && last_check.elapsed() >= Duration::from_millis(500) {
                last_check = Instant::now();
                let bps = written as f64 / elapsed.as_secs_f64();
                if should_yield(bps, want - written) {
                    return Err(FetchErr::Yield);
                }
            }
        }
        Ok(())
    })();
    (written, result)
}

fn download_single(
    url: &str,
    dest: &Path,
    done: &AtomicU64,
    total: &AtomicU64,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let mut resp = agent(Duration::from_secs(30 * 60))
        .get(url)
        .call()
        .map_err(|e| format!("无法连接：{e}"))?;
    if let Some(len) = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
    {
        total.store(len, Ordering::Relaxed);
    }
    let mut file = std::fs::File::create(dest).map_err(|e| format!("无法写入临时文件：{e}"))?;
    let mut reader = resp.body_mut().as_reader();
    let mut buf = [0u8; 65536];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("已取消".into());
        }
        let n = reader.read(&mut buf).map_err(|e| format!("下载中断：{e}"))?;
        if n == 0 {
            return Ok(());
        }
        file.write_all(&buf[..n]).map_err(|e| format!("写入失败：{e}"))?;
        done.fetch_add(n as u64, Ordering::Relaxed);
    }
}

/// 下载结果摘要（日志用）
pub struct Summary {
    pub bytes: u64,
    pub secs: f64,
    pub connections: usize,
    pub sources_used: usize,
}

/// 续传状态文件路径：`<dest>.dlstate`
fn dlstate_path(dest: &Path) -> PathBuf {
    let mut p = dest.as_os_str().to_owned();
    p.push(".dlstate");
    PathBuf::from(p)
}

/// 读取续传状态：首行校验「大小 + 原地址」，其余行为已完成分片的起始偏移。
/// 仅当目标文件存在且大小吻合时有效；任何不一致都视为全新下载（返回空集）。
fn load_completed(state: &Path, dest: &Path, origin: &str, size: u64) -> HashSet<u64> {
    let Ok(text) = std::fs::read_to_string(state) else {
        return HashSet::new();
    };
    let mut lines = text.lines();
    if lines.next() != Some(format!("{size} {origin}").as_str()) {
        return HashSet::new();
    }
    if std::fs::metadata(dest).map(|m| m.len() != size).unwrap_or(true) {
        return HashSet::new();
    }
    lines
        .filter_map(|l| l.trim().parse::<u64>().ok())
        .filter(|&s| s % CHUNK == 0 && s < size)
        .collect()
}

/// 全量重写续传状态（分片数很小：大小 / 2MB，重写代价可忽略；重复行无害，读取时是集合）。
fn write_state(state: &Path, origin: &str, size: u64, completed: &HashSet<u64>) {
    let mut starts: Vec<u64> = completed.iter().copied().collect();
    starts.sort_unstable();
    let mut text = format!("{size} {origin}\n");
    for s in starts {
        text.push_str(&format!("{s}\n"));
    }
    let _ = std::fs::write(state, text);
}

/// 多线路多连接下载到 `dest`。`on_progress(已下载, 总大小(0=未知), 当前速度 B/s)` 约每 500ms 回调一次。
pub fn download(
    sources: &[String],
    dest: &Path,
    cancel: &AtomicBool,
    on_progress: impl Fn(u64, u64, u64) + Sync,
) -> Result<Summary, String> {
    if sources.is_empty() {
        return Err("没有可用的下载地址".into());
    }
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let started = Instant::now();

    let probes: Vec<Probe> = std::thread::scope(|s| {
        let hs: Vec<_> = sources
            .iter()
            .enumerate()
            .map(|(i, u)| s.spawn(move || probe(i, u)))
            .collect();
        hs.into_iter().filter_map(|h| h.join().ok().flatten()).collect()
    });
    if probes.is_empty() {
        return Err("所有下载线路均无法连接".into());
    }
    // 以原地址（序号最小）报告的大小为准，大小不一致的线路剔除（防代理返回错误页面）
    let mut ranged: Vec<&Probe> = probes.iter().filter(|p| p.ranged_total.is_some()).collect();
    ranged.sort_by_key(|p| p.idx);
    let total_size = ranged.first().and_then(|p| p.ranged_total);
    let ranged_idx: Vec<usize> = ranged
        .iter()
        .filter(|p| p.ranged_total == total_size)
        .map(|p| p.idx)
        .collect();

    let done = AtomicU64::new(0);
    let total = AtomicU64::new(total_size.unwrap_or(0));
    let finished = AtomicBool::new(false);

    std::thread::scope(|s| {
        s.spawn(|| {
            let mut last = (Instant::now(), 0u64);
            while !finished.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(500));
                let d = done.load(Ordering::Relaxed);
                let dt = last.0.elapsed().as_secs_f64().max(0.001);
                let bps = ((d - last.1) as f64 / dt) as u64;
                last = (Instant::now(), d);
                on_progress(d, total.load(Ordering::Relaxed), bps);
            }
        });

        let result = match total_size {
            Some(size) if size > 0 => {
                let urls: Vec<&str> = ranged_idx.iter().map(|&i| sources[i].as_str()).collect();
                download_ranged(&urls, dest, size, &done, cancel)
            }
            _ => {
                let first = probes.iter().map(|p| p.idx).min().unwrap();
                download_single(&sources[first], dest, &done, &total, cancel)
                    .map(|_| (1, 1))
            }
        };
        finished.store(true, Ordering::Relaxed);
        result
    })
    .map(|(connections, sources_used)| {
        let _ = std::fs::remove_file(dlstate_path(dest));
        Summary {
            bytes: done.load(Ordering::Relaxed),
            secs: started.elapsed().as_secs_f64(),
            connections,
            sources_used,
        }
    })
    .inspect_err(|_| {
        // 有续传状态（已有分片落盘）就保留临时文件，下次只补缺的分片；否则清掉残件
        if !dlstate_path(dest).exists() {
            let _ = std::fs::remove_file(dest);
        }
    })
}

/// 返回 (连接数, 实际出过数据的线路数)
fn download_ranged(
    urls: &[&str],
    dest: &Path,
    size: u64,
    done: &AtomicU64,
    cancel: &AtomicBool,
) -> Result<(usize, usize), String> {
    let state_path = dlstate_path(dest);
    let completed = load_completed(&state_path, dest, urls[0], size);
    if completed.is_empty() {
        // 全新下载：建文件并预分配；续传时文件已被 load_completed 校验过，绝不能截断
        std::fs::File::create(dest)
            .and_then(|f| f.set_len(size))
            .map_err(|e| format!("无法创建临时文件：{e}"))?;
    }
    let resumed: u64 = completed.iter().map(|&s| CHUNK.min(size - s)).sum();
    done.fetch_add(resumed, Ordering::Relaxed);
    let queue: Mutex<VecDeque<(u64, u64)>> = Mutex::new(
        (0..size.div_ceil(CHUNK))
            .map(|i| (i * CHUNK, ((i + 1) * CHUNK).min(size) - 1))
            .filter(|(start, _)| !completed.contains(start))
            .collect(),
    );
    let completed: Mutex<HashSet<u64>> = Mutex::new(completed);
    let chunks = queue.lock().unwrap().len();
    let connections = MAX_CONNECTIONS.min(chunks).max(1);
    let stats = Mutex::new(vec![SourceStat::default(); urls.len()]);
    let inflight = AtomicUsize::new(0);
    let fatal: Mutex<Option<String>> = Mutex::new(None);

    std::thread::scope(|s| {
        for worker in 0..connections {
            let (queue, stats, inflight, fatal, completed, state_path) =
                (&queue, &stats, &inflight, &fatal, &completed, &state_path);
            s.spawn(move || {
                let mut file = match std::fs::OpenOptions::new().write(true).open(dest) {
                    Ok(f) => f,
                    Err(e) => {
                        *fatal.lock().unwrap() = Some(format!("无法打开临时文件：{e}"));
                        return;
                    }
                };
                loop {
                    if cancel.load(Ordering::Relaxed) || fatal.lock().unwrap().is_some() {
                        return;
                    }
                    let job = {
                        let mut q = queue.lock().unwrap();
                        let j = q.pop_front();
                        if j.is_some() {
                            inflight.fetch_add(1, Ordering::SeqCst);
                        }
                        j
                    };
                    let Some((start, end)) = job else {
                        if inflight.load(Ordering::SeqCst) == 0 {
                            return;
                        }
                        std::thread::sleep(Duration::from_millis(100));
                        continue;
                    };
                    // 慢连接让位：远低于最快线路即中断；收尾阶段（队列空、有连接空闲）慢于最快线路也让
                    let should_yield = |bps: f64, remaining: u64| -> bool {
                        if remaining < YIELD_MIN_REMAINING {
                            return false;
                        }
                        let best = stats
                            .lock()
                            .unwrap()
                            .iter()
                            .map(|s| s.speed())
                            .fold(0.0_f64, f64::max);
                        if best <= 0.0 {
                            return false;
                        }
                        if bps < best * YIELD_RATIO {
                            return true;
                        }
                        let tail = queue.lock().unwrap().is_empty() && inflight.load(Ordering::SeqCst) < connections;
                        tail && bps < best
                    };
                    let Some(src) = pick_source(&mut stats.lock().unwrap(), worker) else {
                        *fatal.lock().unwrap() = Some("所有下载线路均已失败".into());
                        inflight.fetch_sub(1, Ordering::SeqCst);
                        return;
                    };
                    let t0 = Instant::now();
                    let (written, res) =
                        fetch_range(urls[src], &mut file, start, end, done, cancel, &should_yield);
                    {
                        let mut st = stats.lock().unwrap();
                        let s = &mut st[src];
                        s.bytes += written;
                        s.secs += t0.elapsed().as_secs_f64();
                        match &res {
                            Ok(()) => s.fails = 0,
                            Err(FetchErr::Yield) => {} // 主动让位：线路本身没问题
                            Err(FetchErr::Fail) => {
                                s.fails += 1;
                                if s.fails >= MAX_SOURCE_FAILS {
                                    s.disabled = true;
                                }
                            }
                        }
                    }
                    match &res {
                        Ok(()) => {
                            let mut set = completed.lock().unwrap();
                            set.insert(start);
                            write_state(state_path, urls[0], size, &set);
                        }
                        Err(_) if start + written <= end => {
                            queue.lock().unwrap().push_front((start + written, end));
                        }
                        Err(_) => {}
                    }
                    inflight.fetch_sub(1, Ordering::SeqCst);
                }
            });
        }
    });

    if cancel.load(Ordering::Relaxed) {
        return Err("已取消".into());
    }
    if let Some(e) = fatal.into_inner().unwrap() {
        return Err(e);
    }
    let got = done.load(Ordering::Relaxed);
    if got != size {
        return Err(format!("下载不完整（{got}/{size} 字节）"));
    }
    let used = stats.into_inner().unwrap().iter().filter(|s| s.bytes > 0).count();
    Ok((connections, used))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::sync::Arc;

    /// 真实管道输出形态：版本在标题下一行
    const SHOW_ZH: &str = "已找到 7-Zip [7zip.7zip]\n\
        版本: 26.03\n\
        发布者: Igor Pavlov\n\
        主页: https://sparanoid.com/lab/7z/download.html\n\
        发行说明 URL: https://github.com/ip7z/7zip/releases/tag/26.03\n\
        安装程序:\n\
        \x20 安装程序类型： wix\n\
        \x20 安装程序 URL： https://www.7-zip.org/a/7z2603-x64.msi\n\
        \x20 安装程序 SHA256： C0680064D698A62DD4A5A47F403DB356A6531A5473E4C4B1D090EA2590513926\n\
        \x20 发布日期: 2026-09-03\n";

    const SHOW_EN: &str = "Found Git [Git.Git]\n\
        Version: 2.51.0\n\
        Homepage: https://gitforwindows.org\n\
        Installer:\n\
        \x20 Installer Type: inno\n\
        \x20 Installer Url: https://github.com/git-for-windows/git/releases/download/v2.51.0.windows.1/Git-2.51.0-64-bit.exe\n\
        \x20 Installer SHA256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n";

    #[test]
    fn parse_show_zh_and_en() {
        let zh = parse_winget_show("7zip.7zip", SHOW_ZH).unwrap();
        assert_eq!(zh.version, "26.03");
        assert_eq!(zh.url, "https://www.7-zip.org/a/7z2603-x64.msi");
        assert_eq!(zh.sha256, "c0680064d698a62dd4a5a47f403db356a6531a5473e4c4b1d090ea2590513926");
        let en = parse_winget_show("git.git", SHOW_EN).unwrap();
        assert_eq!(en.version, "2.51.0");
        assert!(en.url.ends_with("Git-2.51.0-64-bit.exe"));
        // 交互式输出形态：版本与标题同行
        let inline = SHOW_ZH.replacen("[7zip.7zip]\n版本: 26.03", "[7zip.7zip] 版本 26.03", 1);
        assert_eq!(parse_winget_show("7zip.7zip", &inline).unwrap().version, "26.03");
        assert!(parse_winget_show("7zip.7zip", "找不到与输入条件匹配的程序包。").is_none());
    }

    #[test]
    fn github_sources_get_proxies() {
        let proxies = vec!["https://ghfast.top/".to_string(), "https://gh-proxy.com".to_string(), "".to_string()];
        let gh = sources_for("https://github.com/a/b/releases/download/v1/x.exe", &proxies);
        assert_eq!(gh.len(), 3);
        assert_eq!(gh[1], "https://ghfast.top/https://github.com/a/b/releases/download/v1/x.exe");
        assert_eq!(gh[2], "https://gh-proxy.com/https://github.com/a/b/releases/download/v1/x.exe");
        assert_eq!(sources_for("https://www.7-zip.org/a/x.msi", &proxies).len(), 1);
    }

    /// 本地 HTTP 服务：`ranged=false` 时忽略 Range 返回整文件
    fn serve(data: Arc<Vec<u8>>, ranged: bool) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let data = data.clone();
                std::thread::spawn(move || {
                    let mut req = Vec::new();
                    let mut b = [0u8; 1024];
                    while !req.windows(4).any(|w| w == b"\r\n\r\n") {
                        match stream.read(&mut b) {
                            Ok(0) | Err(_) => return,
                            Ok(n) => req.extend_from_slice(&b[..n]),
                        }
                    }
                    let req = String::from_utf8_lossy(&req).to_lowercase();
                    let range = req.lines().find_map(|l| l.strip_prefix("range: bytes=")).and_then(|r| {
                        let (a, b) = r.trim().split_once('-')?;
                        Some((a.parse::<usize>().ok()?, b.parse::<usize>().ok()?))
                    });
                    let head = match (ranged, range) {
                        (true, Some((a, b))) => {
                            let b = b.min(data.len() - 1);
                            let h = format!(
                                "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {a}-{b}/{}\r\nConnection: close\r\n\r\n",
                                b - a + 1,
                                data.len()
                            );
                            let _ = stream.write_all(h.as_bytes());
                            let _ = stream.write_all(&data[a..=b]);
                            return;
                        }
                        _ => format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", data.len()),
                    };
                    let _ = stream.write_all(head.as_bytes());
                    let _ = stream.write_all(&data);
                });
            }
        });
        format!("http://{addr}/file.bin")
    }

    fn payload() -> Arc<Vec<u8>> {
        Arc::new((0..(5 * 1024 * 1024 + 123)).map(|i| (i * 31 % 251) as u8).collect())
    }

    #[test]
    fn ranged_download_with_dead_source_is_byte_exact() {
        let data = payload();
        let ok = serve(data.clone(), true);
        let dead = "http://127.0.0.1:9/nothing".to_string();
        let dest = std::env::temp_dir().join(format!("tt-fastdl-{}.bin", std::process::id()));
        let cancel = AtomicBool::new(false);
        let sum = download(&[dead, ok], &dest, &cancel, |_, _, _| {}).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), *data);
        assert!(sum.connections > 1);
        let _ = std::fs::remove_file(&dest);
    }

    /// 真实网络端到端：`cargo test real_winget_github -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_winget_github_package() {
        let id = std::env::var("FASTDL_ID").unwrap_or_else(|_| "Git.Git".into());
        let args: Vec<String> = ["show", "-e", "--id", &id, "--source", "winget", "--accept-source-agreements"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let text = crate::winget::process::run_capture(&args).unwrap();
        let inst = parse_winget_show(&id, &text).expect("解析 winget show 失败");
        let proxies = vec!["https://ghfast.top/".to_string(), "https://gh-proxy.com/".to_string()];
        let sources = sources_for(&inst.url, &proxies);
        println!("{inst:?}\nsources: {sources:#?}");
        let dest = std::env::temp_dir().join(format!("tt-fastdl-real-{}", inst.sha256));
        let cancel = AtomicBool::new(false);
        let sum = download(&sources, &dest, &cancel, |d, t, bps| {
            println!("{:.1}/{:.1} MB  {:.2} MB/s", d as f64 / 1e6, t as f64 / 1e6, bps as f64 / 1e6)
        })
        .unwrap();
        let hash = crate::sha256_file(&dest).unwrap();
        if std::env::var("FASTDL_SEED").is_ok() {
            let cache = winget_cache_path(&id, &inst);
            std::fs::create_dir_all(cache.parent().unwrap()).unwrap();
            std::fs::rename(&dest, &cache).unwrap();
        } else {
            let _ = std::fs::remove_file(&dest);
        }
        assert!(inst.version.chars().next().is_some_and(|c| c.is_ascii_digit()), "版本解析异常：{}", inst.version);
        println!("winget cache path: {}", winget_cache_path(&id, &inst).display());
        println!(
            "done {:.1} MB in {:.1}s = {:.2} MB/s, {} conns, {} sources used",
            sum.bytes as f64 / 1e6,
            sum.secs,
            sum.bytes as f64 / 1e6 / sum.secs,
            sum.connections,
            sum.sources_used
        );
        assert_eq!(hash, inst.sha256);
    }

    /// 断点续传：预置前 2 个分片 + .dlstate，下载应只补缺的且结果逐字节一致，成功后状态文件删除
    #[test]
    fn resumes_from_dlstate() {
        let data = payload();
        let url = serve(data.clone(), true);
        let size = data.len() as u64;
        let dest = std::env::temp_dir().join(format!("tt-fastdl-resume-{}.bin", std::process::id()));
        let mut file = std::fs::File::create(&dest).unwrap();
        file.set_len(size).unwrap();
        file.write_all(&data[..(2 * CHUNK) as usize]).unwrap();
        drop(file);
        let state = dlstate_path(&dest);
        std::fs::write(&state, format!("{size} {url}\n0\n{CHUNK}\n")).unwrap();
        let cancel = AtomicBool::new(false);
        download(&[url], &dest, &cancel, |_, _, _| {}).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), *data);
        assert!(!state.exists());
        let _ = std::fs::remove_file(&dest);
    }

    /// 状态文件与文件对不上（大小变了）→ 忽略状态重新下全量
    #[test]
    fn stale_dlstate_is_discarded() {
        let data = payload();
        let url = serve(data.clone(), true);
        let dest = std::env::temp_dir().join(format!("tt-fastdl-stale-{}.bin", std::process::id()));
        std::fs::write(&dest, b"garbage").unwrap();
        let state = dlstate_path(&dest);
        std::fs::write(&state, "12345 http://other/file.bin\n0\n").unwrap();
        let cancel = AtomicBool::new(false);
        download(&[url], &dest, &cancel, |_, _, _| {}).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), *data);
        assert!(!state.exists());
        let _ = std::fs::remove_file(&dest);
    }

    #[test]
    fn falls_back_to_single_stream_without_range() {
        let data = payload();
        let url = serve(data.clone(), false);
        let dest = std::env::temp_dir().join(format!("tt-fastdl-single-{}.bin", std::process::id()));
        let cancel = AtomicBool::new(false);
        let sum = download(&[url], &dest, &cancel, |_, _, _| {}).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), *data);
        assert_eq!(sum.connections, 1);
        let _ = std::fs::remove_file(&dest);
    }
}
