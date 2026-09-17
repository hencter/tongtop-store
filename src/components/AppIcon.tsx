/** 软件图标：本地内嵌的 Iconify 数据（运行时零网络请求），未收录回退字母头像。 */

import { appIcon } from "../catalog/appIcons";
import { Avatar } from "./Avatar";

interface Props {
  /** winget ID / agent:xx / mirror:xx */
  id: string;
  name: string;
  size?: number;
}

export function AppIcon({ id, name, size = 40 }: Props) {
  const svg = appIcon(id);
  if (!svg) return <Avatar name={name} size={size} />;
  return (
    <span
      className="app-icon"
      style={{ width: size, height: size }}
      // 本地构建期内嵌的可信 SVG（scripts/fetch-icons.mjs 生成）
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
