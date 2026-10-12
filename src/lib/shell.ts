/**
 * Skrip kerangka aplikasi: drawer mobile, tombol tema, Command Palette,
 * identitas pengguna, dan tombol keluar.
 */

import { db, MODE, isLocalMode } from './store';
import { initTheme, getThemePref, setThemePref, resolveTheme, type ThemePref } from './theme';
import { icon, esc, isTypingTarget, debounce, showError, toast, copyText } from './ui';
import { currentSession, clearSessionCache, loginUrl } from './session';
import { enforceIdleLock, lock as lockVault } from './vault';
import type { SearchHit } from './types';

/* --------------------------------------------------------------- drawer */

/**
 * Buka/tutup drawer navigasi. Dipakai dua tempat: tombol menu di topbar, dan
 * tombol "Lainnya" di navigasi bawah HP.
 */
function openDrawer(): void {
  document.body.classList.add('drawer-open');
  document.getElementById('menu-button')?.setAttribute('aria-expanded', 'true');
}

function closeDrawer(): void {
  document.body.classList.remove('drawer-open');
  document.getElementById('menu-button')?.setAttribute('aria-expanded', 'false');
}

function initDrawer(): void {
  const button = document.getElementById('menu-button');
  const scrim = document.getElementById('sidebar-scrim');
  const sidebar = document.getElementById('sidebar');

  button?.addEventListener('click', () => {
    if (document.body.classList.contains('drawer-open')) closeDrawer();
    else openDrawer();
  });

  document.getElementById('mobile-nav-more')?.addEventListener('click', openDrawer);

  scrim?.addEventListener('click', closeDrawer);
  sidebar?.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a')) closeDrawer();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('drawer-open')) closeDrawer();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeDrawer();
  });
}

/* ---------------------------------------------------------------- tema */

const THEME_ORDER: ThemePref[] = ['light', 'dark', 'system'];
const THEME_ICON: Record<ThemePref, string> = { light: 'sun', dark: 'moon', system: 'monitor' };
const THEME_LABEL: Record<ThemePref, string> = { light: 'Terang', dark: 'Gelap', system: 'Mengikuti sistem' };

/**
 * Pilih preferensi berikutnya, lewati yang tidak mengubah tampilan.
 * Tanpa ini, klik pertama dari "Mengikuti sistem" saat sistem sedang terang
 * akan berpindah ke "Terang" — tidak ada perubahan yang terlihat.
 */
function nextThemePref(): ThemePref {
  const current = getThemePref();
  const currentResolved = resolveTheme(current);
  let index = THEME_ORDER.indexOf(current);
  for (let step = 1; step <= THEME_ORDER.length; step += 1) {
    const candidate = THEME_ORDER[(index + step) % THEME_ORDER.length] as ThemePref;
    if (resolveTheme(candidate) !== currentResolved) return candidate;
  }
  return current;
}

function initThemeToggle(): void {
  initTheme();
  const button = document.getElementById('theme-toggle');
  if (!button) return;

  const paint = () => {
    const pref = getThemePref();
    button.innerHTML = icon(THEME_ICON[pref], 18);
    button.setAttribute('aria-label', `Tampilan: ${THEME_LABEL[pref]}`);
    button.setAttribute('title', `Tampilan: ${THEME_LABEL[pref]} — klik untuk ganti`);
  };
  paint();

  button.addEventListener('click', () => {
    const next = nextThemePref();
    setThemePref(next);
    paint();
    toast(`Tampilan: ${THEME_LABEL[next]}.`, 'info');
  });
}

/* ------------------------------------------------------------ identitas */

async function initIdentity(): Promise<void> {
  const badge = document.getElementById('mode-badge');
  if (badge) {
    badge.textContent = isLocalMode ? 'LOKAL' : 'SUPABASE';
    badge.title = isLocalMode
      ? 'Data disimpan di perangkat ini (localStorage + IndexedDB)'
      : 'Data disimpan di Supabase (PostgreSQL + Storage)';
  }
  await refreshIdentity();
}

/**
 * Menampilkan nama dan email pengguna di sidebar.
 *
 * Nama diambil dari tabel `profiles`, bukan dari sesi auth. Di mode Supabase,
 * `updateProfile` menulis ke tabel `profiles` sedangkan `user_metadata` tidak
 * ikut berubah — kalau membaca dari sesi, nama di sidebar tidak akan pernah
 * ikut berubah setelah pengguna menyimpan profilnya. Sesi hanya dipakai sebagai
 * cadangan kalau profil belum ada.
 */
