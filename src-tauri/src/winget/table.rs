//! winget 表格输出解析（与语言无关）。
//!
//! winget 的输出是一张"按终端显示列宽对齐"的表：
//! - 表头下一行是 `-----` 分隔线（定位表格的唯一锚点）；
//! - 表头每个词组的**起始显示列**就是该列的起点（中英文表头都成立，
//!   所以不依赖"名称 / Name"这类具体词）；
//! - 中文等宽字符占两列，必须按**显示宽度**切片，按字符数切会错位。
//!
//! 解析器只产出"行列矩阵"，列的语义（哪列是版本、哪列是可升级版本）
//! 由调用方按命令类型解释 —— 判据只有这一份。

/// 终端中占两列的字符（CJK、全角等）。
fn is_wide(c: char) -> bool {
    matches!(
        c as u32,
        0x1100..=0x115F
            | 0x2E80..=0x303E
            | 0x3041..=0x33FF
            | 0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xA000..=0xA4CF
            | 0xAC00..=0xD7A3
            | 0xF900..=0xFAFF
            | 0xFE30..=0xFE4F
            | 0xFF00..=0xFF60
            | 0xFFE0..=0xFFE6
            | 0x20000..=0x2FFFD
            | 0x30000..=0x3FFFD
    )
}

fn char_width(c: char) -> usize {
    if is_wide(c) {
        2
    } else {
        1
    }
}

/// 按显示列宽切 `[start, end)`。宽字符跨边界时按其**起始列**归属（列边界
/// 正常都落在空格上，只有 winget 用 `…` 截断长名时才会贴边，归属起始列
/// 不会丢字符）。
fn slice_by_width(line: &str, start: usize, end: Option<usize>) -> String {
    let mut col = 0usize;
    let mut out = String::new();
    for ch in line.chars() {
        if col >= start && end.is_none_or(|e| col < e) {
            out.push(ch);
        }
        col += char_width(ch);
        if let Some(e) = end {
            if col >= e && col > start {
                break;
            }
        }
    }
    out.trim().to_string()
}

/// 解析 winget 表格为行矩阵；找不到表格返回 `None`。
pub fn parse_table(output: &str) -> Option<Vec<Vec<String>>> {
    let lines: Vec<&str> = output.lines().collect();
    // 分隔线：去尾部空白后全由 '-' 和空格组成、且至少 5 个 '-'
    let sep = lines.iter().position(|l| {
        let t = l.trim_end();
        t.chars().filter(|c| *c == '-').count() >= 5
            && t.chars().all(|c| c == '-' || c == ' ')
    })?;
    if sep == 0 {
        return None;
    }
    // 表头：分隔线上一行，取每个非空白词组的起始显示列
    let header = lines[sep - 1];
    let mut starts: Vec<usize> = Vec::new();
    let mut col = 0usize;
    let mut in_word = false;
    for ch in header.chars() {
        if !ch.is_whitespace() && !in_word {
            starts.push(col);
            in_word = true;
        }
        if ch.is_whitespace() {
            in_word = false;
        }
        col += char_width(ch);
    }
    if starts.len() < 2 {
        return None;
    }
    // 数据行：分隔线之后，遇到首个空行收尾（表后可能还有提示文字）
    let mut rows = Vec::new();
    for line in &lines[sep + 1..] {
        let t = line.trim_end();
        if t.trim().is_empty() {
            if rows.is_empty() {
                continue;
            }
            break;
        }
        let mut row = Vec::with_capacity(starts.len());
        for (i, s) in starts.iter().enumerate() {
            row.push(slice_by_width(t, *s, starts.get(i + 1).copied()));
        }
        rows.push(row);
    }
    Some(rows)
}

/// 一条软件记录（search / list 共用）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RowInfo {
    pub name: String,
    pub id: String,
    pub version: String,
    /// list / upgrade 场景下的"可升级版本"
    pub extra: Option<String>,
}

fn rows_to_infos(rows: Vec<Vec<String>>, want_extra: bool) -> Vec<RowInfo> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for r in rows {
        if r.len() < 3 {
            continue;
        }
        let (name, id, version) = (r[0].clone(), r[1].clone(), r[2].clone());
        if id.is_empty() || !seen.insert(id.to_lowercase()) {
            continue;
        }
        let extra = if want_extra && r.len() >= 4 {
            let v = r[3].trim();
            (!v.is_empty()).then(|| v.to_string())
        } else {
            None
        };
        out.push(RowInfo {
            name,
            id,
            version,
            extra,
        });
    }
    out
}

/// `winget search`：名称 / ID / 版本（后面可能还有"匹配 / 源"，忽略）。
pub fn parse_search(output: &str) -> Vec<RowInfo> {
    rows_to_infos(parse_table(output).unwrap_or_default(), false)
}

