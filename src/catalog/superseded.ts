/**
 * winget 源里旧包还在、精选已改用新 ID。
 * 搜索合并时丢掉这些旧 ID，避免用户装到微信 3.9 / 旧 QQ。
 */
export const SUPERSEDED_BY: Record<string, string> = {
  "tencent.wechat": "Tencent.WeChat.Universal",
  "tencent.qq": "Tencent.QQ.NT",
};

export function isSupersededPackage(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUPERSEDED_BY, id.toLowerCase());
}
