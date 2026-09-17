// 图标抓取脚本：从 api.iconify.design 拉取图标 SVG，内嵌到 src/catalog/appIcons.ts。
// 用法：node scripts/fetch-icons.mjs（需要网络；生成物入库，运行时零网络请求）
// 规则：logos 集多色直接用；simple-icons 单色用品牌 hex 烘焙；黑色品牌图标留
// currentColor 以便跟随明暗主题。

import { writeFileSync } from "node:fs";

const API = "https://api.iconify.design";

/** key → 候选图标（按序尝试）。c = 烘焙颜色；无 c 的 simple-icons 留 currentColor。 */
const WANTED = {
  // ---- 软件（key = winget ID 小写）----
  "google.chrome": [{ i: "logos:chrome" }],
  "mozilla.firefox": [{ i: "logos:firefox" }],
  "microsoft.edge": [{ i: "logos:microsoft-edge" }],
  "tencent.wechat": [{ i: "logos:wechat" }, { i: "simple-icons:wechat", c: "#07C160" }],
  "tencent.qq": [{ i: "simple-icons:tencentqq", c: "#EB1923" }, { i: "simple-icons:qq", c: "#EB1923" }],
  "tencent.wecom": [{ i: "simple-icons:wecom", c: "#2B87F5" }],
  "bytedance.feishu": [{ i: "simple-icons:feishu", c: "#3370FF" }, { i: "simple-icons:lark", c: "#00D6B9" }],
  "alibaba.dingtalk.mainland": [{ i: "simple-icons:dingtalk", c: "#007FFF" }],
  "kingsoft.wpsoffice": [{ i: "simple-icons:wps", c: "#EA3E23" }],
  "notion.notion": [{ i: "simple-icons:notion" }],
  "obsidian.obsidian": [{ i: "simple-icons:obsidian", c: "#7C3AED" }],
  "xmind.xmind": [{ i: "simple-icons:xmind" }],
  "appmakes.typora": [{ i: "simple-icons:typora" }],
  "jgraph.draw": [{ i: "simple-icons:diagramsdotnet", c: "#F08705" }],
  "microsoft.visualstudiocode": [{ i: "logos:visual-studio-code" }],
  "jetbrains.intellijidea.community": [{ i: "logos:intellij-idea" }],
  "notepad++.notepad++": [{ i: "simple-icons:notepadplusplus", c: "#90E59A" }],
  "git.git": [{ i: "logos:git-icon" }, { i: "simple-icons:git", c: "#F05033" }],
  "openjs.nodejs.lts": [{ i: "logos:nodejs-icon" }, { i: "simple-icons:nodedotjs", c: "#5FA04E" }],
  "python.python.3.13": [{ i: "logos:python" }],
  "postman.postman": [{ i: "logos:postman-icon" }, { i: "simple-icons:postman", c: "#FF6C37" }],
  "microsoft.windowsterminal": [{ i: "simple-icons:windowsterminal" }],
  "genymobile.scrcpy": [{ i: "simple-icons:scrcpy" }],
  "videolan.vlc": [{ i: "simple-icons:vlcmediaplayer", c: "#FF8800" }],
  "daum.potplayer": [{ i: "simple-icons:potplayer", c: "#1CAAD9" }],
  "netease.cloudmusic": [{ i: "simple-icons:neteasecloudmusic", c: "#C20C0C" }],
  "tencent.qqmusic": [{ i: "simple-icons:qqmusic", c: "#F8C33C" }],
  "bilibili.bilibili": [{ i: "simple-icons:bilibili", c: "#00A1D6" }, { i: "logos:bilibili" }],
  "bytedance.jianyingpro": [{ i: "simple-icons:capcut" }],
  "obsproject.obsstudio": [{ i: "simple-icons:obsstudio" }],
  "valve.steam": [{ i: "logos:steam" }],
  "epicgames.epicgameslauncher": [{ i: "logos:epic-games" }, { i: "simple-icons:epicgames" }],
  "7zip.7zip": [{ i: "simple-icons:7zip" }],
  "ventoy.ventoy": [{ i: "simple-icons:ventoy", c: "#3F72B5" }],
  "rufus.rufus": [{ i: "simple-icons:rufus" }],
  "agalwood.motrix": [{ i: "simple-icons:motrix", c: "#FF6B2C" }],
  "sharex.sharex": [{ i: "simple-icons:sharex", c: "#2885F1" }],
  "baidu.baidunetdisk": [{ i: "simple-icons:baidu", c: "#4E6EF2" }],
  "alibaba.adrive": [{ i: "simple-icons:alibabacloud", c: "#FF6A00" }],

  // ---- AI 智能体 ----
  "agent:claude": [{ i: "simple-icons:anthropic", c: "#D97757" }],
  "agent:codex": [{ i: "simple-icons:openai", c: "#412991" }],
  "agent:gemini": [{ i: "simple-icons:googlegemini", c: "#8E75B2" }],
  "agent:qwen": [{ i: "simple-icons:qwen", c: "#615CED" }, { i: "simple-icons:alibabacloud", c: "#FF6A00" }],
  "agent:ollama": [{ i: "simple-icons:ollama" }],
  "agent:dsh": [{ i: "simple-icons:deepseek", c: "#4D6BFE" }],
  "agent:workbuddy": [{ i: "simple-icons:workbuddy" }],
  "agent:kimi-code": [{ i: "simple-icons:moonshot" }, { i: "simple-icons:kimi" }],
  "agent:doubao": [{ i: "simple-icons:doubao" }],
  "agent:yuanbao": [{ i: "simple-icons:tencentqq", c: "#12B7F5" }],
  "agent:coze": [{ i: "simple-icons:coze" }],
  "agent:lobehub": [{ i: "simple-icons:lobehub" }],

  // ---- 镜像中心 ----
  "mirror:winget": [{ i: "simple-icons:windows11", c: "#0078D4" }, { i: "logos:microsoft-icon" }],
  "mirror:npm": [{ i: "logos:npm-icon" }, { i: "simple-icons:npm", c: "#CB3837" }],
  "mirror:pip": [{ i: "logos:python" }],
  "mirror:cargo": [{ i: "simple-icons:rust" }],
  "mirror:docker": [{ i: "logos:docker-icon" }, { i: "simple-icons:docker", c: "#2496ED" }],
  "mirror:go": [{ i: "logos:go" }, { i: "simple-icons:go", c: "#00ADD8" }],
  "mirror:github": [{ i: "simple-icons:github" }, { i: "logos:github-icon" }],
};

