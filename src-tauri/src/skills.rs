//! 技能包安装：逐个文件核对 sha256，任一不符就拒绝，并且不写入目标目录。
//! 路径只允许 SKILL.md、assets/、references/、scripts/。

use base64::Engine;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillFileIn {
    pub path: String,
    pub sha256: String,
    pub content_base64: String,
}

pub fn install_skill_package_at(dest: &Path, files: &[SkillFileIn]) -> Result<(), String> {
    let verified = verify_skill_files(files)?;
    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(dest).map_err(|err| err.to_string())?;
    for (rel, bytes) in verified {
        let path = dest.join(&rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        fs::write(&path, bytes).map_err(|err| format!("写入 {} 失败：{err}", rel))?;
    }
    Ok(())
}

fn verify_skill_files(files: &[SkillFileIn]) -> Result<Vec<(String, Vec<u8>)>, String> {
    if files.is_empty() {
        return Err("技能包没有任何文件，已拒绝安装".into());
    }
    let mut out = Vec::with_capacity(files.len());
    for file in files {
        let rel = safe_rel_path(&file.path)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.content_base64.trim())
            .map_err(|err| format!("{} 不是合法的 base64：{err}", file.path))?;
        let actual = sha256_hex(&bytes);
        if !actual.eq_ignore_ascii_case(file.sha256.trim()) {
            return Err(format!(
                "校验失败，已拒绝安装：{} 的 sha256 不符（预期 {}，实际 {actual}）",
                file.path,
                file.sha256.trim()
            ));
        }
        out.push((rel, bytes));
    }
    Ok(out)
}

fn safe_rel_path(path: &str) -> Result<String, String> {
    if path.is_empty() || path.contains('\\') || path.starts_with('/') || path.contains('\0') {
        return Err(format!("非法技能路径：{path}"));
    }
    if path.split('/').any(|part| part.is_empty() || part == "." || part == "..") {
        return Err(format!("非法技能路径：{path}"));
    }
    let allowed = path == "SKILL.md"
        || path.starts_with("assets/")
        || path.starts_with("references/")
        || path.starts_with("scripts/");
    if !allowed {
        return Err(format!("技能包路径不在允许目录内：{path}"));
    }
    Ok(path.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
}

fn skills_root() -> PathBuf {
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("com.tongtianlu.store").join("skills")
}

fn safe_slug(slug: &str) -> Result<String, String> {
    if slug.is_empty()
        || !slug
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err(format!("非法技能标识：{slug}"));
    }
    Ok(slug.to_string())
}

#[tauri::command]
pub fn install_skill_package(slug: String, files: Vec<SkillFileIn>) -> Result<String, String> {
    let slug = safe_slug(&slug)?;
    let dest = skills_root().join(&slug);
    install_skill_package_at(&dest, &files)?;
    Ok(dest.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, text: &str, sha: &str) -> SkillFileIn {
        SkillFileIn {
            path: path.into(),
            sha256: sha.into(),
            content_base64: base64::engine::general_purpose::STANDARD.encode(text.as_bytes()),
        }
    }

    #[test]
    fn writes_only_when_every_hash_matches() {
        let dest = std::env::temp_dir().join(format!("tt-skill-ok-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dest);
        // echo -n 'hello' | sha256sum
        let hello = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        install_skill_package_at(
            &dest,
            &[file("SKILL.md", "hello", hello), file("scripts/run.txt", "hello", hello)],
        )
        .unwrap();
        assert_eq!(fs::read_to_string(dest.join("SKILL.md")).unwrap(), "hello");
        assert_eq!(fs::read_to_string(dest.join("scripts/run.txt")).unwrap(), "hello");
        let _ = fs::remove_dir_all(&dest);
    }

    #[test]
    fn rejects_a_bad_hash_without_creating_the_directory() {
        let dest = std::env::temp_dir().join(format!("tt-skill-bad-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dest);
        let err = install_skill_package_at(&dest, &[file("SKILL.md", "hello", "deadbeef")]).unwrap_err();
        assert!(err.contains("拒绝安装"), "{err}");
        assert!(!dest.exists());
    }

    #[test]
    fn rejects_paths_outside_the_package_layout() {
        let dest = std::env::temp_dir().join(format!("tt-skill-path-{}", std::process::id()));
        let hello = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        let err = install_skill_package_at(&dest, &[file("../SKILL.md", "hello", hello)]).unwrap_err();
        assert!(err.contains("非法技能路径"), "{err}");
        assert!(!dest.exists());
    }
}
