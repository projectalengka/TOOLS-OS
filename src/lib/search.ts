/**
 * Pencarian global.
 *
 * Di mode Supabase pencarian dijalankan di database (PostgreSQL Full Text
 * Search lewat fungsi search_all). Di Mode Lokal pencarian dijalankan di
 * perangkat dengan aturan yang sama: cocok pada judul maupun isi.
 */

import { db } from './store';
import { RESOURCES } from './resources';
import { esc, formatRelative, icon } from './ui';
import { typeIcon, typeLabel } from './cards';
import type { ResourceName, SearchHit } from './types';

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

export function hitUrl(hit: SearchHit): string {
  const base = ROUTES[hit.item_type] ?? '/cari';
  return `${base}?id=${encodeURIComponent(hit.item_id)}`;
}

/** Urutan jenis data yang ditampilkan pada hasil pencarian. */
const TYPE_ORDER = ['project', 'prompt', 'document', 'note', 'link', 'account', 'task', 'snippet'];

export function groupHits(hits: SearchHit[]): { type: string; items: SearchHit[] }[] {
  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const bucket = groups.get(hit.item_type);
    if (bucket) bucket.push(hit);
    else groups.set(hit.item_type, [hit]);
  }
  return Array.from(groups.entries())
    .sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]))
    .map(([type, items]) => ({ type, items }));
}

/** Hasil pencarian sebagai daftar baris, dikelompokkan per jenis data. */
export function hitsHtml(hits: SearchHit[]): string {
  if (hits.length === 0) return '';
  return groupHits(hits)
    .map(
      (group) => `
      <p class="palette-group-label">${esc(typeLabel(group.type))} · ${group.items.length}</p>
      <div class="row-list">
        ${group.items
          .map(
            (hit) => `
          <a class="row-item" href="${esc(hitUrl(hit))}">
            <span class="row-icon">${icon(typeIcon(hit.item_type), 16)}</span>
            <span class="row-main">
              <span class="row-title">${esc(hit.title)}${hit.archived ? ' <span class="badge">Arsip</span>' : ''}</span>
              ${hit.snippet ? `<span class="row-sub">${esc(hit.snippet)}</span>` : ''}
            </span>
            <span class="row-time">${esc(formatRelative(hit.updated_at))}</span>
          </a>`,
          )
          .join('')}
      </div>`,
    )
    .join('');
}

export async function runSearch(query: string, limit = 24): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return db.search(trimmed, limit);
}

/** Saran jenis data yang bisa dicari, dipakai untuk empty state. */
export function searchHintsHtml(): string {
  const types: ResourceName[] = ['projects', 'prompts', 'documents', 'notes', 'links', 'accounts', 'tasks', 'snippets'];
  return `<div class="item-meta">${types
    .map((type) => `<span class="badge">${esc(RESOURCES[type].singular)}</span>`)
    .join('')}</div>`;
}