async function fetchIcon({ i, c }) {
  const url = `${API}/${i.replace(":", "/")}.svg${c ? `?color=${encodeURIComponent(c)}` : ""}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) return null;
  const text = await resp.text();
  if (!text.startsWith("<svg")) return null;
  return text;
}

const out = {};
const misses = [];
for (const [key, candidates] of Object.entries(WANTED)) {
  let hit = null;
  for (const cand of candidates) {
    try {
      hit = await fetchIcon(cand);
    } catch {
      hit = null;
    }
    if (hit) {
      out[key] = hit;
      break;
    }
  }
  if (!hit) misses.push(key);
  process.stdout.write(`${hit ? "✓" : "✗"} ${key}\n`);
}

const ts = `// 本文件由 scripts/fetch-icons.mjs 自动生成，请勿手改。
// Iconify 图标数据内嵌本地：运行时零网络请求；缺失项回退字母头像。
export const APP_ICONS: Record<string, string> = ${JSON.stringify(out, null, 0)};

/** 查询图标（winget ID / agent:xx / mirror:xx），未收录返回 undefined */
export function appIcon(key: string): string | undefined {
  return APP_ICONS[key.toLowerCase()];
}
`;
writeFileSync("src/catalog/appIcons.ts", ts);
console.log(`\n写入 src/catalog/appIcons.ts：${Object.keys(out).length} 个图标`);
if (misses.length) console.log("未命中（回退字母头像）：", misses.join(", "));
