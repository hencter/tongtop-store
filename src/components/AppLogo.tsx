/** 应用 Logo：品牌标「通天路」全彩版——黑圆角底 + 青铜弧形大道 + AI 之星。
 *  与站点 favicon / 应用图标（app-icon.svg）同源设计，离线内嵌零网络请求。 */

export function AppLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="tongtop-road" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7E521A" />
          <stop offset="0.55" stopColor="#B8792C" />
          <stop offset="1" stopColor="#E9B563" />
        </linearGradient>
        <radialGradient id="tongtop-glow">
          <stop offset="0" stopColor="#F5D695" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#F0C87C" stopOpacity="0.28" />
          <stop offset="1" stopColor="#F0C87C" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 黑圆角底（与图标磁贴一致的比例） */}
      <rect width="512" height="512" rx="96" fill="#060606" />
      {/* 弧形大道，冲向右上角 */}
      <path fill="url(#tongtop-road)" d="M-27 538 L350 538 C81 296 242 54 538 -81 L447 -81 C188 108 -27 350 -27 538 Z" />
      {/* 分道虚线（负空间） */}
      <path d="M161 538 C27 323 215 81 492 -81" fill="none" stroke="#060606" strokeWidth="20" strokeLinecap="round" strokeDasharray="46 42" />
      {/* AI 之星 + 光晕 */}
      <circle cx="384" cy="128" r="84" fill="url(#tongtop-glow)" />
      <path fill="#F4D38F" d="M384 76 C388 108 404 124 436 128 C404 132 388 148 384 180 C380 148 364 132 332 128 C364 124 380 108 384 76 Z" />
    </svg>
  );
}
