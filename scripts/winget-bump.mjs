// 发布新版本后生成 winget 清单：node scripts/winget-bump.mjs [version]
// - 版本默认取 package.json；安装包取 src-tauri/target/release/bundle/nsis/
// - 生成 winget/TongTianLu.TongTopStore/<version>/ 下四个 YAML
// - 生成后：winget validate --manifest <目录>，再 wingetcreate submit 提交 PR
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version =
  process.argv[2] ?? JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const id = "TongTianLu.TongTopStore";
const schemaVersion = "1.12.0";

const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
const expected = `tongtop-store_${version}_x64-setup.exe`;
let installer = path.join(bundleDir, expected);
if (!existsSync(installer)) {
  const exes = existsSync(bundleDir)
    ? readdirSync(bundleDir).filter((f) => f.toLowerCase().endsWith(".exe"))
    : [];
  if (exes.length === 0) {
    console.error(`未找到安装包（先执行 pnpm tauri build）`);
    process.exit(1);
  }
  exes.sort((a, b) => statSync(path.join(bundleDir, b)).mtimeMs - statSync(path.join(bundleDir, a)).mtimeMs);
  installer = path.join(bundleDir, exes[0]);
  console.warn(`未找到 ${expected}，改用最新：${exes[0]}`);
}

const assetName = path.basename(installer);
const sha256 = createHash("sha256").update(readFileSync(installer)).digest("hex").toUpperCase();

let repo = "hencter/tongtop-store";
try {
  repo = execSync("git remote get-url origin", { cwd: root })
    .toString()
    .trim()
    .replace(/^.*github\.com[:/]/, "")
    .replace(/\.git$/, "");
} catch {
  // 用默认仓库
}

const url = `https://github.com/${repo}/releases/download/v${version}/${assetName}`;
const releaseDate = new Date().toISOString().slice(0, 10);
const dir = path.join(root, "winget", id, version);
mkdirSync(dir, { recursive: true });

const schema = (kind) =>
  `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${kind}.${schemaVersion}.schema.json`;

writeFileSync(
  path.join(dir, `${id}.yaml`),
  `${schema("version")}
PackageIdentifier: ${id}
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${schemaVersion}
`,
);

writeFileSync(
  path.join(dir, `${id}.installer.yaml`),
  `${schema("installer")}
PackageIdentifier: ${id}
PackageVersion: ${version}
InstallerType: nullsoft
Scope: user
InstallModes:
  - interactive
  - silent
  - silentWithProgress
UpgradeBehavior: install
ReleaseDate: ${releaseDate}
Installers:
  - Architecture: x64
    InstallerUrl: ${url}
    InstallerSha256: ${sha256}
    AppsAndFeaturesEntries:
      - DisplayName: tongtop-store
        Publisher: tongtianlu
        DisplayVersion: ${version}
        InstallerType: nullsoft
ManifestType: installer
ManifestVersion: ${schemaVersion}
`,
);

const locale = (locale, name, short, description, tags) => `${schema(
  locale === "en-US" ? "defaultLocale" : "locale",
)}
PackageIdentifier: ${id}
PackageVersion: ${version}
PackageLocale: ${locale}
Publisher: TongTianLu
PublisherUrl: https://github.com/${repo.split("/")[0]}
PublisherSupportUrl: https://github.com/${repo}/issues
PackageName: ${name}
PackageUrl: https://github.com/${repo}
License: Proprietary
ShortDescription: ${short}
Description: |-
${description
  .split("\n")
  .map((line) => `  ${line}`)
  .join("\n")}
Tags:
${tags.map((t) => `  - ${t}`).join("\n")}
ReleaseNotesUrl: https://github.com/${repo}/releases/tag/v${version}
ManifestType: ${locale === "en-US" ? "defaultLocale" : "locale"}
ManifestVersion: ${schemaVersion}
`;

writeFileSync(
  path.join(dir, `${id}.locale.en-US.yaml`),
  locale(
    "en-US",
    "TongTop Store",
    "Windows app store with one-click AI agent setup, powered by winget.",
    `TongTop Store is a Windows app store built with Tauri. It curates software installable
through the official winget source, and provides one-click setup for AI coding agents
(Claude Code, Codex CLI, Gemini CLI, Qwen Code, Aider, Ollama and more): installing the
runtime, the CLI itself, mirror acceleration and user-level environment variables in one
flow. It also manages npm/pip/cargo/docker/go mirrors, cleans winget caches, and checks
for its own updates.`,
    ["app-store", "winget", "ai", "ai-agent", "cli", "tauri"],
  ),
);

writeFileSync(
  path.join(dir, `${id}.locale.zh-CN.yaml`),
  locale(
    "zh-CN",
    "TongTop Store 应用商店",
    "基于 winget 的 Windows 应用商店，支持 AI 智能体一键装机。",
    `TongTop Store 是基于 Tauri 的 Windows 应用商店：精选软件走 winget 官方源安装；
内置 AI 智能体一键装机（Claude Code、Codex CLI、Gemini CLI、Qwen Code、Aider、Ollama 等），
自动完成装运行时、装本体、配国内镜像、写用户级环境变量；同时提供 npm/pip/cargo/docker/go
镜像源管理、winget 缓存清理与自动更新。`,
    ["应用商店", "winget", "ai", "智能体", "命令行", "tauri"],
  ),
);

console.log(`已生成 winget/${id}/${version}/（${assetName}，SHA256 ${sha256.slice(0, 12)}…）`);
console.log("下一步：");
console.log(`  winget validate --manifest winget/${id}/${version}`);
console.log(
  `  wingetcreate submit --prtitle "New package: ${id} version ${version}" --token <gh-token> winget/${id}/${version}`,
);
