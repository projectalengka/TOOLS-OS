/**
 * Halaman detail Project.
 *
 * Project adalah pusat organisasi: halaman ini mengumpulkan semua data yang
 * terhubung ke satu project (prompt, dokumen, catatan, link, tugas, snippet,
 * accounts) dalam satu tempat.
 */

import { RESOURCES, RESOURCE_LIST, label } from '../resources';
import { db, projectCounts, recentItems, secretCounts, type CountMap, type RecentItem } from '../store';
import { cardHtml, rowHtml, typeIcon } from '../cards';
import { handleItemAction, openFormModal, type ProjectOption } from '../itemActions';
import { openDetailModal } from '../detail';
import {
  emptyState, esc, formatRelative, icon, showError, skeletonList, toast,
} from '../ui';
import { bootPage } from '../boot';
import type { ResourceName, Tag } from '../types';

type Row = Record<string, unknown>;

const TABS: { key: string; label: string; resource?: ResourceName }[] = [
  { key: 'ringkasan', label: 'Ringkasan' },
  ...RESOURCE_LIST.filter((def) => def.hasProject).map((def) => ({
    key: def.name,
    label: def.plural,
    resource: def.name,
  })),
];

let projectId = '';
let project: Row | null = null;
let projects: ProjectOption[] = [];
let counts: CountMap | null = null;
let activeTab = 'ringkasan';

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function renderHeader(): void {
  const head = document.getElementById('pd-head');
  if (!head || !project) return;
  const status = text(project.status);
  const archived = Boolean(project.archived);
  const tone = status === 'ACTIVE' ? 'badge-ok' : status === 'COMPLETED' ? 'badge-accent' : '';

  head.innerHTML = `
    <a class="btn btn-ghost btn-sm" href="/project">${icon('arrowLeft', 15)}<span>Semua Project</span></a>
    <div class="page-head" style="margin-top:12px">
      <div>
        <h1 class="page-title">
          <span class="project-dot" style="display:inline-block;background:${esc(text(project.color) || '#6366f1')};margin-right:8px"></span>
          ${esc(text(project.name))}
        </h1>
        <p class="page-sub">${esc(text(project.description) || 'Tanpa deskripsi.')}</p>
        <div class="item-meta" style="margin-top:9px">
          <span class="badge ${tone}">${esc(label(status))}</span>
          ${archived ? '<span class="badge">Diarsipkan</span>' : ''}
          ${project.is_demo ? '<span class="badge">Data demo</span>' : ''}
          <span class="badge">Diperbarui ${esc(formatRelative(text(project.updated_at)))}</span>
        </div>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-pd-action="edit">${icon('edit', 16)}<span>Ubah Project</span></button>
        <button type="button" class="btn btn-outline" data-pd-action="${archived ? 'restore' : 'archive'}">
          ${icon(archived ? 'restore' : 'archive', 16)}<span>${archived ? 'Pulihkan' : 'Arsipkan'}</span>
        </button>
        <button type="button" class="btn btn-ghost" data-pd-action="delete">${icon('trash', 16)}<span>Hapus</span></button>
      </div>
    </div>`;
}

function renderTabs(): void {
  const container = document.getElementById('pd-tabs');
  if (!container) return;
  container.innerHTML = TABS.map((tab) => {
    const count = tab.resource && counts ? counts[tab.resource] : null;
    return `<button type="button" class="tab ${activeTab === tab.key ? 'is-active' : ''}" data-tab="${tab.key}">
      ${esc(tab.label)}${count ? ` · ${count}` : ''}
    </button>`;
  }).join('');
}

function recentRow(item: RecentItem): string {
  return rowHtml({
    iconName: typeIcon(item.item_type),
    title: item.title,
    subtitle: item.summary,
    time: formatRelative(item.updated_at),
    attrs: `data-open="${esc(item.item_type)}:${esc(item.item_id)}"`,
  });
}

async function renderOverview(): Promise<void> {
  const body = document.getElementById('pd-body');
  if (!body) return;
  body.innerHTML = skeletonList(3);

  const [recent, currentCounts] = await Promise.all([recentItems(8, projectId), projectCounts(projectId)]);
  counts = currentCounts;
  renderTabs();

  const statCards = RESOURCE_LIST.filter((def) => def.hasProject)
    .map((def) => {
      const count = currentCounts[def.name];
      return `<a class="stat" href="#" data-tab-jump="${def.name}">
        <span class="stat-top">${icon(def.icon, 15)}<span>${esc(def.plural)}</span></span>
        <span class="stat-value">${count}</span>
        <span class="stat-foot">Terhubung ke project ini</span>
      </a>`;
    })
    .join('');

  body.innerHTML = `
    <section class="section">
      <h2 class="section-title">Isi Project</h2>
      <div class="stat-grid">${statCards}</div>
    </section>
    <section class="section">
      <div class="section-head">
        <h2 class="section-title">Aktivitas Terbaru</h2>
      </div>
      <div class="panel">
        ${
          recent.length === 0
            ? emptyState({
                iconName: 'history',
                title: 'Belum ada aktivitas.',
                body: 'Tambahkan prompt, catatan, atau dokumen ke project ini untuk melihat aktivitasnya di sini.',
              })
            : `<div class="row-list">${recent.map(recentRow).join('')}</div>`
        }
      </div>
    </section>`;
}

