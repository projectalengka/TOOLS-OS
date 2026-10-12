/**
 * Modal detail: menampilkan satu item secara lengkap.
 * Dipakai dari kartu ("Lihat detail"), hasil pencarian, dan halaman Project.
 */

import { RESOURCES, label } from './resources';
import { db } from './store';
import { icon, esc, formatDateTime, formatBytes, formatDue, openModal, renderMarkdown, showError, toast, safeUrl } from './ui';
import { titleOf } from './store';
import type { ResourceName, Tag } from './types';

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function documentFilename(title: string, filePath: string): string {
  const extension = filePath.includes('.') ? filePath.split('.').pop() ?? '' : '';
  const base = title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'dokumen';
  return extension ? `${base}.${extension}` : base;
}

/** Membuka atau mengunduh berkas dokumen. */
export async function openDocumentFile(row: Row, download: boolean): Promise<void> {
  const path = text(row.file_path);
  if (!path) throw new Error('Berkas belum tersedia.');
  const filename = documentFilename(text(row.title), path);
  const url = await db.fileUrl(path, download ? filename : undefined);
  if (download) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function fieldValueHtml(resource: ResourceName, name: string, value: unknown, row: Row): string {
  const raw = text(value);
  if (!raw) return '';

  if (name === 'content' && resource === 'notes') {
    return `<div class="markdown">${renderMarkdown(raw)}</div>`;
  }
  if (name === 'prompt_content' || name === 'content' || name === 'negative_prompt') {
    return `<pre class="code-block">${esc(raw)}</pre>`;
  }
  if (name === 'url' || name === 'login_url') {
    const url = safeUrl(raw);
    return url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(raw)}</a>`
      : esc(raw);
  }
  if (name === 'due_date') {
    const due = formatDue(raw);
    return `${esc(formatDateLocal(raw))}${due.text ? ` <span class="badge ${due.tone === 'danger' ? 'badge-danger' : ''}">${esc(due.text)}</span>` : ''}`;
  }
  if (name === 'file_size') {
    return esc(formatBytes(Number(value ?? 0)));
  }
  return esc(raw);
}

function formatDateLocal(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export interface DetailOptions {
  /** Dipanggil setelah data berubah (mis. diarsipkan) agar daftar dimuat ulang. */
  onChange?: () => void;
  onEdit?: () => void;
}

export async function openDetailModal(
  resource: ResourceName,
  id: string,
  options: DetailOptions = {},
): Promise<void> {
  let row: Row;
  try {
    const loaded = await db.get(resource, id);
    if (!loaded) {
      toast('Data tidak ditemukan. Mungkin sudah dihapus.', 'error');
      return;
    }
    row = loaded as unknown as Row;
  } catch (error) {
    showError(error, 'Gagal memuat detail.');
    return;
  }

  let tags: Tag[] = [];
  try {
    tags = await db.tagsFor(RESOURCES[resource].tagType, id);
  } catch {
    tags = [];
  }

  // Tampilkan nama project, bukan UUID-nya.
  let projectName = '';
  const projectId = text(row.project_id);
  if (projectId) {
    try {
      const project = await db.get('projects', projectId);
      projectName = project ? String(project.name) : '';
    } catch {
      projectName = '';
    }
  }

  const def = RESOURCES[resource];
  const archived = Boolean(row.archived);
  const favorite = Boolean(row.favorite);

  const infoRows = def.fields
    .map((field) => {
      const value =
        field.name === 'project_id'
          ? projectName
            ? esc(projectName)
            : ''
          : fieldValueHtml(resource, field.name, row[field.name], row);
      if (!value) return '';
      const wide = field.type === 'code' || field.type === 'markdown' || field.type === 'textarea';
      return `<dt>${esc(field.label)}</dt><dd${wide ? ' class="detail-wide"' : ''}>${value}</dd>`;
    })
    .join('');

  const meta = [
    `<dt>Dibuat</dt><dd>${esc(formatDateTime(text(row.created_at)))}</dd>`,
    `<dt>Diperbarui</dt><dd>${esc(formatDateTime(text(row.updated_at)))}</dd>`,
    resource === 'documents'
      ? `<dt>Ukuran</dt><dd>${esc(formatBytes(Number(row.file_size ?? 0)))}</dd>`
      : '',
    resource === 'documents' && text(row.file_type)
      ? `<dt>Jenis berkas</dt><dd>${esc(text(row.file_type))}</dd>`
      : '',
    tags.length > 0
      ? `<dt>Tag</dt><dd>${tags.map((tag) => `<span class="tag">${esc(tag.name)}</span>`).join(' ')}</dd>`
      : '',
    row.is_demo ? '<dt>Sumber</dt><dd><span class="badge">Data demo</span></dd>' : '',
  ]
    .filter(Boolean)
    .join('');

  const footer = document.createElement('div');
  footer.className = 'modal-actions';
  footer.style.flexWrap = 'wrap';

  const copyValue =
    resource === 'prompts' ? text(row.prompt_content)
      : resource === 'snippets' || resource === 'notes' ? text(row.content)
      : resource === 'links' ? text(row.url)
      : resource === 'accounts' ? text(row.email)
      : '';

  footer.innerHTML = `
    ${copyValue ? `<button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(copyValue)}" data-copy-message="Berhasil disalin.">${icon('copy', 15)}<span>Salin</span></button>` : ''}
    ${resource === 'documents' && text(row.file_path) ? `<button type="button" class="btn btn-ghost btn-sm" data-detail-open>${icon('external', 15)}<span>Buka</span></button>` : ''}
    ${resource === 'documents' && text(row.file_path) ? `<button type="button" class="btn btn-ghost btn-sm" data-detail-download>${icon('download', 15)}<span>Unduh</span></button>` : ''}
    ${resource === 'accounts' && text(row.login_url) ? `<a class="btn btn-ghost btn-sm" href="${esc(text(row.login_url))}" target="_blank" rel="noopener noreferrer">${icon('external', 15)}<span>Buka login</span></a>` : ''}
    ${resource === 'links' && text(row.url) ? `<a class="btn btn-ghost btn-sm" href="${esc(text(row.url))}" target="_blank" rel="noopener noreferrer">${icon('external', 15)}<span>Buka</span></a>` : ''}
    <span class="spacer" style="flex:1"></span>
    <button type="button" class="btn btn-outline btn-sm" data-detail-favorite>${icon('star', 15)}<span>${favorite ? 'Hapus favorit' : 'Favorit'}</span></button>
    <button type="button" class="btn btn-outline btn-sm" data-detail-archive>${icon(archived ? 'restore' : 'archive', 15)}<span>${archived ? 'Pulihkan' : 'Arsipkan'}</span></button>
    <button type="button" class="btn btn-primary btn-sm" data-detail-edit>${icon('edit', 15)}<span>Ubah</span></button>`;

  const handle = openModal({
    title: titleOf(resource, row),
    subtitle: [def.singular, def.categoryField ? label(text(row[def.categoryField])) : ''].filter(Boolean).join(' · '),
    body: `<dl class="kv">${infoRows}${meta}</dl>`,
    footer,
    size: 'lg',
  });

  const refresh = () => options.onChange?.();

  footer.querySelector('[data-detail-edit]')?.addEventListener('click', () => {
    handle.close();
    options.onEdit?.();
  });

  footer.querySelector('[data-detail-favorite]')?.addEventListener('click', async () => {
    try {
      await db.update(resource, id, { favorite: !favorite } as never);
      toast(!favorite ? 'Ditambahkan ke favorit.' : 'Dihapus dari favorit.');
      handle.close();
      refresh();
    } catch (error) {
      showError(error, 'Gagal memperbarui favorit.');
    }
  });

  footer.querySelector('[data-detail-archive]')?.addEventListener('click', async () => {
    try {
      await db.update(resource, id, { archived: !archived } as never);
      toast(archived ? 'Data dipulihkan.' : 'Data diarsipkan.');
      handle.close();
      refresh();
    } catch (error) {
      showError(error, 'Gagal memperbarui arsip.');
    }
  });

  footer.querySelector('[data-detail-open]')?.addEventListener('click', async () => {
    try {
      await openDocumentFile(row, false);
    } catch (error) {
      showError(error, 'Gagal membuka berkas.');
    }
  });

  footer.querySelector('[data-detail-download]')?.addEventListener('click', async () => {
    try {
      await openDocumentFile(row, true);
      toast('Unduhan dimulai.');
    } catch (error) {
      showError(error, 'Gagal mengunduh berkas.');
    }
  });
}
