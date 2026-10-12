/**
 * Dashboard: titik masuk aplikasi.
 * Ringkas, bukan dashboard analitik: sapaan, pencarian, statistik kecil,
 * data yang baru diperbarui, favorit, dan aksi cepat.
 */

import { db, isLocalMode, overviewSnapshot, type CountMap, type RecentItem } from '../store';
import { currentSession } from '../session';
import { hitsHtml, runSearch } from '../search';
import { rowHtml, typeIcon } from '../cards';
import { debounce, emptyState, esc, formatRelative, icon, showError, skeletonList, toast } from '../ui';
import { bootPage } from '../boot';
import type { ResourceName } from '../types';

const STAT_CARDS: { resource: ResourceName; label: string; route: string; iconName: string }[] = [
  { resource: 'projects', label: 'Project', route: '/project', iconName: 'folder' },
  { resource: 'prompts', label: 'Prompt', route: '/prompt', iconName: 'sparkles' },
  { resource: 'documents', label: 'Dokumen', route: '/dokumen', iconName: 'file' },
  { resource: 'notes', label: 'Catatan', route: '/catatan', iconName: 'note' },
];

const QUICK_ACTIONS = [
  { label: 'Prompt Baru', href: '/prompt?new=1', iconName: 'sparkles' },
  { label: 'Catatan Baru', href: '/catatan?new=1', iconName: 'note' },
  { label: 'Unggah Dokumen', href: '/dokumen?upload=1', iconName: 'upload' },
  { label: 'Project Baru', href: '/project?new=1', iconName: 'folder' },
];

function recentRow(item: RecentItem): string {
  return rowHtml({
    iconName: typeIcon(item.item_type),
    title: item.title,
    subtitle: item.summary,
    time: formatRelative(item.updated_at),
    right: item.favorite ? `<span class="icon" style="color:#eab308">${icon('star', 14)}</span>` : '',
    attrs: `data-open="${esc(item.item_type)}:${esc(item.item_id)}"`,
  });
}

function renderRecent(container: HTMLElement, items: RecentItem[], emptyTitle: string, emptyBody: string): void {
  container.innerHTML =
    items.length === 0
      ? emptyState({ iconName: 'history', title: emptyTitle, body: emptyBody })
      : `<div class="row-list">${items.map(recentRow).join('')}</div>`;
}

function renderStats(counts: CountMap): void {
  const container = document.getElementById('dash-stats');
  if (!container) return;
  container.innerHTML = STAT_CARDS.map(
    (card) => `
    <a class="stat" href="${card.route}">
      <span class="stat-top">${icon(card.iconName, 15)}<span>${esc(card.label)}</span></span>
      <span class="stat-value">${counts[card.resource]}</span>
      <span class="stat-foot">Data aktif</span>
    </a>`,
  ).join('');
}

function wireInlineSearch(): void {
  const input = document.getElementById('dash-search') as HTMLInputElement | null;
  const results = document.getElementById('dash-search-results');
  if (!input || !results) return;

  const hide = () => {
    results.hidden = true;
    results.innerHTML = '';
  };

  const run = debounce(async () => {
    const query = input.value.trim();
    if (!query) {
      hide();
      return;
    }
    results.hidden = false;
    results.innerHTML = `<div class="loading-state"><span class="spinner"></span><span>Mencari…</span></div>`;
    try {
      const hits = await runSearch(query, 8);
      if (input.value.trim() !== query) return;
      results.innerHTML =
        hits.length === 0
          ? `<p class="page-sub" style="padding:16px">Tidak ada hasil untuk "${esc(query)}".</p>`
          : `<div style="padding:10px 6px">${hitsHtml(hits)}</div>
             <div style="padding:10px 15px;border-top:1px solid var(--border)">
               <a class="section-link" href="/cari?q=${encodeURIComponent(query)}">Lihat semua hasil untuk "${esc(query)}"</a>
             </div>`;
    } catch (error) {
      results.innerHTML = `<p class="page-sub" style="padding:16px">${esc(
        error instanceof Error ? error.message : 'Pencarian gagal.',
      )}</p>`;
    }
  }, 240);

  input.addEventListener('input', () => void run());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const query = input.value.trim();
      if (query) window.location.assign(`/cari?q=${encodeURIComponent(query)}`);
    } else if (event.key === 'Escape') {
      hide();
    }
  });
  document.addEventListener('click', (event) => {
    if (!results.contains(event.target as Node) && event.target !== input) hide();
  });
}

export async function initDashboardPage(): Promise<void> {
  await bootPage(async () => {
    const session = await currentSession();
    const nameEl = document.getElementById('dash-name');
    if (nameEl && session?.name) nameEl.textContent = `, ${session.name}`;

    const banner = document.getElementById('dash-banner');
    if (banner && isLocalMode) banner.hidden = false;

    const quick = document.getElementById('dash-quick');
    if (quick) {
      quick.innerHTML = QUICK_ACTIONS.map(
        (action) =>
          `<a class="btn btn-outline" href="${action.href}">${icon(action.iconName, 16)}<span>${esc(action.label)}</span></a>`,
      ).join('');
    }

    wireInlineSearch();

    const recentEl = document.getElementById('dash-recent');
    const favEl = document.getElementById('dash-favorites');
    if (recentEl) recentEl.innerHTML = skeletonList(2);
    if (favEl) favEl.innerHTML = skeletonList(2);

    try {
      const snapshot = await overviewSnapshot();
      renderStats(snapshot.counts);
      if (recentEl) {
        renderRecent(
          recentEl,
          snapshot.recent,
          'Belum ada data.',
          'Mulai dari aksi cepat di bawah, atau muat data demo dari Pengaturan.',
        );
      }
      if (favEl) {
        renderRecent(favEl, snapshot.favorites, 'Belum ada favorit.', 'Tandai item dengan ikon bintang supaya mudah ditemukan.');
      }
    } catch (error) {
      showError(error, 'Gagal memuat data Dashboard.');
      const statsEl = document.getElementById('dash-stats');
      if (statsEl) statsEl.innerHTML = `<p class="page-sub">Statistik tidak dapat dimuat.</p>`;
      if (recentEl) recentEl.innerHTML = emptyState({ iconName: 'alert', title: 'Gagal memuat data.', body: 'Periksa koneksi lalu muat ulang halaman.' });
      if (favEl) favEl.innerHTML = '';
    }

    // Buka detail dari baris aktivitas tanpa berpindah halaman.
    document.getElementById('content')?.addEventListener('click', async (event) => {
      const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-open]');
      if (!trigger) return;
      event.preventDefault();
      const value = trigger.dataset.open ?? '';
      const [type, id] = value.split(':');
      if (!type || !id) return;
      const routeMap: Record<string, string> = {
        projects: '/project/lihat', prompts: '/prompt', documents: '/dokumen',
        notes: '/catatan', links: '/link', accounts: '/akun', tasks: '/tugas', snippets: '/snippet',
      };
      const route = routeMap[type];
      if (route) window.location.assign(`${route}?id=${encodeURIComponent(id)}`);
      else toast('Jenis data tidak dikenal.', 'error');
    });
  });
}

export { db };
