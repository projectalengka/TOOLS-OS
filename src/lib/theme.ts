/**
 * Preferensi tampilan: Terang / Gelap / Mengikuti Sistem.
 *
 * Preferensi disimpan di localStorage agar berlaku sebelum halaman selesai
 * dimuat (lihat skrip inline di AppLayout), sehingga tidak ada kedipan warna.
 */

export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'personal-os:theme';

export function getThemePref(): ThemePref {
  const value = localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', resolved);
  return resolved;
}

export function setThemePref(pref: ThemePref): ResolvedTheme {
  localStorage.setItem(THEME_KEY, pref);
  return applyTheme(pref);
}

/** Ikut berubah otomatis saat tema sistem berganti. */
export function watchSystemTheme(): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getThemePref() === 'system') applyTheme('system');
  };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', handler);
  else media.addListener(handler);
}

export function initTheme(): void {
  applyTheme(getThemePref());
  watchSystemTheme();
}
