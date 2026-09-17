/** 更新日志：优先 GitHub Release 正文（目录里标了 github 的），否则 winget 索引的 ReleaseNotes。
 *  GitHub API 有匿名限流（60 次/小时）——结果一律走 SQLite 缓存（6h/24h），
 *  预取只走 winget show（本地进程，无限制）。
 */

import { create } from "zustand";
import * as ipc from "../ipc/client";
import { CATALOG_BY_ID } from "../catalog/apps";

interface NotesStore {
  notesFor: string | null;
  title: string;
  text: string;
  url: string;
  loading: boolean;
  error: string | null;
  open: (id: string, displayName: string) => Promise<void>;
  close: () => void;
}

export const useNotesStore = create<NotesStore>()((set) => ({
  notesFor: null,
  title: "",
  text: "",
  url: "",
  loading: false,
  error: null,
  open: async (id, displayName) => {
    set({ notesFor: id, title: displayName, text: "", url: "", loading: true, error: null });
    const catalog = CATALOG_BY_ID.get(id.toLowerCase());
    try {
      if (catalog?.github) {
        const r = await ipc.githubRelease(catalog.github);
        set({
          loading: false,
          text: r.body || `该发布未附更新日志（${r.tag}）。`,
          url: r.url || `https://github.com/${catalog.github}/releases`,
        });
      } else {
        const n = await ipc.releaseNotes(id);
        set({
          loading: false,
          text: n.notes || (n.url ? "" : "winget 索引未提供该软件的更新日志正文。"),
          url: n.url,
        });
      }
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },
  close: () => set({ notesFor: null, text: "", url: "", loading: false, error: null }),
}));
