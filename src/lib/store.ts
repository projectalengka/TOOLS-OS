/**
 * Facade data PERSONAL OS.
 *
 * Halaman dan komponen hanya berbicara ke modul ini, tidak pernah langsung ke
 * Supabase atau localStorage. Dengan begitu, mode penyimpanan bisa berganti
 * tanpa mengubah UI.
 */

import { isSupabaseConfigured } from './supabase';
import { localAdapter } from './local';
import { remoteAdapter } from './remote';
import { RESOURCES, RESOURCE_LIST, label } from './resources';
import { plainText } from './ui';
import type { BackupPayload, ListOptions, ResourceMap, ResourceName, Session } from './types';

export type StorageMode = 'supabase' | 'local';

/** Mode aktif ditentukan otomatis dari environment variable. */
export const MODE: StorageMode = isSupabaseConfigured ? 'supabase' : 'local';
export const isLocalMode = MODE === 'local';

export const db = isSupabaseConfigured ? remoteAdapter : localAdapter;

export type { BackupPayload, ListOptions, Session };

/* ------------------------------------------------------------------ util */

/** Judul yang aman ditampilkan untuk sembarang resource. */
export function titleOf(resource: ResourceName, row: unknown): string {
  const record = row as Record<string, unknown>;
  if (resource === 'projects') return String(record.name ?? 'Tanpa nama');
  const title = record.title;
  if (typeof title === 'string' && title.trim()) return title;
  if (resource === 'notes') return 'Catatan tanpa judul';
  if (resource === 'accounts') return String(record.service ?? 'Account');
  return 'Tanpa judul';
}

/** Ringkasan singkat satu baris untuk kartu. */
export function summaryOf(resource: ResourceName, row: unknown): string {
  const def = RESOURCES[resource];
  const record = row as Record<string, unknown>;
  if (resource === 'accounts') {
    return [record.email, record.username].filter(Boolean).map(String).join(' · ');
  }
  const field = def.fields.find((f) => f.name === 'description');
  if (field) {
    const value = record[field.name];
    if (typeof value === 'string' && value.trim()) return plainText(value);
  }
  const body = def.fields.find((f) => f.type === 'code' || f.type === 'markdown');
  if (body) {
    const value = record[body.name];
    if (typeof value === 'string' && value.trim()) return plainText(value, 160);
  }
  const category = def.categoryField ? record[def.categoryField] : undefined;
  return typeof category === 'string' ? label(category) : '';
}

/* --------------------------------------------------------- data turunan */

export interface RecentItem {
  item_type: ResourceName;
  item_id: string;
  title: string;
  summary: string;
  updated_at: string;
  project_id: string | null;
  favorite: boolean;
  archived: boolean;
}

/**
 * Data yang baru dibuat atau dimodifikasi, digabung dari semua jenis data.
 * Dipakai di Dashboard dan halaman detail Project.
 */
export async function recentItems(limit = 6, projectId?: string): Promise<RecentItem[]> {
  const perResource = Math.max(limit, 4);
  const batches = await Promise.all(
    RESOURCE_LIST.map(async (def) => {
      const options: ListOptions = {
        orderBy: 'updated_at',
        ascending: false,
        limit: perResource,
      };
      if (projectId && def.hasProject) options.projectId = projectId;
      if (projectId && !def.hasProject) return [];
      const rows = await db.list(def.name, options);
      return rows.map((row) => ({
        item_type: def.name,
        item_id: String((row as { id: string }).id),
        title: titleOf(def.name, row),
        summary: summaryOf(def.name, row),
        updated_at: String((row as { updated_at: string }).updated_at),
        project_id: ((row as { project_id?: string | null }).project_id ?? null) as string | null,
        favorite: Boolean((row as { favorite?: boolean }).favorite),
        archived: Boolean((row as { archived?: boolean }).archived),
      }));
    }),
  );

  return batches
    .flat()
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, limit);
}

export type CountMap = Record<ResourceName, number>;

