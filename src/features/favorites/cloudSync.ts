/**
 * 收藏云同步预留。第一期没有账号，调用会说明尚未开通，不会发请求。
 * 接通天路账号后，用 apiBase + token 替换 createTongtianluSync 的返回值即可。
 */

export interface FavoriteSync {
  pull(): Promise<string[]>;
  push(ids: string[]): Promise<void>;
}

const NOT_READY = "通天路账号云同步尚未开通";

export function createTongtianluSync(_account: { apiBase: string; token: string }): FavoriteSync {
  return {
    async pull() {
      throw new Error(NOT_READY);
    },
    async push() {
      throw new Error(NOT_READY);
    },
  };
}
