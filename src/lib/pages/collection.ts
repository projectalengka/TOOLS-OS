/**
 * Halaman Favorit dan Arsip: daftar lintas jenis data.
 */

import { RESOURCES, RESOURCE_LIST } from '../resources';
import { db, secretCounts } from '../store';
import { cardHtml } from '../cards';
import { handleItemAction, type ProjectOption } from '../itemActions';
import { openDetailModal } from '../detail';
import { emptyState, esc, showError, skeletonList, toast } from '../ui';
import { bootPage } from '../boot';
import type { ResourceName, Tag } from '../types';

type Row = Record<string, unknown>;
type Mode = 'favorite' | 'archived';

interface Bucket {
  resource: ResourceName;
  rows: Row[];
  tags: Record<string, Tag[]>;
}

let mode: Mode = 'favorite';
let buckets: Bucket[] = [];
let activeResource: ResourceName | 'all' = 'all';
let projects: ProjectOption[] = [];

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

async function loadBuckets(): Promise<void> {
  const results = await Promise.all(
    RESOURCE_LIST.map(async (def) => {
      const rows = (await db.list(def.name, {
        favorite: mode === 'favorite' ? true : undefined,
        archived: mode === 'archived' ? true : undefined,
        orderBy: 'updated_at',
        ascending: false,
      })) as unknown as Row[];
      let tags: Record<string, Tag[]> = {};
      if (rows.length > 0) {
        try {
          tags = await db.tagsForMany(def.tagType, rows.map((row) => text(row.id)));
        } catch {
          tags = {};
        }
      }
      return { resource: def.name, rows, tags } satisfies Bucket;
    }),
  );
  buckets = results;
}

function renderTabs(): void {
  const container = document.getElementById('collection-tabs');
  if (!container) return;
  const total = buckets.reduce((sum, bucket) => sum + bucket.rows.length, 0);
  const available = buckets.filter((bucket) => bucket.rows.length > 0);
  if (available.length <= 1) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = [
    `<button type="button" class="tab ${activeResource === 'all' ? 'is-active' : ''}" data-resource="all">Semua · ${total}</button>`,
    ...available.map(
      (bucket) =>
        `<button type="button" class="tab ${activeResource === bucket.resource ? 'is-active' : ''}" data-resource="${bucket.resource}">${
          RESOURCES[bucket.resource].plural
        } · ${bucket.rows.length}</button>`,
    ),
  ].join('');
}

async function render(): Promise<void> {
  const container = document.getElementById('collection-body');
  if (!container) return;

  const visible = activeResource === 'all' ? buckets : buckets.filter((bucket) => bucket.resource === activeResource);
  const total = visible.reduce((sum, bucket) => sum + bucket.rows.length, 0);

  if (total === 0) {
    container.innerHTML =
      mode === 'favorite'
        ? emptyState({
            iconName: 'star',
            title: 'Belum ada favorit.',
            body: 'Tandai item dengan ikon bintang di kartu mana pun, lalu item itu akan muncul di sini.',
          })
        : emptyState({
            iconName: 'archive',
            title: 'Arsip kosong.',
            body: 'Data yang kamu arsipkan tidak hilang: ia tetap bisa dicari dan dipulihkan dari halaman ini.',
          });
    return;
  }

  const projectMap = new Map(projects.map((project) => [project.id, { name: project.name, color: project.color }]));
  container.innerHTML = (
    await Promise.all(
      visible
        .filter((bucket) => bucket.rows.length > 0)
        .map(async (bucket) => {
          const secrets = await secretCounts(bucket.resource, bucket.rows);
          return `
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">${esc(RESOURCES[bucket.resource].plural)} <span class="muted">· ${bucket.rows.length}</span></h2>
          <a class="section-link" href="${RESOURCES[bucket.resource].route}">Buka halaman ${esc(RESOURCES[bucket.resource].plural)}</a>
        </div>
        <div class="card-grid">
          ${bucket.rows
            .map((row) =>
              cardHtml(bucket.resource, row as never, {
                tags: bucket.tags,
                projects: projectMap,
                secretCounts: secrets,
              }),
            )
            .join('')}
        </div>
      </section>`;
        }),
    )
  ).join('');
}

async function onAction(resource: ResourceName, action: string, id: string): Promise<void> {
  const bucket = buckets.find((item) => item.resource === resource);
  const row = bucket?.rows.find((item) => text(item.id) === id);

  if (action === 'detail') {
    await openDetailModal(resource, id, {
      onChange: reload,
      onEdit: () => void handleItemAction(resource, 'edit', id, { projects, row, onChanged: reload }),
    });
    return;
  }

  await handleItemAction(resource, action, id, { projects, row, onChanged: reload });
}

async function reload(): Promise<void> {
  try {
    await loadBuckets();
    renderTabs();
    await render();
  } catch (error) {
    showError(error, 'Gagal memuat data.');
  }
}

export async function initCollectionPage(pageMode: Mode): Promise<void> {
  mode = pageMode;
  const container = document.getElementById('collection-body');
  if (!container) return;
  container.innerHTML = skeletonList(4);

  await bootPage(async () => {
    try {
      const projectRows = await db.list('projects', { orderBy: 'title', ascending: true });
      projects = projectRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        color: String(row.color || '#6366f1'),
      }));
    } catch {
      projects = [];
    }

    await reload();

    document.getElementById('collection-tabs')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-resource]');
      if (!button) return;
      activeResource = (button.dataset.resource as ResourceName | 'all') ?? 'all';
      renderTabs();
      void render();
    });

    container.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      if (target.closest('[data-copy]')) return;
      const card = target.closest<HTMLElement>('[data-resource]');
      const resource = card?.dataset.resource as ResourceName | undefined;
      const action = target.dataset.action;
      if (!resource || !action) return;
      event.preventDefault();
      void onAction(resource, action, target.dataset.id ?? '');
    });

    if (mode === 'archived') {
      toast('Data di arsip tetap bisa dicari lewat halaman Cari.', 'info');
    }
  });
}