/// `winget list`：名称 / ID / 版本（后面可能还有"可用 / 源"，忽略）。
pub fn parse_list(output: &str) -> Vec<RowInfo> {
    rows_to_infos(parse_table(output).unwrap_or_default(), false)
}

/// `winget upgrade`：名称 / ID / 当前版本 / 可用版本（可能还有"源"）。
pub fn parse_upgrade(output: &str) -> Vec<RowInfo> {
    rows_to_infos(parse_table(output).unwrap_or_default(), true)
}

/// `winget show` 的键值输出（键名本地化，按中英文双语匹配 + URL 兜底）。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ShowInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub homepage: String,
    pub description: String,
    pub urls: Vec<String>,
    /// 发行说明（winget 远程索引 manifest 的 ReleaseNotes，可能为空）
    pub release_notes: String,
    /// 发行说明 URL（ReleaseNotesUrl）
    pub release_notes_url: String,
}

/// 顶层键行：不以空白开头且含冒号（值行都是缩进的）。
fn is_top_level_key(line: &str) -> bool {
    !line.is_empty() && !line.starts_with(char::is_whitespace) && line.contains(':')
}

pub fn parse_show(output: &str) -> ShowInfo {
    let mut info = ShowInfo::default();
    let lines: Vec<&str> = output.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();
        i += 1;
        if trimmed.is_empty() {
            continue;
        }
        // "Found WeChat [Tencent.WeChat]" / "已找到 WeChat [Tencent.WeChat]"
        if info.id.is_empty() && trimmed.contains('[') && trimmed.contains(']') {
            if let (Some(l), Some(r)) = (trimmed.rfind('['), trimmed.rfind(']')) {
                if l < r {
                    info.id = trimmed[l + 1..r].trim().to_string();
                    let head = trimmed[..l].trim();
                    let name = head
                        .strip_prefix("Found")
                        .or_else(|| head.strip_prefix("已找到"))
                        .unwrap_or(head)
                        .trim();
                    info.name = name.to_string();
                }
            }
        }
        // 收集所有 URL 作为官网兜底
        for token in trimmed.split_whitespace() {
            if token.starts_with("https://") || token.starts_with("http://") {
                let u = token
                    .trim_end_matches(['.', ',', ')', '，', '。', '）'])
                    .to_string();
                if !info.urls.contains(&u) {
                    info.urls.push(u);
                }
            }
        }
        let Some(idx) = trimmed.find(':') else {
            continue;
        };
        let key = trimmed[..idx].trim().to_lowercase();
        let val = trimmed[idx + 1..].trim().to_string();
        // 多行块键：描述 / 发行说明 —— 捕获后续缩进行直到下一个顶层键
        let is_block_key = matches!(
            key.as_str(),
            "description" | "描述" | "release notes" | "发行说明"
        );
        let value = if is_block_key {
            let mut block = vec![val];
            while i < lines.len() && !lines[i].trim().is_empty() && !is_top_level_key(lines[i]) {
                block.push(lines[i].trim().to_string());
                i += 1;
            }
            block
                .into_iter()
                .filter(|l| !l.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            val
        };
        match key.as_str() {
            "version" | "版本" => info.version = value,
            "publisher" | "发布者" => info.publisher = value,
            "homepage" | "主页" | "官网" => info.homepage = value,
            "description" | "描述" => info.description = value,
            "release notes" | "发行说明" => info.release_notes = value,
            "release notes url" | "releasenotesurl" | "发行说明 url" | "发行说明url" => {
                info.release_notes_url = value
            }
            _ => {}
        }
    }
    if info.homepage.is_empty() {
        info.homepage = info
            .urls
            .iter()
            .find(|u| !u.contains("microsoft.com") && !u.contains("github.com/microsoft"))
            .cloned()
            .unwrap_or_default();
    }
    info
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_zh_three_columns() {
        // 真实捕获（本机 winget v1.29，中文区域）
        let out = "名称   ID             版本\n\
                   -------------------------------\n\
                   WeChat Tencent.WeChat 3.9.12.57\n";
        let rows = parse_search(out);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "WeChat");
        assert_eq!(rows[0].id, "Tencent.WeChat");
        assert_eq!(rows[0].version, "3.9.12.57");
    }

    #[test]
    fn search_zh_with_match_column_and_cjk_names() {
        // 真实捕获（winget search "钉钉"）：列按显示宽度严格对齐，含 CJK 名称
        let out = "名称                   ID                                                版本             匹配\n\
                   ---------------------------------------------------------------------------------------------------\n\
                   DingTalk Workspace CLI Alibaba.DingTalkWorkspaceCLI                      1.0.61           Tag: 钉钉\n\
                   小程序开发者工具       Alibaba.MiniProgramStudio                         3.10.5           Tag: 钉钉\n";
        let rows = parse_search(out);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name, "DingTalk Workspace CLI");
        assert_eq!(rows[0].id, "Alibaba.DingTalkWorkspaceCLI");
        assert_eq!(rows[0].version, "1.0.61");
        assert_eq!(rows[1].name, "小程序开发者工具");
        assert_eq!(rows[1].id, "Alibaba.MiniProgramStudio");
        assert_eq!(rows[1].version, "3.10.5");
    }

    #[test]
    fn search_en_five_columns() {
        let out = "Name        Id             Version   Match  Source\n\
                   ----------------------------------------------------\n\
                   WeChat      Tencent.WeChat 3.9.12.57         winget\n";
        let rows = parse_search(out);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "WeChat");
        assert_eq!(rows[0].id, "Tencent.WeChat");
        assert_eq!(rows[0].version, "3.9.12.57");
    }

    #[test]
    fn upgrade_zh_takes_available_version() {
        // 真实捕获（winget upgrade）：版本号里也可能带空格（mcmilk.7zip-zstd）
        let out = "名称                                                               ID                                     版本               可用\n\
                   --------------------------------------------------------------------------------------------------------------------------------------------\n\
                   7-Zip 26.01 (x64)                                                  7zip.7zip                              26.01              26.03\n\
                   7-Zip ZS 26.01 ZS v1.5.7 R1 (x64)                                  mcmilk.7zip-zstd                       26.01 ZS v1.5.7 R1 26.02-v1.5.7-R2\n";
        let rows = parse_upgrade(out);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name, "7-Zip 26.01 (x64)");
        assert_eq!(rows[0].id, "7zip.7zip");
        assert_eq!(rows[0].version, "26.01");
        assert_eq!(rows[0].extra.as_deref(), Some("26.03"));
        assert_eq!(rows[1].id, "mcmilk.7zip-zstd");
        assert_eq!(rows[1].version, "26.01 ZS v1.5.7 R1");
        assert_eq!(rows[1].extra.as_deref(), Some("26.02-v1.5.7-R2"));
    }

    #[test]
    fn no_match_returns_empty() {
        assert!(parse_search("找不到与输入条件匹配的程序包。").is_empty());
        assert!(parse_search("No package found matching input criteria.").is_empty());
    }

    #[test]
    fn spinner_and_agreement_lines_are_ignored() {
        let out = "已同意来源协议。\n\
                   - \n\
                   名称       ID      版本\n\
                   ---------------------------\n\
                   Git        Git.Git 2.55.0.3\n";
        let rows = parse_search(out);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "Git.Git");
    }

    #[test]
    fn parse_show_zh() {
        let out = "已找到 WeChat [Tencent.WeChat]\n\
                   版本: 3.9.12.57\n\
                   发布者: Tencent\n\
                   描述: 微信，是一个生活方式\n\
                   主页: https://weixin.qq.com\n\
                   许可证: 专有\n";
        let info = parse_show(out);
        assert_eq!(info.id, "Tencent.WeChat");
        assert_eq!(info.name, "WeChat");
        assert_eq!(info.version, "3.9.12.57");
        assert_eq!(info.publisher, "Tencent");
        assert_eq!(info.homepage, "https://weixin.qq.com");
        assert_eq!(info.description, "微信，是一个生活方式");
    }

    #[test]
    fn parse_show_multiline_release_notes() {
        // 真实形态（PowerToys）：发行说明是多行缩进块，后随顶层键
        let out = "已找到 PowerToys [Microsoft.PowerToys]\n\
                   版本: 0.101.0\n\
                   发行说明:\n  \
                      Highlights\n  \
                      PowerToys 0.101 introduces Window Hopper.\n  \
                      Watch the overview on YouTube\n\
                   发行说明 URL: https://github.com/microsoft/PowerToys/releases/tag/v0.101\n\
                   标记：\n  \
                      powertoys\n";
        let info = parse_show(out);
        assert_eq!(
            info.release_notes,
            "Highlights\nPowerToys 0.101 introduces Window Hopper.\nWatch the overview on YouTube"
        );
        assert_eq!(
            info.release_notes_url,
            "https://github.com/microsoft/PowerToys/releases/tag/v0.101"
        );
    }

    #[test]
    fn parse_show_en_homepage_fallback() {
        let out = "Found Git [Git.Git]\n\
                   Version: 2.55.0.3\n\
                   Publisher: The Git Development Community\n\
                   Copyright: https://git-scm.com/copyright\n\
                   Installer: https://github.com/git-for-windows/git/releases/download/v2.55/x.exe\n";
        let info = parse_show(out);
        assert_eq!(info.id, "Git.Git");
        // 没有 Homepage 键时，取第一个非 microsoft 系 URL
        assert_eq!(info.homepage, "https://git-scm.com/copyright");
    }
}
