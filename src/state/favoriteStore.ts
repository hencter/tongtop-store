/** 本机收藏。只写 localStorage，重启后还在。 */

import { create } from "zustand";
import { loadFavoriteIds, saveFavoriteIds } from "../catalog/wingetImport";

interface FavoriteStore {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

export const useFavoriteStore = create<FavoriteStore>()((set, get) => ({
  ids: loadFavoriteIds(localStorage),
  has: (id) => get().ids.some((item) => item.toLowerCase() === id.toLowerCase()),
  toggle: (id) => {
    const current = get().ids;
    const next = current.some((item) => item.toLowerCase() === id.toLowerCase())
      ? current.filter((item) => item.toLowerCase() !== id.toLowerCase())
      : [...current, id];
    set({ ids: saveFavoriteIds(localStorage, next) });
  },
}));
