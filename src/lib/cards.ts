/**
 * Renderer kartu dan baris.
 *
 * Semua tombol pada kartu memakai atribut data-action, lalu ditangani oleh
 * pengontrol halaman lewat event delegation. Tidak ada tombol palsu: setiap
 * aksi punya penangan yang nyata.
 */

import { RESOURCES, label } from './resources';
import { icon, esc, formatRelative, formatBytes, formatDue, plainText } from './ui';
import type { ResourceMap, ResourceName, Tag } from './types';

export interface CardContext {
  tags?: Record<string, Tag[]>;
  projects?: Map<string, { name: string; color: string }>;
  /** Jumlah rahasia tersimpan per account (khusus resource accounts). */
  secretCounts?: Record<string, number>;
}

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function projectBadge(row: Row, context: CardContext): string {
  const projectId = text(row.project_id);
  if (!projectId || !context.projects) return '';
  const project = context.projects.get(projectId);
  if (!project) return '';
  return `<span class="badge"><span class="project-dot" style="background:${esc(project.color)}"></span>${esc(project.name)}</span>`;
}

function tagBadges(row: Row, context: CardContext): string {
  const tags = context.tags?.[text(row.id)];
  if (!tags || tags.length === 0) return '';
  const shown = tags.slice(0, 3);
  const extra = tags.length - shown.length;
  return (
    shown.map((tag) => `<span class="tag">${esc(tag.name)}</span>`).join('') +
    (extra > 0 ? `<span class="badge">+${extra}</span>` : '')
  );
}

function categoryBadge(resource: ResourceName, row: Row): string {
  const def = RESOURCES[resource];
  if (!def.categoryField) return '';
  const value = text(row[def.categoryField]);
  if (!value) return '';
  const tone = value === 'DONE' || value === 'COMPLETED' ? 'badge-ok' : value === 'ARCHIVED' ? '' : 'badge-accent';
  return `<span class="badge ${tone}">${esc(label(value))}</span>`;
}

function extraBadges(resource: ResourceName, row: Row, context: CardContext): string {
  const parts: string[] = [];
  if (resource === 'tasks') {
    const priority = text(row.priority);
    if (priority === 'HIGH') parts.push('<span class="badge badge-danger">Prioritas tinggi</span>');
    else if (priority === 'MEDIUM') parts.push('<span class="badge badge-warn">Prioritas sedang</span>');
    const due = formatDue(text(row.due_date));
    if (due.text) parts.push(`<span class="badge ${due.tone === 'danger' ? 'badge-danger' : due.tone === 'warn' ? 'badge-warn' : ''}">${esc(due.text)}</span>`);
  }
  if (resource === 'documents') {
    const size = Number(row.file_size ?? 0);
    if (size > 0) parts.push(`<span class="badge">${esc(formatBytes(size))}</span>`);
    const type = text(row.file_type);
    if (type) parts.push(`<span class="badge">${esc(type)}</span>`);
  }
  if (resource === 'prompts') {
    const model = text(row.ai_model);
    if (model) parts.push(`<span class="badge">${esc(model)}</span>`);
  }
  if (resource === 'snippets') {
    const language = text(row.language);
    if (language) parts.push(`<span class="badge">${esc(language)}</span>`);
  }
  if (resource === 'accounts') {
    const count = context.secretCounts?.[text(row.id)] ?? 0;
    parts.push(
      count > 0
        ? `<span class="badge badge-ok">${icon('lock', 12)}${count} password tersimpan</span>`
        : `<span class="badge">Belum ada password</span>`,
    );
  }
  if (row.archived) parts.push('<span class="badge">Diarsipkan</span>');
  return parts.join('');
}

function actionButton(action: string, id: string, iconName: string, title: string, extra = ''): string {
  return `<button type="button" class="btn btn-ghost btn-sm" data-action="${action}" data-id="${esc(id)}" ${extra}>${icon(iconName, 15)}<span>${esc(title)}</span></button>`;
}

function actionsFor(resource: ResourceName, row: Row, archived: boolean): string {
  const id = text(row.id);
  const parts: string[] = [];

  if (resource === 'projects') {
    parts.push(`<a class="btn btn-ghost btn-sm" href="/project/lihat?id=${encodeURIComponent(id)}">${icon('external', 15)}<span>Buka</span></a>`);
  }

  if (resource === 'documents') {
    parts.push(actionButton('open-file', id, 'external', 'Buka'));
    parts.push(actionButton('download', id, 'download', 'Unduh'));
  }

  if (resource === 'links') {
    const url = text(row.url);
    if (url) {
      parts.push(`<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('external', 15)}<span>Buka</span></a>`);
      parts.push(`<button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(url)}" data-copy-message="URL berhasil disalin.">${icon('copy', 15)}<span>Salin</span></button>`);
    }
  }

  if (resource === 'accounts') {
    parts.push(actionButton('secrets', id, 'vault', 'Password'));
    const loginUrl = text(row.login_url);
    if (loginUrl) parts.push(`<a class="btn btn-ghost btn-sm" href="${esc(loginUrl)}" target="_blank" rel="noopener noreferrer">${icon('external', 15)}<span>Buka</span></a>`);
    const email = text(row.email);
    if (email) parts.push(`<button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(email)}" data-copy-message="Email berhasil disalin.">${icon('copy', 15)}<span>Salin email</span></button>`);
  }

  if (resource === 'prompts') {
    parts.push(`<button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(text(row.prompt_content))}" data-copy-message="Prompt berhasil disalin.">${icon('copy', 15)}<span>Salin</span></button>`);
    parts.push(actionButton('versions', id, 'history', 'Versi'));
  }

  if (resource === 'snippets') {
    parts.push(`<button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(text(row.content))}" data-copy-message="Snippet berhasil disalin.">${icon('copy', 15)}<span>Salin</span></button>`);
  }

  if (resource === 'notes') {
    parts.push(`<button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(text(row.content))}" data-copy-message="Catatan berhasil disalin.">${icon('copy', 15)}<span>Salin</span></button>`);
  }

  if (resource === 'tasks') {
    const done = text(row.status) === 'DONE';
    parts.push(
      `<button type="button" class="btn btn-ghost btn-sm" data-action="toggle-task" data-id="${esc(id)}">${icon('check', 15)}<span>${done ? 'Buka lagi' : 'Tandai selesai'}</span></button>`,
    );
  }

  parts.push(actionButton('edit', id, 'edit', 'Ubah'));

  if (archived) {
    parts.push(actionButton('restore', id, 'restore', 'Pulihkan'));
    parts.push(actionButton('delete', id, 'trash', 'Hapus permanen', 'data-danger="1"'));
  } else {
    parts.push(actionButton('archive', id, 'archive', 'Arsipkan'));
    parts.push(actionButton('delete', id, 'trash', 'Hapus'));
  }

  return parts.join('');
}

