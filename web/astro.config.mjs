import { defineConfig } from "astro/config";

// 简洁优先：纯静态输出 + EdgeOne Pages（web/ 为项目根，edge-functions/ 自动识别）。
// 本地联调：pnpm dev:api 起 API（8787），pnpm dev 起站点，/api 自动代理过去。
export default defineConfig({
  output: "static",
  compressHTML: true,
  vite: {
    server: {
      proxy: { "/api": "http://localhost:8787" },
      // 目录数据在仓库根 data/，允许开发服务器读取上级目录
      fs: { allow: [".."] },
    },
  },
});
