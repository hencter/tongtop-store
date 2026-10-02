/**
 * 品牌标的唯一几何来源（与 `brand/tongtop-mark.svg` 逐字一致）。
 *
 * 为什么放在 TS 里而不是运行时 fetch SVG：
 * - 桌面端与官网（React / Astro）都能直接内联，**离线零网络请求**；
 * - 站点用 SVG 精灵 `<use>` 复用同一份 path，一处改、全站生效；
 * - 和 `brand/tongtop-mark.svg` 是同一份几何：改那边时把这里的 path/圆点同步即可
 *   （`brand/` 是设计源文件，这里是实现副本）。
 *
 * 坐标：原点 = 前排深蓝外形包围盒左上；内容范围 x 0..354、y -53..250。
 */

/** 后排浅蓝窗口边框（中空，evenodd） */
export const MARK_BACK_PATH =
  "M104 3A56 56 0 0 1 160 -53H298A56 56 0 0 1 354 3V195A56 56 0 0 1 298 251H160A56 56 0 0 1 104 195Z " +
  "M148 11A20 20 0 0 1 168 -9H290A20 20 0 0 1 310 11V187A20 20 0 0 1 290 207H168A20 20 0 0 1 148 187Z";

/** 前排深蓝 T 形窗口（标题栏横梁 + 左下窗柱） */
export const MARK_FRONT_PATH =
  "M0 22A22 22 0 0 1 22 0H215A22 22 0 0 1 237 22V60A22 22 0 0 1 215 82H158V228A22 22 0 0 1 136 250H106A22 22 0 0 1 84 228V82H22A22 22 0 0 1 0 60Z";

/** 标题栏圆点：[cx, cy, r]；前排 3 枚在深蓝横梁内，后排 3 枚在浅蓝顶栏 */
export const MARK_DOTS: [number, number, number][] = [
  [27, 45, 9],
  [65, 47, 9],
  [103, 49, 9],
  [150, -20, 8],
  [180, -20, 8],
  [210, -20, 8],
];

export const MARK_COLORS = {
  back: "#1E9BF0",
  front: "#0B2E6E",
  /** 圆点是"负空间"：在深色底上必须用底色挖空，故仅用于浅底场景 */
  dots: "#FFFFFF",
} as const;

/** 内部用：把 y -53..250 平移成 0..303，得到紧凑的 viewBox */
export const MARK_VIEWBOX = "0 0 354 304";
export const MARK_CONTENT_Y = -53;
