/** 应用 Logo：品牌标「双窗口 T」内联渲染（与 brand/tongtop-mark.svg 同一份几何）。
 *  几何数据来自 src/brand/mark.ts —— 标题栏、首页、终端标题共用，离线零网络请求。
 *
 *  圆点用 mask 挖成透明（负空间）：这样在浅色卡片、深色标题栏、任意背景上都成立，
 *  不会出现"白点浮在深色底上"的问题。
 *  视觉尺寸按宽度给（标是 354:304，接近方形），调用方用 className 控制大小即可。 */

import { MARK_BACK_PATH, MARK_CONTENT_Y, MARK_DOTS, MARK_FRONT_PATH, MARK_VIEWBOX } from "../brand/mark";

let uid = 0;

export function AppLogo({ className }: { className?: string }) {
  // 同一页面可能同时出现多个 logo，mask id 必须唯一，否则后渲染的会覆盖前面的
  const maskId = `tt-mark-dots-${++uid}`;
  return (
    <svg className={className} viewBox={MARK_VIEWBOX} aria-hidden>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y={MARK_CONTENT_Y} width="354" height="304">
        <rect x="0" y={MARK_CONTENT_Y} width="354" height="304" fill="#fff" />
        {MARK_DOTS.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#000" />
        ))}
      </mask>
      <g mask={`url(#${maskId})`}>
        <g transform={`translate(0 ${-MARK_CONTENT_Y})`}>
          <path fill="#1E9BF0" fillRule="evenodd" d={MARK_BACK_PATH} />
          <path fill="#0B2E6E" d={MARK_FRONT_PATH} />
        </g>
      </g>
    </svg>
  );
}