/** Kartu lengkap satu item. */
export function cardHtml(resource: ResourceName, row: ResourceMap[ResourceName], context: CardContext = {}): string {
  const record = row as unknown as Row;
  const id = text(record.id);
  const def = RESOURCES[resource];
  const title = resource === 'projects'
    ? text(record.name)
    : text(record.title) || (resource === 'notes' ? 'Catatan tanpa judul' : text(record.service) || 'Tanpa judul');
  const archived = Boolean(record.archived);
  const favorite = Boolean(record.favorite);

  const summary = buildSummary(resource, record);
  const isMono = resource === 'snippets' || (resource === 'prompts' && !text(record.description));

  return `
    <article class="card item-card ${archived ? 'is-archived' : ''}" data-id="${esc(id)}" data-resource="${resource}">
      <div class="item-card-head">
        <h3 class="item-title">
          <button type="button" class="item-title-button" data-action="detail" data-id="${esc(id)}"
            title="Lihat detail">${esc(title)}</button>
        </h3>
        <button type="button" class="icon-button ${favorite ? 'is-on' : ''}" data-action="favorite" data-id="${esc(id)}"
          aria-pressed="${favorite}" title="${favorite ? 'Hapus dari favorit' : 'Tandai favorit'}"
          aria-label="${favorite ? 'Hapus dari favorit' : 'Tandai favorit'}">${icon('star', 16)}</button>
      </div>
      ${summary ? `<p class="item-summary ${isMono ? 'is-mono' : ''}">${esc(summary)}</p>` : ''}
      <div class="item-meta">
        ${projectBadge(record, context)}
        ${categoryBadge(resource, record)}
        ${extraBadges(resource, record, context)}
        ${tagBadges(record, context)}
      </div>
      <div class="item-actions">
        ${actionsFor(resource, record, archived)}
      </div>
      <p class="row-time" style="margin:0">Diperbarui ${esc(formatRelative(text(record.updated_at)))}</p>
    </article>`;
}

function buildSummary(resource: ResourceName, record: Row): string {
  if (resource === 'accounts') {
    return [text(record.email), text(record.username), text(record.purpose)].filter(Boolean).join(' · ');
  }
  const description = text(record.description);
  if (description) return plainText(description);
  const body = RESOURCES[resource].fields.find((f) => f.type === 'code' || f.type === 'markdown');
  if (body) {
    const value = text(record[body.name]);
    if (value) return plainText(value, 180);
  }
  return '';
}

/** Baris ringkas untuk hasil pencarian, aktivitas, dan daftar isi project. */
export function rowHtml(opts: {
  iconName: string;
  title: string;
  subtitle?: string;
  time?: string;
  right?: string;
  href?: string;
  attrs?: string;
}): string {
  const content = `
    <span class="row-icon">${icon(opts.iconName, 16)}</span>
    <span class="row-main">
      <span class="row-title">${esc(opts.title)}</span>
      ${opts.subtitle ? `<span class="row-sub">${esc(opts.subtitle)}</span>` : ''}
    </span>
    ${opts.time ? `<span class="row-time">${esc(opts.time)}</span>` : ''}
    ${opts.right ? `<span class="row-right">${opts.right}</span>` : ''}`;

  if (opts.href) {
    return `<a class="row-item" href="${esc(opts.href)}" ${opts.attrs ?? ''}>${content}</a>`;
  }
  return `<button type="button" class="row-item" ${opts.attrs ?? ''}>${content}</button>`;
}

export function typeIcon(itemType: string): string {
  const map: Record<string, string> = {
    projects: 'folder', project: 'folder',
    prompts: 'sparkles', prompt: 'sparkles',
    documents: 'file', document: 'file',
    notes: 'note', note: 'note',
    links: 'link', link: 'link',
    accounts: 'shield', account: 'shield',
    tasks: 'check', task: 'check',
    snippets: 'code', snippet: 'code',
  };
  return map[itemType] ?? 'file';
}

export function typeLabel(itemType: string): string {
  const key = (itemType.endsWith('s') ? itemType.slice(0, -1) : itemType) as keyof typeof RESOURCES;
  if (RESOURCES[key as ResourceName]) return RESOURCES[key as ResourceName].singular;
  return itemType;
}