/** Item favorit dari semua jenis data, dipakai di Dashboard. */
export async function favoriteItems(limit = 6): Promise<RecentItem[]> {
  const batches = await Promise.all(
    RESOURCE_LIST.map(async (def) => {
      const rows = await db.list(def.name, { favorite: true, orderBy: 'updated_at', ascending: false, limit: 3 });
      return rows.map((row) => ({
        item_type: def.name,
        item_id: String((row as { id: string }).id),
        title: titleOf(def.name, row),
        summary: summaryOf(def.name, row),
        updated_at: String((row as { updated_at: string }).updated_at),
        project_id: ((row as { project_id?: string | null }).project_id ?? null) as string | null,
        favorite: true,
        archived: Boolean((row as { archived?: boolean }).archived),
      }));
    }),
  );
  return batches
    .flat()
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, limit);
}

/** Jumlah data aktif per jenis, dipakai untuk statistik Dashboard. */
export async function activeCounts(): Promise<CountMap> {
  const entries = await Promise.all(
    RESOURCE_LIST.map(async (def) => [def.name, await db.count(def.name)] as const),
  );
  const result = {} as CountMap;
  for (const [name, total] of entries) result[name] = total;
  return result;
}

/** Jumlah data per jenis yang terhubung ke satu project. */
export async function projectCounts(projectId: string): Promise<CountMap> {
  const entries = await Promise.all(
    RESOURCE_LIST.map(async (def) => {
      if (!def.hasProject) return [def.name, 0] as const;
      return [def.name, await db.countByProject(def.name, projectId)] as const;
    }),
  );
  const result = {} as CountMap;
  for (const [name, total] of entries) result[name] = total;
  return result;
}

/** Daftar pilihan project untuk dropdown, diambil sekali per halaman. */
export async function projectOptions(): Promise<{ id: string; name: string; color: string }[]> {
  const rows = await db.list('projects', { orderBy: 'title', ascending: true });
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    color: String(row.color || '#6366f1'),
  }));
}

export async function tagOptions(): Promise<{ id: string; name: string }[]> {
  const tags = await db.listTags();
  return tags.map((tag) => ({ id: tag.id, name: tag.name }));
}

/**
 * Jumlah rahasia tersimpan per account. Hanya berlaku untuk resource accounts;
 * resource lain mengembalikan objek kosong.
 */
export async function secretCounts(resource: ResourceName, rows: unknown[]): Promise<Record<string, number>> {
  if (resource !== 'accounts' || rows.length === 0) return {};
  const ids = rows.map((row) => String((row as { id: string }).id));
  try {
    return await db.countSecretsByAccount(ids);
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------- pengaturan */

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportBackup(): Promise<BackupPayload> {
  return db.exportAll();
}

/** Nama berkas backup, contoh: personal-os-backup-2026-10-08.json */
export function backupFilename(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `personal-os-backup-${stamp}.json`;
}

export type { ResourceMap };

/* --------------------------------------------------------- snapshot awal */

export interface OverviewSnapshot {
  counts: CountMap;
  recent: RecentItem[];
  favorites: RecentItem[];
}

/**
 * Mengambil data Dashboard dalam satu gelombang.
 *
 * Satu daftar per jenis data dipakai untuk dua kebutuhan sekaligus (baru
 * diperbarui dan favorit), jadi tidak ada permintaan yang duplikat.
 */
export async function overviewSnapshot(perResource = 12): Promise<OverviewSnapshot> {
  const [countEntries, listEntries] = await Promise.all([
    Promise.all(RESOURCE_LIST.map(async (def) => [def.name, await db.count(def.name)] as const)),
    Promise.all(
      RESOURCE_LIST.map(
        async (def) =>
          [
            def.name,
            await db.list(def.name, { orderBy: 'updated_at', ascending: false, limit: perResource }),
          ] as const,
      ),
    ),
  ]);

  const counts = {} as CountMap;
  for (const [name, total] of countEntries) counts[name] = total;

  const all: RecentItem[] = [];
  for (const [name, rows] of listEntries) {
    for (const row of rows) {
      all.push({
        item_type: name,
        item_id: String((row as { id: string }).id),
        title: titleOf(name, row),
        summary: summaryOf(name, row),
        updated_at: String((row as { updated_at: string }).updated_at),
        project_id: ((row as { project_id?: string | null }).project_id ?? null) as string | null,
        favorite: Boolean((row as { favorite?: boolean }).favorite),
        archived: Boolean((row as { archived?: boolean }).archived),
      });
    }
  }

  all.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

  return {
    counts,
    recent: all.slice(0, 6),
    favorites: all.filter((item) => item.favorite).slice(0, 4),
  };
}
