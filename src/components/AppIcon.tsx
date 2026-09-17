/** 软件图标：本地内嵌的 Iconify SVG / favicon 位图（运行时零网络请求），未收录回退字母头像。 */

import { appIcon } from "../catalog/appIcons";
import { Avatar } from "./Avatar";

interface Props {
  /** winget ID / agent:xx / mirror:xx */
  id: string;
  name: string;
  size?: number;
}

export function AppIcon({ id, name, size = 40 }: Props) {
  const icon = appIcon(id);
  if (!icon) return <Avatar name={name} size={size} />;
  // favicon 兜底是 data URI 位图，直接 <img>；Iconify 是可信内联 SVG（构建期抓取）
  if (icon.startsWith("data:image/")) {
    return (
      <span className="app-icon" style={{ width: size, height: size }}>
        <img src={icon} alt="" draggable={false} />
      </span>
    );
  }
  return (
    <span
      className="app-icon"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  );
}
