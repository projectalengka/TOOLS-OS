/**
 * Secret.
 *
 * Halaman yang tidak ada di navigasi mana pun dan hanya bisa dibuka dengan
 * master password. Isinya: project dan prompt yang disembunyikan.
 *
 * Data di sini TIDAK dienkripsi — hanya disembunyikan dan dikunci di antarmuka.
 * Yang melindunginya: login akun, Row Level Security, filter `hidden` di semua
 * daftar/pencarian/statistik, dan gerbang master password untuk membuka halaman
 * ini. Kalau master password lupa, isinya tidak hilang — hanya tidak bisa
 * dibuka dari antarmuka.
 */

import { RESOURCES } from '../resources';
import { db } from '../store';
import { cardHtml } from '../cards';
import { handleItemAction, openFormModal, type ProjectOption } from '../itemActions';
import { openDetailModal } from '../detail';
import { lock } from '../vault';
import { openVaultGate } from '../vault-ui';
import { debounce, emptyState, esc, icon, showError, skeletonList, toast } from '../ui';
import { bootPage } from '../boot';
import { isHideable, type ResourceName, type Tag } from '../types';

type Row = Record<string, unknown>;

const TABS: ResourceName[] = ['projects', 'prompts'];

let activeTab: ResourceName = 'projects';
let search = '';
let items: Row[] = [];
let projects: ProjectOption[] = [];

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function rowTitle(resource: ResourceName, row: Row): string {
  return resource === 'projects' ? text(row.name) : text(row.title);
}

/** Pencarian lokal, hanya di antara isi Secret. */
function visibleRows(): Row[] {
  const term = search.trim().toLowerCase();
  if (!term) return items;
  return items.filter((row) => {
    const haystack = [
      rowTitle(activeTab, row),
      text(row.description),
      text(row.prompt_content),
      text(row.content),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

function renderTabs(counts: Record<string, number>): void {
  const container = document.getElementById('pv-tabs');
  if (!container) return;
  container.innerHTML = TABS.map(
    (resource) =>
      `<button type="button" class="tab ${activeTab === resource ? 'is-active' : ''}" data-tab="${resource}">
        ${esc(RESOURCES[resource].plural)} · ${counts[resource] ?? 0}
      </button>`,
  ).join('');
}

async function render(): Promise<void> {
  const list = document.getElementById('pv-list');
  if (!list) return;

  const counts: Record<string, number> = {};
  for (const resource of TABS) {
    counts[resource] = (await db.list(resource, { archived: null, hiddenOnly: true })).length;
  }
  renderTabs(counts);

  items = (await db.list(activeTab, { archived: null, hiddenOnly: true })) as unknown as Row[];

  const def = RESOURCES[activeTab];
  const rows = visibleRows();

  if (rows.length === 0) {
    list.innerHTML = search.trim()
      ? emptyState({
          iconName: 'search',
          title: 'Tidak ada hasil di Secret.',
          body: 'Coba kata kunci lain.',
        })
      : emptyState({
          iconName: 'vault',
          title: `Belum ada ${def.plural.toLowerCase()} di sini.`,
          body: `Tambahkan langsung dari halaman ini, atau tekan "Sembunyikan" pada ${def.singular.toLowerCase()} di halaman ${def.plural} biasa.`,
          actionLabel: `${def.singular} Pribadi Baru`,
          actionAttr: 'data-pv-new',
        });
    return;
  }

  let tagsMap: Record<string, Tag[]> = {};
  try {
    tagsMap = await db.tagsForMany(def.tagType, rows.map((row) => text(row.id)));
  } catch {
    tagsMap = {};
  }
  const projectMap = new Map(projects.map((item) => [item.id, { name: item.name, color: item.color }]));

  list.innerHTML = `
    <div class="section-head" style="margin-bottom:12px">
      <h2 class="section-title">${esc(def.plural)} <span class="muted">· ${rows.length}</span></h2>
      <button type="button" class="btn btn-primary btn-sm" data-pv-new>
        ${icon('plus', 15)}<span>${esc(def.singular)} Pribadi Baru</span>
      </button>
    </div>
    <div class="card-grid">
      ${rows
        .map((row) =>
          cardHtml(activeTab, row as never, { tags: tagsMap, projects: projectMap }),
        )
        .join('')}
    </div>`;
}

async function reload(): Promise<void> {
  try {
    await render();
  } catch (error) {
    showError(error, 'Gagal memuat isi Secret.');
  }
}

async function createHere(): Promise<void> {
  // Item baru langsung masuk Secret.
  await openFormModal(activeTab, {
    projects,
    createDefaults: { hidden: true },
    onSaved: reload,
  });
}

export async function initPrivatePage(): Promise<void> {
  const list = document.getElementById('pv-list');
  if (list) list.innerHTML = skeletonList(3);

  await bootPage(async () => {
    // Gerbang utama: halaman ini tidak bisa dibuka tanpa master password.
    const ready = await openVaultGate();
    if (!ready) {
      window.location.replace('/');
      return;
    }

    try {
      const rows = await db.list('projects', { archived: null, includeHidden: true });
      projects = rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        color: String(row.color || '#6366f1'),
      }));
    } catch {
      projects = [];
    }

    await reload();

    document.getElementById('pv-tabs')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!button) return;
      const resource = button.dataset.tab as ResourceName;
      if (!isHideable(resource)) return;
      activeTab = resource;
      search = '';
      const input = document.getElementById('pv-search') as HTMLInputElement | null;
      if (input) input.value = '';
      void reload();
    });

    const searchInput = document.getElementById('pv-search') as HTMLInputElement | null;
    searchInput?.addEventListener(
      'input',
      debounce(() => {
        search = searchInput.value;
        void render();
      }, 200),
    );

    document.getElementById('pv-lock')?.addEventListener('click', () => {
      lock();
      toast('Secret dikunci.', 'info');
      window.location.assign('/');
    });

    list?.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;

      if (target.closest('[data-pv-new]')) {
        event.preventDefault();
        await createHere();
        return;
      }

      const action = target.closest<HTMLElement>('[data-action]');
      if (!action) return;
      if (action.closest('[data-copy]')) return;
      const name = action.dataset.action;
      const id = action.dataset.id ?? '';
      if (!name) return;
      event.preventDefault();

      if (name === 'detail') {
        await openDetailModal(activeTab, id, {
          onChange: reload,
          onEdit: () => void openFormModal(activeTab, { id, projects, onSaved: reload }),
        });
        return;
      }

      const row = items.find((item) => text(item.id) === id);
      await handleItemAction(activeTab, name, id, { projects, row, onChanged: reload });
    });
  });
}
