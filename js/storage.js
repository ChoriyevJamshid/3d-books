/* storage.js — tiny persistent store (favorites, progress, recents, bookmarks).
   Everything is wrapped in try/catch so the app works even if localStorage is blocked. */

const KEY = "beyond-pages:v1";
let state = { favorites: [], progress: {}, recent: [], bookmarks: {} };
const listeners = new Set();

try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...state, ...JSON.parse(raw) };
} catch { /* ignore */ }

function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export const store = {
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  isFavorite: (id) => state.favorites.includes(id),
  favorites: () => [...state.favorites],
  toggleFavorite(id) {
    const i = state.favorites.indexOf(id);
    if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(id);
    commit();
    return i < 0;
  },

  /** progress: { face, page, total } — `page` is the furthest content page reached (1-based). */
  getProgress: (id) => state.progress[id] || null,
  setProgress(id, data) { state.progress[id] = { ...state.progress[id], ...data }; commit(); },
  percent(id, total) {
    const p = state.progress[id];
    return p && total ? Math.min(100, Math.round((p.page / total) * 100)) : 0;
  },

  touchRecent(id) {
    state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 8);
    commit();
  },
  recent: () => [...state.recent],

  bookmarks: (id) => [...(state.bookmarks[id] || [])].sort((a, b) => a - b),
  hasBookmark: (id, page) => (state.bookmarks[id] || []).includes(page),
  toggleBookmark(id, page) {
    const list = state.bookmarks[id] || (state.bookmarks[id] = []);
    const i = list.indexOf(page);
    if (i >= 0) list.splice(i, 1); else list.push(page);
    commit();
    return i < 0;
  },
};
