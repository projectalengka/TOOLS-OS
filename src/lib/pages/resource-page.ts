/**
 * Pengontrol halaman resource: daftar, filter, pencarian, dan CRUD.
 * Semua aksi item didelegasikan ke itemActions.ts agar tidak ada duplikasi UI.
 */

import { RESOURCES } from '../resources';
import { db, secretCounts } from '../store';
import { cardHtml } from '../cards';
import { handleItemAction, openFormModal, openUploadModal, type ProjectOption } from '../itemActions';
import { openDetailModal } from '../detail';
import { debounce, emptyState, esc, showError, skeletonList } from '../ui';
import { bootPage } from '../boot';
import type { ResourceName, Tag } from '../types';

type Row = Record<string, unknown>;
type Scope = 'active' | 'favorite' | 'archived';

interface State {
  resource: ResourceName;
  scope: Scope;
  search: string;
  category: string;
  projectId: string;
  tagId: string;
  projects: ProjectOption[];
  items: Row[];
}

const state: State = {
  resource: 'prompts',
  scope: 'active',
  search: '',
  category: '',
  projectId: '',
  tagId: '',
  projects: [],
  items: [],
};

let listEl: HTMLElement;
let countEl: HTMLElement;
let searchInput: HTMLInputElement;

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

async function loadProjects(): Promise<void> {
  const rows = await db.list('projects', { orderBy: 'title', ascending: true });
  state.projects = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    color: String(row.color || '#6366f1'),
  }));
  const select = document.getElementById('rp-project') as HTMLSelectElement | null;
  if (select) {
    const current = select.value;
    select.innerHTML =
      '<option value="">Semua project</option>' +
      state.projects.map((project) => `<option value="${esc(project.id)}">${esc(project.name)}</option>`).join('');
    select.value = current;
  }
}

async function loadTags(): Promise<void> {
  const tags = await db.listTags();
  const select = document.getElementById('rp-tag') as HTMLSelectElement | null;
  if (select) {
    const current = select.value;
    select.innerHTML =
      '<option value="">Semua tag</option>' +
      tags.map((tag) => `<option value="${esc(tag.id)}">#${esc(tag.name)}</option>`).join('');
    select.value = current;
  }
}

async function refresh(): Promise<void> {
  const rows = (await db.list(state.resource, {
    orderBy: 'updated_at',
    ascending: false,
    search: state.search || undefined,
    category: state.category || undefined,
    projectId: state.projectId || undefined,
    tagId: state.tagId || undefined,
    favorite: state.scope === 'favorite' ? true : undefined,
    archived: state.scope === 'archived' ? true : state.scope === 'active' ? undefined : null,
  })) as unknown as Row[];

  state.items = rows;
  await render(rows);
}

async function render(rows: Row[]): Promise<void> {
  const def = RESOURCES[state.resource];

  if (rows.length === 0) {
    const filtered = Boolean(state.search || state.category || state.projectId || state.tagId);
    countEl.textContent = '';
    listEl.innerHTML = filtered
      ? emptyState({
          iconName: 'search',
          title: 'Tidak ada hasil.',
          body: 'Coba ubah kata kunci atau kosongkan filter yang sedang aktif.',
          actionLabel: 'Bersihkan filter',
          actionAttr: 'data-action="clear-filters"',
        })
      : state.scope === 'archived'
        ? emptyState({ iconName: 'archive', title: 'Arsip kosong.', body: 'Data yang kamu arsipkan akan muncul di sini dan tetap bisa dicari.' })
        : state.scope === 'favorite'
          ? emptyState({ iconName: 'star', title: 'Belum ada favorit.', body: 'Tandai item dengan ikon bintang untuk menemukannya lebih cepat.' })
          : emptyState({
              iconName: def.icon,
              title: def.emptyTitle,
              body: def.emptyBody,
              actionLabel: state.resource === 'documents' ? 'Unggah Dokumen' : `${def.singular} Baru`,
              actionAttr: 'data-action="new"',
            });
    return;
  }

  countEl.textContent = `${rows.length} ${def.plural.toLowerCase()}`;

  let tagsMap: Record<string, Tag[]> = {};
  try {
    tagsMap = await db.tagsForMany(def.tagType, rows.map((row) => text(row.id)));
  } catch {
    tagsMap = {};
  }

  const secrets = await secretCounts(state.resource, rows);
  const projects = new Map(state.projects.map((project) => [project.id, { name: project.name, color: project.color }]));
  listEl.innerHTML = `<div class="card-grid">${rows
    .map((row) => cardHtml(state.resource, row as never, { tags: tagsMap, projects, secretCounts: secrets }))
    .join('')}</div>`;
}

