//! GitHub Releases 支持：有些软件的官方发布渠道就是 GitHub Releases，
//! 本商店按"只做官方链接分发"的定位，把发布页与资产直链取回来给前端。
//!
//! - `parse_release` 是纯函数（不依赖网络），JSON → DTO 的判据只有这一份；
//! - 网络只走 `api.github.com`，仓库名严格校验（owner/repo），
//!   不拼接用户可控 URL。

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GhAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
    pub downloads: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GhRelease {
    pub repo: String,
    pub tag: String,
    pub name: String,
    pub published_at: String,
    pub url: String,
    pub assets: Vec<GhAsset>,
    /// 发行说明正文（markdown，截断到 20000 字符）
    pub body: String,
}

/// 仓库名形如 `owner/repo`，只允许字母数字与 `. _ -`（防注入到 URL）。
pub fn valid_repo(repo: &str) -> bool {
    let mut parts = repo.split('/');
    let (Some(owner), Some(name), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    let ok = |s: &str| {
        !s.is_empty()
            && s.len() <= 100
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    };
    ok(owner) && ok(name)
}

/// 解析 GitHub `releases/latest` 的 JSON。
pub fn parse_release(repo: &str, json: &str) -> Result<GhRelease, String> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| format!("响应解析失败：{e}"))?;
    if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
        // GitHub 错误体：{"message": "Not Found"} / rate limit 等
        return Err(format!("GitHub：{msg}"));
    }
    let assets = v
        .get("assets")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a.get("name")?.as_str()?.to_string();
                    let url = a.get("browser_download_url")?.as_str()?.to_string();
                    Some(GhAsset {
                        name,
                        url,
                        size: a.get("size").and_then(|s| s.as_u64()).unwrap_or(0),
                        downloads: a
                            .get("download_count")
                            .and_then(|s| s.as_u64())
                            .unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(GhRelease {
        repo: repo.to_string(),
        tag: v
            .get("tag_name")
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string(),
        name: v
            .get("name")
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string(),
        published_at: v
            .get("published_at")
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string(),
        url: v
            .get("html_url")
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .to_string(),
        body: v
            .get("body")
            .and_then(|s| s.as_str())
            .unwrap_or_default()
            .chars()
            .take(20_000)
            .collect(),
        assets,
    })
}

/// 拉取最新发布（阻塞 HTTP，调用方负责 spawn_blocking）。
pub fn fetch_latest(repo: &str) -> Result<GhRelease, String> {
    if !valid_repo(repo) {
        return Err(format!("非法仓库名：{repo}"));
    }
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(20)))
        .user_agent("tongtop-store/0.1")
        .build()
        .into();
    let mut resp = agent.get(&url).call().map_err(|e| match e {
        ureq::Error::StatusCode(code) => format!("GitHub 返回 {code}（可能触达限流）"),
        other => format!("无法连接 GitHub：{other}"),
    })?;
    let body = resp
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("读取响应失败：{e}"))?;
    parse_release(repo, &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_validation() {
        assert!(valid_repo("git-for-windows/git"));
        assert!(valid_repo("obsproject/obs-studio"));
        assert!(!valid_repo("git"));
        assert!(!valid_repo("a/b/c"));
        assert!(!valid_repo("a/"));
        assert!(!valid_repo("/b"));
        assert!(!valid_repo("a b/c"));
        assert!(!valid_repo("a/../c"));
    }

    #[test]
    fn parse_real_shape() {
        let json = r#"{
          "tag_name": "v2.55.0.windows.5",
          "name": "Git for Windows v2.55.0(5)",
          "published_at": "2026-09-01T08:00:00Z",
          "html_url": "https://github.com/git-for-windows/git/releases/tag/v2.55.0.windows.5",
          "assets": [
            {"name": "Git-2.55.0.5-64-bit.exe", "browser_download_url": "https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/Git-2.55.0.5-64-bit.exe", "size": 65343712, "download_count": 3414503},
            {"name": "Git-2.55.0.5-arm64.exe", "browser_download_url": "https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/Git-2.55.0.5-arm64.exe", "size": 63259960, "download_count": 72529}
          ]
        }"#;
        let r = parse_release("git-for-windows/git", json).unwrap();
        assert_eq!(r.tag, "v2.55.0.windows.5");
        assert_eq!(r.assets.len(), 2);
        assert_eq!(r.assets[0].name, "Git-2.55.0.5-64-bit.exe");
        assert_eq!(r.assets[0].size, 65343712);
        assert_eq!(r.assets[0].downloads, 3414503);
    }

    #[test]
    fn parse_error_body() {
        let err = parse_release("a/b", r#"{"message": "Not Found"}"#);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Not Found"));
    }
}
