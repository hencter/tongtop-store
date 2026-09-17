// 图标抓取脚本：Iconify 品牌 SVG + 官网 favicon 兜底，内嵌到 src/catalog/appIcons.ts。
// 用法：node scripts/fetch-icons.mjs（需要网络；生成物入库，运行时零网络请求）
//
// 规则：
// - Iconify 图标（{ i, c }）：logos 集多色直接用；simple-icons 单色用品牌 hex 烘焙；
//   不写 c 的留 currentColor，跟随明暗主题。
// - favicon 兜底（{ fav }）：Iconify 未收录的品牌抓官网 favicon，PNG/JPEG 转 data URI，
//   AppIcon 检测到 data:image/ 前缀直接用 <img> 渲染。
// - 404 视为未收录（换下一个候选）；429/5xx/超时自动重试。
// - 抓取数明显少于现有文件时中止写入（防止网络故障把图标清空）。

import { readFileSync, writeFileSync } from "node:fs";

const API = "https://api.iconify.design";
const faviconUrl = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** key → 候选（按序尝试）。{ i, c } = Iconify；{ fav } = 官网 favicon。 */
const WANTED = {
  // ---- 软件（key = winget ID 小写）----
  "google.chrome": [{ i: "logos:chrome" }],
  "mozilla.firefox": [{ i: "logos:firefox" }],
  "microsoft.edge": [{ i: "logos:microsoft-edge" }],
  "tencent.qqbrowser": [{ fav: "browser.qq.com" }],
  "tencent.wechat": [{ i: "logos:wechat" }, { i: "simple-icons:wechat", c: "#07C160" }],
  "tencent.qq": [{ i: "simple-icons:tencentqq", c: "#EB1923" }],
  "tencent.tim": [{ fav: "tim.qq.com" }, { i: "simple-icons:tencentqq", c: "#12B7F5" }],
  "tencent.wecom": [{ i: "tdesign:logo-wecom", c: "#2B87F5" }, { fav: "work.weixin.qq.com" }],
  "bytedance.feishu": [{ fav: "feishu.cn" }],
  "alibaba.dingtalk.mainland": [{ fav: "dingtalk.com" }, { i: "ant-design:dingtalk", c: "#007FFF" }],
  "kingsoft.wpsoffice": [{ fav: "wps.cn" }, { i: "hugeicons:wps-office", c: "#EA3E23" }],
  "notion.notion": [{ i: "simple-icons:notion" }],
  "obsidian.obsidian": [{ i: "simple-icons:obsidian", c: "#7C3AED" }],
  "xmind.xmind": [{ fav: "xmind.cn" }, { i: "arcticons:xmind" }],
  "appmakes.typora": [{ i: "thesvg-color:typora" }],
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
  "daum.potplayer": [{ i: "arcticons:daum", c: "#1CAAD9" }, { i: "simple-icons:potplayer", c: "#1CAAD9" }],
  "netease.cloudmusic": [{ i: "simple-icons:neteasecloudmusic", c: "#C20C0C" }],
  "tencent.qqmusic": [{ fav: "y.qq.com" }],
  "bilibili.bilibili": [{ i: "simple-icons:bilibili", c: "#00A1D6" }, { i: "logos:bilibili" }],
  "bytedance.jianyingpro": [{ i: "selfhst:capcut" }, { i: "thesvg:capcut" }, { i: "simple-icons:capcut" }],
  "obsproject.obsstudio": [{ i: "simple-icons:obsstudio" }],
  "bandisoft.honeyview": [{ fav: "www.bandisoft.com" }],
  "sharex.sharex": [{ i: "simple-icons:sharex", c: "#2885F1" }],
  "valve.steam": [{ i: "logos:steam" }],
  "epicgames.epicgameslauncher": [{ i: "logos:epic-games" }, { i: "simple-icons:epicgames" }],
  "7zip.7zip": [{ i: "simple-icons:7zip" }],
  "bandisoft.bandizip": [{ fav: "www.bandisoft.com" }],
  "voidtools.everything": [{ fav: "voidtools.com" }],
  "microsoft.powertoys": [{ i: "thesvg-color:powertoys" }, { i: "selfhst:microsoft-powertoys" }],
  "filescommunity.files": [{ fav: "files.community" }, { i: "simple-icons:files" }],
  "ventoy.ventoy": [{ i: "selfhst:iventoy" }, { i: "simple-icons:ventoy", c: "#3F72B5" }],
  "rufus.rufus": [{ fav: "rufus.ie" }, { i: "simple-icons:rufus" }],
  "agalwood.motrix": [{ fav: "motrix.app" }, { i: "simple-icons:motrix", c: "#FF6B2C" }],
  "baidu.baidunetdisk": [{ i: "simple-icons:baidu", c: "#4E6EF2" }],
  "alibaba.adrive": [{ i: "simple-icons:alibabacloud", c: "#FF6A00" }],
  "youqu.todesk": [{ fav: "todesk.com" }],

  // ---- AI 智能体 ----
  "agent:claude": [{ i: "simple-icons:anthropic", c: "#D97757" }],
  "agent:codex": [{ i: "simple-icons:openai", c: "#412991" }],
  "agent:gemini": [{ i: "simple-icons:googlegemini", c: "#8E75B2" }],
  "agent:qwen": [{ i: "simple-icons:qwen", c: "#615CED" }, { i: "simple-icons:alibabacloud", c: "#FF6A00" }],
  "agent:aider": [{ i: "simple-icons:aider" }],
  "agent:ollama": [{ i: "simple-icons:ollama" }],
  "agent:dsh": [{ i: "simple-icons:deepseek", c: "#4D6BFE" }],
  "agent:workbuddy": [{ i: "thesvg-color:workbuddy" }, { i: "simple-icons:workbuddy" }],
  "agent:kimi-code": [{ i: "simple-icons:kimi" }, { i: "simple-icons:moonshotai" }],
  "agent:doubao": [{ i: "thesvg-color:doubao" }, { i: "simple-icons:doubao" }],
  "agent:yuanbao": [{ i: "thesvg:yuanbao" }, { i: "thesvg-color:yuanbao" }, { i: "mingcute:yuanbao-fill" }],
  "agent:coze": [{ i: "simple-icons:coze" }],
  "agent:lobehub": [{ i: "thesvg-color:lobehub" }, { i: "selfhst:lobehub" }],

  // ---- 镜像中心 ----
  "mirror:winget": [{ i: "simple-icons:windows11", c: "#0078D4" }, { i: "logos:microsoft-icon" }],
  "mirror:npm": [{ i: "logos:npm-icon" }, { i: "simple-icons:npm", c: "#CB3837" }],
  "mirror:pip": [{ i: "logos:python" }],
  "mirror:cargo": [{ i: "simple-icons:rust" }],
  "mirror:docker": [{ i: "logos:docker-icon" }, { i: "simple-icons:docker", c: "#2496ED" }],
  "mirror:go": [{ i: "logos:go" }, { i: "simple-icons:go", c: "#00ADD8" }],
  "mirror:github": [{ i: "simple-icons:github" }, { i: "logos:github-icon" }],
};

