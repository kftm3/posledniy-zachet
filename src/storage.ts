// Storage can be denied by browser settings or full. Keep this session playable.
const sessionValues = new Map<string, string | null>();
export const gameStorage = {
  getItem(key: string): string | null {
    if (sessionValues.has(key)) return sessionValues.get(key) ?? null;
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    sessionValues.set(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* session fallback */ }
  },
  removeItem(key: string): void {
    sessionValues.set(key, null);
    try { window.localStorage.removeItem(key); } catch { /* session fallback */ }
  },
};