function rowById(id: string): Row | undefined {
  return state.items.find((item) => text(item.id) === id);
}

async function onAction(action: string, id: string): Promise<void> {
  if (action === 'clear-filters') {
    state.search = '';
    state.category = '';
    state.projectId = '';
    state.tagId = '';
    searchInput.value = '';
    document.querySelectorAll<HTMLSelectElement>('#rp-category, #rp-project, #rp-tag').forEach((select) => {
      select.value = '';
    });
    await refresh();
    return;
  }

  await handleItemAction(state.resource, action, id, {
    projects: state.projects,
    row: rowById(id),
    onChanged: async () => {
      await Promise.all([refresh(), loadTags()]);
    },
  });
}

function wireToolbar(): void {
  const categorySelect = document.getElementById('rp-category') as HTMLSelectElement | null;
  categorySelect?.addEventListener('change', () => {
    state.category = categorySelect.value;
    void refresh();
  });

  const projectSelect = document.getElementById('rp-project') as HTMLSelectElement | null;
  projectSelect?.addEventListener('change', () => {
    state.projectId = projectSelect.value;
    void refresh();
  });

  const tagSelect = document.getElementById('rp-tag') as HTMLSelectElement | null;
  tagSelect?.addEventListener('change', () => {
    state.tagId = tagSelect.value;
    void refresh();
  });

  const scope = document.getElementById('rp-scope');
  scope?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-scope]');
    if (!button) return;
    state.scope = (button.dataset.scope as Scope) ?? 'active';
    scope.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button));
    void refresh();
  });

  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    void refresh();
  }, 260));

  document.getElementById('rp-new')?.addEventListener('click', () => void onAction('new', ''));

  listEl.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    if (target.closest('[data-copy]')) return; // tombol Salin ditangani secara global
    const action = target.dataset.action;
    if (!action) return;
    event.preventDefault();
    void onAction(action, target.dataset.id ?? '');
  });
}

export async function initResourcePage(resource: ResourceName): Promise<void> {
  state.resource = resource;
  listEl = document.getElementById('rp-list') as HTMLElement;
  countEl = document.getElementById('rp-count') as HTMLElement;
  searchInput = document.getElementById('rp-search') as HTMLInputElement;
  if (!listEl || !countEl || !searchInput) return;

  listEl.innerHTML = skeletonList(6);

  await bootPage(async ({ params }) => {
    wireToolbar();

    try {
      await Promise.all([loadProjects(), loadTags()]);
    } catch (error) {
      showError(error, 'Gagal memuat data pendukung.');
    }

    await refresh();

    const id = params.get('id');
    if (id) {
      await openDetailModal(resource, id, {
        onChange: refresh,
        onEdit: () => void openFormModal(resource, { id, projects: state.projects, onSaved: refresh }),
      });
      return;
    }
    if (params.get('new') === '1') {
      if (resource === 'documents') await openUploadModal(state.projects, async () => {
        await Promise.all([refresh(), loadTags()]);
      });
      else await openFormModal(resource, {
        projects: state.projects,
        onSaved: async () => {
          await Promise.all([refresh(), loadTags()]);
        },
      });
      return;
    }
    if (params.get('upload') === '1' && resource === 'documents') {
      await openUploadModal(state.projects, async () => {
        await Promise.all([refresh(), loadTags()]);
      });
    }
  });
}