/** 带重试的 GET：404 → null（未收录）；网络错误/5xx/429 重试后仍失败 → null。 */
async function get(url, tries = 3) {
  for (let n = 0; n < tries; n++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (resp.status === 404) return null;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp;
    } catch {
      if (n < tries - 1) await sleep(900 * (n + 1));
    }
  }
  return null;
}

async function fetchIcon({ i, c }) {
  const resp = await get(`${API}/${i.replace(":", "/")}.svg${c ? `?color=${encodeURIComponent(c)}` : ""}`);
  if (!resp) return null;
  const text = await resp.text();
  return text.startsWith("<svg") ? text : null;
}

async function fetchFavicon(domain) {
  const resp = await get(faviconUrl(domain));
  if (!resp) return null;
  const type = (resp.headers.get("content-type") || "").split(";")[0];
  if (!type.startsWith("image/")) return null;
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length < 300) return null;
  return `data:${type};base64,${buf.toString("base64")}`;
}

function existingCount() {
  try {
    const text = readFileSync("src/catalog/appIcons.ts", "utf8");
    const m = text.match(/export const APP_ICONS: Record<string, string> = (\{.*\});/s);
    return m ? Object.keys(JSON.parse(m[1])).length : 0;
  } catch {
    return 0;
  }
}

const out = {};
const misses = [];
for (const [key, candidates] of Object.entries(WANTED)) {
  let hit = null;
  for (const cand of candidates) {
    hit = cand.fav ? await fetchFavicon(cand.fav) : await fetchIcon(cand);
    if (hit) break;
    await sleep(150);
  }
  if (hit) out[key] = hit;
  else misses.push(key);
  process.stdout.write(`${hit ? "✓" : "✗"} ${key}\n`);
  await sleep(120);
}

const prev = existingCount();
if (prev > 0 && Object.keys(out).length < prev * 0.9) {
  console.error(`\n抓取结果异常（${Object.keys(out).length} < ${prev} 的 90%），已保留原文件不覆盖。`);
  process.exit(1);
}

const ts = `// 本文件由 scripts/fetch-icons.mjs 自动生成，请勿手改。
// Iconify 品牌 SVG / 官网 favicon（data URI）内嵌本地：运行时零网络请求；缺失项回退字母头像。
export const APP_ICONS: Record<string, string> = ${JSON.stringify(out)};

/** 查询图标（winget ID / agent:xx / mirror:xx），未收录返回 undefined */
export function appIcon(key: string): string | undefined {
  return APP_ICONS[key.toLowerCase()];
}
`;
writeFileSync("src/catalog/appIcons.ts", ts);
console.log(`\n写入 src/catalog/appIcons.ts：${Object.keys(out).length} 个图标（原有 ${prev} 个）`);
if (misses.length) console.log("未命中（回退字母头像）：", misses.join(", "));