export async function refreshIdentity(): Promise<void> {
  const session = await currentSession();
  if (!session) return;

  let name = session.name || '';
  try {
    const profile = await db.getProfile();
    if (profile?.name) name = profile.name;
  } catch {
    /* pakai nama dari sesi kalau profil tidak bisa dibaca */
  }
  name = name || session.email || 'Pengguna';

  const nameEl = document.getElementById('user-name');
  const emailEl = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = session.email;
  if (avatarEl) {
    avatarEl.textContent = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
}

function initSignOut(): void {
  document.getElementById('sign-out')?.addEventListener('click', async () => {
    try {
      // Jangan tinggalkan kunci vault di memori setelah keluar.
      lockVault();
      await db.signOut();
      clearSessionCache();
      window.location.replace('/masuk');
    } catch (error) {
      showError(error, 'Gagal keluar. Silakan coba lagi.');
    }
  });
}

/** Mengunci vault otomatis setelah 15 menit tanpa aktivitas. */
function initVaultIdleWatch(): void {
  window.setInterval(() => {
    if (enforceIdleLock()) toast('Vault dikunci otomatis karena tidak ada aktivitas.', 'info');
  }, 60_000);
}

/* ------------------------------------------------------ command palette */

interface PaletteItem {
  group: string;
  label: string;
  hint?: string;
  iconName: string;
  run: () => void;
}

const ROUTES: Record<string, string> = {
  project: '/project/lihat',
  prompt: '/prompt',
  document: '/dokumen',
  note: '/catatan',
  link: '/link',
  account: '/akun',
  task: '/tugas',
  snippet: '/snippet',
};

function routeForHit(hit: SearchHit): string {
  const base = ROUTES[hit.item_type] ?? '/cari';
  return `${base}?id=${encodeURIComponent(hit.item_id)}`;
}

function quickActions(): PaletteItem[] {
  const go = (href: string) => () => window.location.assign(href);
  return [
    { group: 'Aksi Cepat', label: 'Buat Project', iconName: 'folder', hint: 'Project baru', run: go('/project?new=1') },
    { group: 'Aksi Cepat', label: 'Buat Prompt', iconName: 'sparkles', hint: 'Prompt baru', run: go('/prompt?new=1') },
    { group: 'Aksi Cepat', label: 'Buat Catatan', iconName: 'note', hint: 'Catatan baru', run: go('/catatan?new=1') },
    { group: 'Aksi Cepat', label: 'Unggah Dokumen', iconName: 'upload', hint: 'Unggah berkas', run: go('/dokumen?upload=1') },
    { group: 'Aksi Cepat', label: 'Tambah Link', iconName: 'link', hint: 'Link baru', run: go('/link?new=1') },
    { group: 'Aksi Cepat', label: 'Buat Tugas', iconName: 'check', hint: 'Tugas baru', run: go('/tugas?new=1') },
    { group: 'Aksi Cepat', label: 'Buat Snippet', iconName: 'code', hint: 'Snippet baru', run: go('/snippet?new=1') },
    { group: 'Navigasi', label: 'Buka Dashboard', iconName: 'dashboard', run: go('/') },
    { group: 'Navigasi', label: 'Buka Favorit', iconName: 'star', run: go('/favorit') },
    { group: 'Navigasi', label: 'Buka Arsip', iconName: 'archive', run: go('/arsip') },
    { group: 'Navigasi', label: 'Buka Pengaturan', iconName: 'settings', run: go('/pengaturan') },
  ];
}

const TYPE_ICON: Record<string, string> = {
  project: 'folder', prompt: 'sparkles', document: 'file', note: 'note',
  link: 'link', account: 'shield', task: 'check', snippet: 'code',
};

const TYPE_LABEL: Record<string, string> = {
  project: 'Project', prompt: 'Prompt', document: 'Dokumen', note: 'Catatan',
  link: 'Link', account: 'Account', task: 'Tugas', snippet: 'Snippet',
};

function initPalette(): void {
  const overlay = document.getElementById('palette');
  const input = document.getElementById('palette-input') as HTMLInputElement | null;
  const list = document.getElementById('palette-list');
  if (!overlay || !input || !list) return;

  let items: PaletteItem[] = [];
  let activeIndex = 0;
  let lastQuery = '';
  let hideTimer = 0;

  const render = () => {
    if (items.length === 0) {
      list.innerHTML = `<div class="loading-state">Tidak ada hasil. Coba kata kunci lain.</div>`;
      return;
    }
    let currentGroup = '';
    const html: string[] = [];
    items.forEach((item, index) => {
      if (item.group !== currentGroup) {
        currentGroup = item.group;
        html.push(`<p class="palette-group-label">${esc(currentGroup)}</p>`);
      }
      html.push(`
        <button type="button" class="palette-item ${index === activeIndex ? 'is-active' : ''}" data-index="${index}">
          <span class="row-icon">${icon(item.iconName, 16)}</span>
          <span class="row-main">
            <span class="row-title">${esc(item.label)}</span>
            ${item.hint ? `<span class="row-sub">${esc(item.hint)}</span>` : ''}
          </span>
          ${index === activeIndex ? '<kbd class="kbd">Enter</kbd>' : ''}
        </button>`);
    });
    list.innerHTML = html.join('');
    list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  };

  const setItems = (next: PaletteItem[]) => {
    items = next;
    activeIndex = 0;
    render();
  };

  const close = () => {
    overlay.classList.remove('is-visible');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      overlay.hidden = true;
    }, 160);
  };

  const open = () => {
    window.clearTimeout(hideTimer);
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    input.value = '';
    lastQuery = '';
    setItems(quickActions());
    window.setTimeout(() => input.focus(), 40);
  };

  const runActive = () => {
    const item = items[activeIndex];
    if (!item) return;
    close();
    item.run();
  };

  const search = debounce(async (query: string) => {
    if (query.trim().length === 0) {
      setItems(quickActions());
      return;
    }
    try {
      const hits = await db.search(query.trim(), 14);
      if (input.value.trim() !== query.trim()) return; // jawaban sudah basi
      const actions = quickActions().filter((action) =>
        action.label.toLowerCase().includes(query.trim().toLowerCase()),
      );
      setItems([
        ...hits.map((hit) => ({
          group: TYPE_LABEL[hit.item_type] ?? 'Data',
          label: hit.title,
          hint: [hit.subtitle, hit.snippet].filter(Boolean).join(' · ').slice(0, 110),
          iconName: TYPE_ICON[hit.item_type] ?? 'file',
          run: () => window.location.assign(routeForHit(hit)),
        })),
        ...actions,
      ]);
    } catch (error) {
      list.innerHTML = `<div class="loading-state">Gagal mencari. ${esc(
        error instanceof Error ? error.message : 'Coba lagi.',
      )}</div>`;
    }
  }, 180);

  input.addEventListener('input', () => {
    const query = input.value;
    if (query === lastQuery) return;
    lastQuery = query;
    void search(query);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(items.length - 1, activeIndex + 1);
      render();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runActive();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('[data-index]');
    if (!button) return;
    activeIndex = Number(button.getAttribute('data-index') ?? '0');
    runActive();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.getElementById('search-trigger')?.addEventListener('click', open);

  window.addEventListener('keydown', (event) => {
    const isPaletteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    if (isPaletteShortcut) {
      event.preventDefault();
      if (overlay.hidden) open();
      else close();
      return;
    }
    // Shortcut "/" membuka pencarian saat pengguna tidak sedang mengetik.
    if (event.key === '/' && !isTypingTarget(event.target) && overlay.hidden) {
      event.preventDefault();
      open();
    }
  });
}

/* ------------------------------------------------------------- shortcut */

/** Ctrl/Cmd + S menyimpan saat berada di dalam form yang ditandai. */
function initFormShortcuts(): void {
  window.addEventListener('keydown', (event) => {
    const isSave = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
    if (!isSave) return;
    const form = document.querySelector<HTMLFormElement>('form[data-autosave-shortcut]');
    if (!form) return;
    event.preventDefault();
    form.requestSubmit();
  });
}

/* ------------------------------------------------------- utilitas publik */

/**
 * Dipakai halaman detail untuk tombol "Salin".
 */
export function bindCopyButtons(root: ParentNode = document): void {
  root.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-copy]');
    if (!button) return;
    const value = button.dataset.copy ?? '';
    if (!value) return;
    const ok = await copyText(value);
    const message = button.dataset.copyMessage;
    if (ok) toast(message || 'Berhasil disalin.', 'success');
    else toast('Gagal menyalin. Salin manual ya.', 'error');
  });
}

/* ------------------------------------------------------------------ init */

export function initShell(): void {
  initDrawer();
  initThemeToggle();
  initSignOut();
  initPalette();
  initFormShortcuts();
  initVaultIdleWatch();
  bindCopyButtons();
  void initIdentity();

  // Kalau halaman dibuka kembali dari cache, pastikan sesi masih ada.
  window.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) clearSessionCache();
  });

  if (MODE === 'supabase' && window.location.pathname !== '/masuk') {
    void db.onAuthChange((session) => {
      if (!session) window.location.replace(loginUrl());
    });
  }
}