async function renderResourceTab(resource: ResourceName): Promise<void> {
  const body = document.getElementById('pd-body');
  if (!body) return;
  const def = RESOURCES[resource];
  body.innerHTML = skeletonList(3);

  const rows = (await db.list(resource, { projectId, orderBy: 'updated_at', ascending: false })) as unknown as Row[];
  if (counts) {
    counts[resource] = rows.length;
    renderTabs();
  }

  if (rows.length === 0) {
    body.innerHTML = emptyState({
      iconName: def.icon,
      title: `Belum ada ${def.plural.toLowerCase()} di project ini.`,
      body: `Tambahkan ${def.singular.toLowerCase()} untuk mengelompokkannya ke project ${text(project?.name)}.`,
      actionLabel: `${def.singular} Baru`,
      actionAttr: `data-pd-new="${resource}"`,
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
  const secrets = await secretCounts(resource, rows);
  body.innerHTML = `
    <div class="section-head" style="margin-bottom:12px">
      <h2 class="section-title">${esc(def.plural)} <span class="muted">· ${rows.length}</span></h2>
      <button type="button" class="btn btn-primary btn-sm" data-pd-new="${resource}">
        ${icon('plus', 15)}<span>${def.singular} Baru</span>
      </button>
    </div>
    <div class="card-grid">
      ${rows
        .map((row) =>
          cardHtml(resource, row as never, { tags: tagsMap, projects: projectMap, secretCounts: secrets }),
        )
        .join('')}
    </div>`;
}

async function renderTab(tabKey: string): Promise<void> {
  activeTab = tabKey;
  renderTabs();
  const tab = TABS.find((item) => item.key === tabKey);
  try {
    if (!tab || tab.key === 'ringkasan') await renderOverview();
    else if (tab.resource) await renderResourceTab(tab.resource);
  } catch (error) {
    showError(error, 'Gagal memuat isi project.');
  }
}

async function reloadProject(): Promise<void> {
  const loaded = (await db.get('projects', projectId)) as unknown as Row | null;
  if (!loaded) {
    toast('Project tidak ditemukan.', 'error');
    window.location.assign('/project');
    return;
  }
  project = loaded;
  renderHeader();
}

export async function initProjectDetailPage(): Promise<void> {
  const body = document.getElementById('pd-body');
  if (body) body.innerHTML = skeletonList(3);

  await bootPage(async ({ params }) => {
    projectId = params.get('id') ?? '';
    const head = document.getElementById('pd-head');

    if (!projectId) {
      if (head) {
        head.innerHTML = emptyState({
          iconName: 'folder',
          title: 'Project belum dipilih.',
          body: 'Buka salah satu project dari daftar untuk melihat detailnya.',
          actionLabel: 'Lihat daftar Project',
          actionAttr: 'data-go-projects',
        });
      }
      if (body) body.innerHTML = '';
      head?.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('[data-go-projects]')) window.location.assign('/project');
      });
      return;
    }

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

    await reloadProject();
    await renderTab('ringkasan');

    document.getElementById('pd-tabs')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!button) return;
      void renderTab(button.dataset.tab ?? 'ringkasan');
    });

    document.getElementById('content')?.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;

      const jump = target.closest<HTMLElement>('[data-tab-jump]');
      if (jump) {
        event.preventDefault();
        void renderTab(jump.dataset.tabJump ?? 'ringkasan');
        return;
      }

      const createButton = target.closest<HTMLElement>('[data-pd-new]');
      if (createButton) {
        event.preventDefault();
        const resource = createButton.dataset.pdNew as ResourceName;
        if (resource === 'documents') {
          await handleItemAction('documents', 'new', '', { projects, onChanged: () => renderTab(activeTab) });
        } else {
          await openFormModal(resource, {
            projects,
            prefill: { project_id: projectId },
            onSaved: () => renderTab(activeTab),
          });
        }
        return;
      }

      const headerAction = target.closest<HTMLElement>('[data-pd-action]');
      if (headerAction) {
        event.preventDefault();
        const action = headerAction.dataset.pdAction ?? '';
        if (action === 'edit') {
          await openFormModal('projects', {
            id: projectId,
            projects,
            onSaved: async () => {
              await reloadProject();
              await renderTab(activeTab);
            },
          });
          return;
        }
        await handleItemAction('projects', action, projectId, {
          projects,
          row: project ?? undefined,
          onChanged: async () => {
            if (action === 'delete') {
              window.location.assign('/project');
              return;
            }
            await reloadProject();
            await renderTab(activeTab);
          },
        });
        return;
      }

      const openRow = target.closest<HTMLElement>('[data-open]');
      if (openRow) {
        event.preventDefault();
        const [type, id] = (openRow.dataset.open ?? '').split(':');
        if (!type || !id) return;
        const resource = (type.endsWith('s') ? type : `${type}s`) as ResourceName;
        await openDetailModal(resource, id, {
          onChange: () => renderTab(activeTab),
          onEdit: () =>
            void openFormModal(resource, { id, projects, onSaved: () => renderTab(activeTab) }),
        });
        return;
      }

      const cardAction = target.closest<HTMLElement>('[data-action]');
      if (!cardAction) return;
      if (cardAction.closest('[data-copy]')) return;
      const card = cardAction.closest<HTMLElement>('[data-resource]');
      const resource = card?.dataset.resource as ResourceName | undefined;
      const action = cardAction.dataset.action;
      if (!resource || !action) return;
      event.preventDefault();

      const rows = (await db.list(resource, { projectId })) as unknown as Row[];
      const row = rows.find((item) => text(item.id) === (cardAction.dataset.id ?? ''));
      await handleItemAction(resource, action, cardAction.dataset.id ?? '', {
        projects,
        row,
        onChanged: () => renderTab(activeTab),
      });
    });
  });
}
