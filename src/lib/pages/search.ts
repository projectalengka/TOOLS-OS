/**
 * Halaman Cari: pencarian global di seluruh jenis data.
 */

import { groupHits, hitsHtml, runSearch, searchHintsHtml } from '../search';
import { typeLabel } from '../cards';
import { debounce, emptyState, esc, skeletonList } from '../ui';
import { bootPage } from '../boot';
import type { SearchHit } from '../types';

let allHits: SearchHit[] = [];
let activeType = '';

const listEl = () => document.getElementById('search-results') as HTMLElement;
const summaryEl = () => document.getElementById('search-summary') as HTMLElement;
const filtersEl = () => document.getElementById('search-filters') as HTMLElement;

function renderFilters(): void {
  const container = filtersEl();
  if (!container) return;
  const groups = groupHits(allHits);
  if (groups.length <= 1) {
    container.innerHTML = '';
    return;
  }
  const chips = [
    `<button type="button" class="badge badge-button ${activeType === '' ? 'is-active' : ''}" data-type="">Semua · ${allHits.length}</button>`,
    ...groups.map(
      (group) =>
        `<button type="button" class="badge badge-button ${activeType === group.type ? 'is-active' : ''}" data-type="${esc(group.type)}">${esc(
          typeLabel(group.type),
        )} · ${group.items.length}</button>`,
    ),
  ];
  container.innerHTML = `<div class="item-meta">${chips.join('')}</div>`;
}

function renderResults(): void {
  const container = listEl();
  const summary = summaryEl();
  if (!container) return;

  const filtered = activeType ? allHits.filter((hit) => hit.item_type === activeType) : allHits;
  if (summary) {
    summary.textContent = allHits.length === 0 ? '' : `${filtered.length} hasil ditemukan.`;
  }
  container.innerHTML = `<div style="padding:6px">${hitsHtml(filtered)}</div>`;
}

export async function initSearchPage(): Promise<void> {
  await bootPage(async ({ params }) => {
    const input = document.getElementById('search-input') as HTMLInputElement;
    const container = listEl();
    if (!input || !container) return;

    const showIdle = () => {
      if (summaryEl()) summaryEl().textContent = '';
      if (filtersEl()) filtersEl().innerHTML = '';
      container.innerHTML = emptyState({
        iconName: 'search',
        title: 'Mulai mengetik untuk mencari.',
        body: 'Pencarian mencakup judul dan isi dari seluruh data kamu, termasuk yang sudah diarsipkan.',
      }) + `<div style="display:flex;flex-direction:column;gap:10px;align-items:center;margin-top:-24px">${searchHintsHtml()}</div>`;
    };

    const execute = debounce(async (query: string) => {
      if (!query.trim()) {
        allHits = [];
        activeType = '';
        showIdle();
        return;
      }
      container.innerHTML = skeletonList(3);
      try {
        allHits = await runSearch(query, 40);
        activeType = '';
        const url = new URL(window.location.href);
        url.searchParams.set('q', query);
        window.history.replaceState({}, '', url);
        if (allHits.length === 0) {
          if (summaryEl()) summaryEl().textContent = '';
          if (filtersEl()) filtersEl().innerHTML = '';
          container.innerHTML = emptyState({
            iconName: 'search',
            title: `Tidak ada hasil untuk "${query}".`,
            body: 'Coba kata kunci lain, atau periksa ejaan.',
          });
          return;
        }
        renderFilters();
        renderResults();
      } catch (error) {
        container.innerHTML = emptyState({
          iconName: 'alert',
          title: 'Pencarian gagal dijalankan.',
          body: error instanceof Error ? error.message : 'Terjadi kesalahan. Silakan coba lagi.',
          actionLabel: 'Coba lagi',
          actionAttr: 'data-retry',
        });
      }
    }, 260);

    filtersEl()?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-type]');
      if (!button) return;
      activeType = button.dataset.type ?? '';
      renderFilters();
      renderResults();
    });

    container.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-retry]')) void execute(input.value);
    });

    input.addEventListener('input', () => void execute(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        input.value = '';
        void execute('');
      }
    });

    const initial = params.get('q') ?? '';
    if (initial) {
      input.value = initial;
      await execute(initial);
    } else {
      showIdle();
      input.focus();
    }
  });
}
