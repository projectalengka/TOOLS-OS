/**
 * Adapter "Mode Lokal".
 *
 * Dipakai otomatis ketika PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY belum
 * diisi. Seluruh data disimpan di perangkat ini saja:
 *   - metadata  -> localStorage
 *   - isi berkas -> IndexedDB (lihat idb.ts)
 *
 * Mode ini membuat aplikasi bisa langsung dipakai tanpa setup apa pun. Begitu
 * environment variable Supabase diisi, aplikasi otomatis beralih ke Supabase
 * dan adapter ini tidak lagi dipakai.
 */

import type {
  ActivityLog, BackupPayload, ListOptions, PromptVersion, ResourceMap,
  ResourceName, SearchHit, Secret, Session, Tag, TagItemType, TagRelation, VaultMeta,
} from './types';
import { RESOURCES, label } from './resources';
import { isHideable } from './types';
import * as idb from './idb';

type Row = Record<string, unknown>;
type Collection =
  | ResourceName
  | 'prompt_versions' | 'tags' | 'tag_relations' | 'activity_logs' | 'secrets';

interface LocalDB {
  version: number;
  collections: Record<Collection, Row[]>;
}

const DB_KEY = 'personal-os:db:v1';
const SESSION_KEY = 'personal-os:session:v1';
const VAULT_KEY = 'personal-os:vault-meta';
const MAX_ACTIVITY = 200;

const CONTENT_RESOURCES: ResourceName[] = [
  'projects', 'prompts', 'documents', 'notes', 'links', 'accounts', 'tasks', 'snippets',
];

const SEARCH_FIELDS: Record<ResourceName, string[]> = {
  projects: ['name', 'description', 'status'],
  prompts: ['title', 'description', 'prompt_content', 'negative_prompt', 'category', 'ai_model', 'variables'],
  documents: ['title', 'description', 'file_type', 'category'],
  notes: ['title', 'content'],
  links: ['title', 'url', 'description', 'category'],
  accounts: ['service', 'account_name', 'email', 'username', 'purpose', 'recovery_email', 'notes'],
  tasks: ['title', 'description', 'status', 'priority'],
  snippets: ['title', 'content', 'language'],
};

const TITLE_FIELD: Record<ResourceName, string> = {
  projects: 'name', prompts: 'title', documents: 'title', notes: 'title',
  links: 'title', accounts: 'service', tasks: 'title', snippets: 'title',
};

/* ------------------------------------------------------------------ util */

function str(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyDb(): LocalDB {
  return {
    version: 1,
    collections: {
      projects: [], prompts: [], documents: [], notes: [],
      links: [], accounts: [], tasks: [], snippets: [],
      prompt_versions: [], tags: [], tag_relations: [], activity_logs: [], secrets: [],
    },
  };
}

function readDb(): LocalDB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as LocalDB;
    if (!parsed || typeof parsed !== 'object' || !parsed.collections) return emptyDb();
    const base = emptyDb();
    for (const key of Object.keys(base.collections) as Collection[]) {
      const value = parsed.collections[key];
      base.collections[key] = Array.isArray(value) ? value : [];
    }
    return base;
  } catch {
    return emptyDb();
  }
}

function writeDb(db: LocalDB): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (error) {
    throw new Error(
      'Penyimpanan lokal penuh. Hapus beberapa dokumen atau pindah ke mode Supabase.',
    );
  }
}

function coll(db: LocalDB, name: Collection): Row[] {
  const rows = db.collections[name];
  if (!rows) {
    db.collections[name] = [];
    return db.collections[name] as Row[];
  }
  return rows as Row[];
}

function currentUserId(): string {
  const session = readSession();
  return session?.userId ?? 'local-user';
}

/* ------------------------------------------------------------------ sesi */

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed || !parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- aktivitas */

function pushActivity(
  db: LocalDB,
  action: string,
  itemType: string,
  itemId: string | null,
  itemTitle: string,
): void {
  const logs = coll(db, 'activity_logs');
  logs.unshift({
    id: uuid(),
    user_id: currentUserId(),
    action,
    item_type: itemType,
    item_id: itemId,
    item_title: itemTitle,
    created_at: nowIso(),
  } as Row);
  db.collections.activity_logs = logs.slice(0, MAX_ACTIVITY);
}

/* ------------------------------------------------------------------ tags */

function normalizeTag(name: string): string {
  return name.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase();
}

function ensureTagRow(db: LocalDB, name: string): Row | null {
  const clean = normalizeTag(name);
  if (!clean) return null;
  const tags = coll(db, 'tags');
  const found = tags.find((t) => str(t.name) === clean);
  if (found) return found;
  const created: Row = {
    id: uuid(),
    user_id: currentUserId(),
    name: clean,
    created_at: nowIso(),
  };
  tags.push(created);
  return created;
}

/* ------------------------------------------------------------- pemetaan */

function matchesSearch(row: Row, resource: ResourceName, term: string): boolean {
  if (!term) return true;
  const needle = term.toLowerCase();
  return SEARCH_FIELDS[resource].some((field) => str(row[field]).toLowerCase().includes(needle));
}

function searchHit(resource: ResourceName, row: Row, term: string): SearchHit {
  const def = RESOURCES[resource];
  const title = str(row[TITLE_FIELD[resource]]) || def.singular;
  let subtitle = '';
  if (resource === 'accounts') subtitle = str(row.email) || str(row.username);
  else if (def.categoryField) subtitle = label(str(row[def.categoryField]));
  const body = def.fields
    .filter((f) => f.type !== 'select' && f.type !== 'project')
    .map((f) => str(row[f.name]))
    .filter(Boolean)
    .join(' · ');
  const index = term ? body.toLowerCase().indexOf(term.toLowerCase()) : -1;
  const snippet = index >= 0 ? body.slice(Math.max(0, index - 40), index + 120) : body.slice(0, 160);
  return {
    item_type: resource.slice(0, -1),
    item_id: str(row.id),
    title,
    subtitle,
    snippet,
    project_id: (row.project_id as string | null) ?? null,
    favorite: bool(row.favorite),
    archived: bool(row.archived),
    updated_at: str(row.updated_at),
    rank: 1,
  };
}

function sortRows(rows: Row[], orderBy: string, ascending: boolean): Row[] {
  const direction = ascending ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (orderBy === 'title') {
      return str(a.title || a.name).localeCompare(str(b.title || b.name), 'id') * direction;
    }
    const av = str(a[orderBy]);
    const bv = str(b[orderBy]);
    if (av === bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return av < bv ? -direction : direction;
  });
}

/* ================================================================== API */

/**
 * Mode Lokal tidak memakai password: aplikasi ini privat dan berjalan di
 * perangkat sendiri. Yang disimpan hanya identitas untuk menyapa pengguna.
 */
function signUpLocal(email: string, name: string): { session: Session; needsConfirm: boolean } {
  const previous = readSession();
  const session: Session = {
    userId: previous?.userId ?? uuid(),
    email: email.trim(),
    name: name.trim() || email.split('@')[0] || 'Pengguna',
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { session, needsConfirm: false };
}

export const localAdapter = {
  mode: 'local' as const,

  async getSession(): Promise<Session | null> {
    return readSession();
  },

  async signIn(email: string, _password: string): Promise<Session> {
    return signUpLocal(email, email.split('@')[0] ?? 'Pengguna').session;
  },

  async signUp(email: string, _password: string, name: string): Promise<{ session: Session; needsConfirm: boolean }> {
    return signUpLocal(email, name);
  },

  async signOut(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
  },

  async sendPasswordReset(_email: string): Promise<void> {
    throw new Error('Mode Lokal tidak memakai password, jadi tidak ada yang perlu direset.');
  },

  /** Mode Lokal tidak punya pendaftaran, jadi tidak ada yang perlu ditutup. */
  async isSignupEnabled(): Promise<boolean> {
    return true;
  },

  async onAuthChange(_callback?: (session: Session | null) => void): Promise<() => void> {
    return () => {};
  },

  async getProfile(): Promise<{ name: string; email: string; theme: string } | null> {
    const session = readSession();
    if (!session) return null;
    const theme = localStorage.getItem('personal-os:theme') ?? 'system';
    return { name: session.name, email: session.email, theme };
  },

  async updateProfile(patch: { full_name?: string; theme?: string }): Promise<void> {
    const session = readSession();
    if (!session) return;
    if (patch.full_name !== undefined) {
      session.name = patch.full_name;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    if (patch.theme !== undefined) localStorage.setItem('personal-os:theme', patch.theme);
  },

  /* --- CRUD --- */
  async list<R extends ResourceName>(resource: R, opts: ListOptions = {}): Promise<ResourceMap[R][]> {
    const db = readDb();
    let rows = coll(db, resource).slice();

    if (opts.archived === undefined) rows = rows.filter((r) => !bool(r.archived));
    else if (opts.archived === true) rows = rows.filter((r) => bool(r.archived));

    if (opts.favorite) rows = rows.filter((r) => bool(r.favorite));
    if (opts.projectId) rows = rows.filter((r) => str(r.project_id) === opts.projectId);
    if (opts.status) rows = rows.filter((r) => str(r.status) === opts.status);

    // Ruang Pribadi. Perilakunya harus sama dengan adapter Supabase: data yang
    // disembunyikan tidak ikut terdaftar kecuali diminta secara eksplisit.
    if (isHideable(resource)) {
      if (opts.hiddenOnly) rows = rows.filter((r) => bool(r.hidden));
      else if (!opts.includeHidden) rows = rows.filter((r) => !bool(r.hidden));
    }
    if (opts.category) {
      const field = RESOURCES[resource].categoryField;
      if (field) rows = rows.filter((r) => str(r[field]) === opts.category);
    }
    if (opts.tagId) {
      const relations = coll(db, 'tag_relations').filter(
        (rel) => str(rel.tag_id) === opts.tagId && str(rel.item_type) === RESOURCES[resource].tagType,
      );
      const ids = new Set(relations.map((rel) => str(rel.item_id)));
      rows = rows.filter((r) => ids.has(str(r.id)));
    }
    if (opts.search) rows = rows.filter((r) => matchesSearch(r, resource, opts.search as string));

    rows = sortRows(rows, opts.orderBy ?? 'updated_at', opts.ascending ?? false);
    if (opts.limit && opts.limit > 0) rows = rows.slice(0, opts.limit);
    return rows as unknown as ResourceMap[R][];
  },

  async get<R extends ResourceName>(resource: R, id: string): Promise<ResourceMap[R] | null> {
    const db = readDb();
    const found = coll(db, resource).find((r) => str(r.id) === id);
    return (found as unknown as ResourceMap[R]) ?? null;
  },

  async create<R extends ResourceName>(
    resource: R,
    payload: Partial<ResourceMap[R]>,
  ): Promise<ResourceMap[R]> {
    const db = readDb();
    const timestamp = nowIso();
    const row: Row = {
      id: uuid(),
      user_id: currentUserId(),
      favorite: false,
      archived: false,
      created_at: timestamp,
      updated_at: timestamp,
      ...(payload as Row),
    };
    row.id = uuid();
    row.created_at = timestamp;
    row.updated_at = timestamp;
    coll(db, resource).push(row);
    pushActivity(db, 'create', RESOURCES[resource].tagType, str(row.id), str(row.title || row.name));
    writeDb(db);
    return row as unknown as ResourceMap[R];
  },

  async update<R extends ResourceName>(
    resource: R,
    id: string,
    patch: Partial<ResourceMap[R]>,
  ): Promise<ResourceMap[R]> {
    const db = readDb();
    const rows = coll(db, resource);
    const index = rows.findIndex((r) => str(r.id) === id);
    if (index < 0) throw new Error('Data tidak ditemukan.');
    const existing = rows[index] as Row;
    const updated: Row = { ...existing, ...(patch as Row), id: str(existing.id), updated_at: nowIso() };
    rows[index] = updated;
    pushActivity(db, 'update', RESOURCES[resource].tagType, id, str(updated.title || updated.name));
    writeDb(db);
    return updated as unknown as ResourceMap[R];
  },

  async remove(resource: ResourceName, id: string): Promise<void> {
    const db = readDb();
    const rows = coll(db, resource);
    const index = rows.findIndex((r) => str(r.id) === id);
    if (index < 0) return;
    const removed = rows[index] as Row;
    rows.splice(index, 1);

    // Hapus versi prompt bila prompt dihapus.
    if (resource === 'prompts') {
      db.collections.prompt_versions = coll(db, 'prompt_versions').filter(
        (v) => str(v.prompt_id) !== id,
      );
    }
    // Hapus relasi tag yang menggantung.
    db.collections.tag_relations = coll(db, 'tag_relations').filter(
      (rel) => str(rel.item_id) !== id,
    );
    // Hapus berkas dokumen dari IndexedDB.
    if (resource === 'documents') {
      const path = str(removed.file_path);
      if (path.startsWith('local://')) await idb.deleteFile(path.slice(8));
    }
    // Hapus rahasia milik account yang dihapus.
    if (resource === 'accounts') {
      db.collections.secrets = coll(db, 'secrets').filter((s) => str(s.account_id) !== id);
    }
    pushActivity(db, 'delete', RESOURCES[resource].tagType, null, str(removed.title || removed.name));
    writeDb(db);
  },

  async count(resource: ResourceName, opts: { archived?: boolean } = {}): Promise<number> {
    const db = readDb();
    const wantArchived = opts.archived ?? false;
    return coll(db, resource).filter(
      (r) =>
        bool(r.archived) === wantArchived &&
        !(isHideable(resource) && bool(r.hidden)),
    ).length;
  },

  async countByProject(resource: ResourceName, projectId: string): Promise<number> {
    const db = readDb();
    return coll(db, resource).filter(
      (r) =>
        str(r.project_id) === projectId &&
        !bool(r.archived) &&
        !(isHideable(resource) && bool(r.hidden)),
    ).length;
  },

  /* --- pencarian --- */
  async search(q: string, limit = 12, opts: { includeHidden?: boolean } = {}): Promise<SearchHit[]> {
    const term = q.trim();
    if (!term) return [];
    const db = readDb();
    const hits: SearchHit[] = [];
    for (const resource of CONTENT_RESOURCES) {
      for (const row of coll(db, resource)) {
        // Isi Ruang Pribadi tidak boleh muncul di pencarian biasa.
        if (isHideable(resource) && bool(row.hidden) && !opts.includeHidden) continue;
        if (matchesSearch(row, resource, term)) hits.push(searchHit(resource, row, term));
      }
    }
    hits.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return hits.slice(0, limit);
  },

  /* --- versi prompt --- */
  async listVersions(promptId: string): Promise<PromptVersion[]> {
    const db = readDb();
    return coll(db, 'prompt_versions')
      .filter((v) => str(v.prompt_id) === promptId)
      .map((v) => v as unknown as PromptVersion)
      .sort((a, b) => b.version_number - a.version_number);
  },

  async createVersion(
    promptId: string,
    data: { content: string; label?: string; note?: string; negative_prompt?: string },
  ): Promise<PromptVersion> {
    const db = readDb();
    const versions = coll(db, 'prompt_versions').filter((v) => str(v.prompt_id) === promptId);
    const nextNumber = versions.reduce((max, v) => Math.max(max, num(v.version_number)), 0) + 1;
    const timestamp = nowIso();
    const row: Row = {
      id: uuid(),
      user_id: currentUserId(),
      prompt_id: promptId,
      version_number: nextNumber,
      label: data.label ?? '',
      content: data.content,
      negative_prompt: data.negative_prompt ?? '',
      note: data.note ?? '',
      is_current: true,
      created_at: timestamp,
      updated_at: timestamp,
    };
    for (const v of coll(db, 'prompt_versions')) v.is_current = false;
    coll(db, 'prompt_versions').push(row);
    const prompt = coll(db, 'prompts').find((p) => str(p.id) === promptId);
    if (prompt) {
      prompt.prompt_content = data.content;
      prompt.negative_prompt = data.negative_prompt ?? str(prompt.negative_prompt);
      prompt.updated_at = timestamp;
    }
    pushActivity(db, 'version', 'prompt', promptId, `Versi ${nextNumber}`);
    writeDb(db);
    return row as unknown as PromptVersion;
  },

  async updateVersion(id: string, patch: Partial<PromptVersion>): Promise<PromptVersion> {
    const db = readDb();
    const rows = coll(db, 'prompt_versions');
    const index = rows.findIndex((v) => str(v.id) === id);
    if (index < 0) throw new Error('Versi tidak ditemukan.');
    const updated = { ...(rows[index] as Row), ...(patch as Row), updated_at: nowIso() };
    rows[index] = updated;
    writeDb(db);
    return updated as unknown as PromptVersion;
  },

  async deleteVersion(id: string): Promise<void> {
    const db = readDb();
    db.collections.prompt_versions = coll(db, 'prompt_versions').filter((v) => str(v.id) !== id);
    writeDb(db);
  },

  async setCurrentVersion(promptId: string, versionId: string): Promise<void> {
    const db = readDb();
    const target = coll(db, 'prompt_versions').find((v) => str(v.id) === versionId);
    if (!target) throw new Error('Versi tidak ditemukan.');
    for (const v of coll(db, 'prompt_versions')) {
      if (str(v.prompt_id) === promptId) v.is_current = str(v.id) === versionId;
    }
    const prompt = coll(db, 'prompts').find((p) => str(p.id) === promptId);
    if (prompt) {
      prompt.prompt_content = str(target.content);
      prompt.negative_prompt = str(target.negative_prompt);
      prompt.updated_at = nowIso();
    }
    pushActivity(db, 'update', 'prompt', promptId, `Versi ${num(target.version_number)} dijadikan versi saat ini`);
    writeDb(db);
  },

  /* --- tag --- */
  async listTags(): Promise<Tag[]> {
    const db = readDb();
    return coll(db, 'tags')
      .map((t) => t as unknown as Tag)
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  },

  async tagsFor(itemType: TagItemType, itemId: string): Promise<Tag[]> {
    const db = readDb();
    const tagIds = coll(db, 'tag_relations')
      .filter((rel) => str(rel.item_type) === itemType && str(rel.item_id) === itemId)
      .map((rel) => str(rel.tag_id));
    return coll(db, 'tags')
      .filter((t) => tagIds.includes(str(t.id)))
      .map((t) => t as unknown as Tag);
  },

  async tagsForMany(itemType: TagItemType, itemIds: string[]): Promise<Record<string, Tag[]>> {
    const db = readDb();
    const wanted = new Set(itemIds);
    const result: Record<string, Tag[]> = {};
    const tagById = new Map(coll(db, 'tags').map((t) => [str(t.id), t as unknown as Tag]));
    for (const rel of coll(db, 'tag_relations')) {
      if (str(rel.item_type) !== itemType) continue;
      const itemId = str(rel.item_id);
      if (!wanted.has(itemId)) continue;
      const tag = tagById.get(str(rel.tag_id));
      if (!tag) continue;
      (result[itemId] ??= []).push(tag);
    }
    return result;
  },

  async setTags(itemType: TagItemType, itemId: string, names: string[]): Promise<Tag[]> {
    const db = readDb();
    const cleaned = Array.from(new Set(names.map(normalizeTag).filter(Boolean)));

    db.collections.tag_relations = coll(db, 'tag_relations').filter(
      (rel) => !(str(rel.item_type) === itemType && str(rel.item_id) === itemId),
    );

    const relations = coll(db, 'tag_relations');
    const attached: Tag[] = [];
    for (const name of cleaned) {
      const tag = ensureTagRow(db, name);
      if (!tag) continue;
      relations.push({
        id: uuid(),
        user_id: currentUserId(),
        tag_id: str(tag.id),
        item_type: itemType,
        item_id: itemId,
        created_at: nowIso(),
      } as Row);
      attached.push(tag as unknown as Tag);
    }
    writeDb(db);
    return attached;
  },

  async deleteTag(id: string): Promise<void> {
    const db = readDb();
    db.collections.tags = coll(db, 'tags').filter((t) => str(t.id) !== id);
    db.collections.tag_relations = coll(db, 'tag_relations').filter((rel) => str(rel.tag_id) !== id);
    writeDb(db);
  },

  /* --- aktivitas --- */
  async log(action: string, itemType: string, itemId: string | null, title: string): Promise<void> {
    const db = readDb();
    pushActivity(db, action, itemType, itemId, title);
    writeDb(db);
  },

  async listActivity(limit = 30): Promise<ActivityLog[]> {
    const db = readDb();
    return coll(db, 'activity_logs')
      .slice(0, limit)
      .map((r) => r as unknown as ActivityLog);
  },

  /* --- rahasia terenkripsi (vault) --- */
  async listSecrets(accountId?: string): Promise<Secret[]> {
    const db = readDb();
    return coll(db, 'secrets')
      .filter((s) => !accountId || str(s.account_id) === accountId)
      .map((s) => s as unknown as Secret)
      .sort((a, b) => a.label.localeCompare(b.label, 'id'));
  },

  async countSecretsByAccount(accountIds: string[]): Promise<Record<string, number>> {
    const db = readDb();
    const wanted = new Set(accountIds);
    const result: Record<string, number> = {};
    for (const row of coll(db, 'secrets')) {
      const accountId = str(row.account_id);
      if (!wanted.has(accountId)) continue;
      result[accountId] = (result[accountId] ?? 0) + 1;
    }
    return result;
  },

  async createSecret(data: { account_id: string; label: string; ciphertext: string; iv: string }): Promise<Secret> {
    const db = readDb();
    const timestamp = nowIso();
    const row: Row = {
      id: uuid(),
      user_id: currentUserId(),
      account_id: data.account_id,
      label: data.label,
      ciphertext: data.ciphertext,
      iv: data.iv,
      created_at: timestamp,
      updated_at: timestamp,
    };
    coll(db, 'secrets').push(row);
    pushActivity(db, 'vault-save', 'account', data.account_id, data.label);
    writeDb(db);
    return row as unknown as Secret;
  },

  async updateSecret(id: string, patch: Partial<Secret>): Promise<Secret> {
    const db = readDb();
    const rows = coll(db, 'secrets');
    const index = rows.findIndex((s) => str(s.id) === id);
    if (index < 0) throw new Error('Rahasia tidak ditemukan.');
    const updated = { ...(rows[index] as Row), ...(patch as Row), id, updated_at: nowIso() };
    rows[index] = updated;
    writeDb(db);
    return updated as unknown as Secret;
  },

  async deleteSecret(id: string): Promise<void> {
    const db = readDb();
    db.collections.secrets = coll(db, 'secrets').filter((s) => str(s.id) !== id);
    writeDb(db);
  },

  async getVaultMeta(): Promise<VaultMeta | null> {
    try {
      const raw = localStorage.getItem(VAULT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as VaultMeta;
      return parsed && parsed.salt && parsed.check ? parsed : null;
    } catch {
      return null;
    }
  },

  async setVaultMeta(meta: VaultMeta): Promise<void> {
    localStorage.setItem(VAULT_KEY, JSON.stringify(meta));
  },

  /* --- berkas --- */
  async uploadFile(file: File, key: string): Promise<{ path: string }> {
    await idb.putFile(key, file);
    return { path: `local://${key}` };
  },

  async fileUrl(path: string, _download?: string): Promise<string> {
    const key = path.startsWith('local://') ? path.slice(8) : path;
    const blob = await idb.getFile(key);
    if (!blob) throw new Error('Berkas tidak ditemukan di penyimpanan lokal.');
    return URL.createObjectURL(blob);
  },

  async deleteFile(path: string): Promise<void> {
    const key = path.startsWith('local://') ? path.slice(8) : path;
    await idb.deleteFile(key);
  },

  /* --- demo --- */
  async seedDemo(): Promise<void> {
    const db = readDb();
    if (coll(db, 'projects').some((p) => bool(p.is_demo))) return;
    const userId = currentUserId();
    const stamp = nowIso();

    const make = (extra: Row): Row => ({
      id: uuid(), user_id: userId, favorite: false, archived: false,
      is_demo: true, created_at: stamp, updated_at: stamp, ...extra,
    });

    const p1 = uuid();
    const p2 = uuid();
    const p3 = uuid();
    coll(db, 'projects').push(
      make({ id: p1, name: 'SKAVIS', description: 'Situs pembelajaran Desain Komunikasi Visual untuk kelas X, XI, XII.', status: 'ACTIVE', color: '#6366f1' }),
      make({ id: p2, name: 'MAJARA', description: 'Database dan arsip materi ajar.', status: 'ACTIVE', color: '#0ea5e9' }),
      make({ id: p3, name: 'SMK Jayanegara', description: 'Dokumen administrasi dan kegiatan sekolah.', status: 'PAUSED', color: '#f59e0b' }),
    );

    const pr1 = uuid();
    coll(db, 'prompts').push(
      make({
        id: pr1, project_id: p1, title: 'Website Development Prompt',
        description: 'Prompt untuk membangun halaman situs pembelajaran.',
        prompt_content: 'Kamu adalah frontend developer. Bangun halaman {{nama_halaman}} untuk situs sekolah dengan gaya minimalis, tipografi jelas, dan navigasi sederhana.\n\nKonteks: {{konteks}}',
        negative_prompt: 'jangan gunakan gradien berlebihan, jangan gunakan animasi berat',
        category: 'WEBSITE', ai_model: 'Claude', variables: 'nama_halaman, konteks',
      }),
      make({
        id: uuid(), project_id: p2, title: 'AI Video Prompt',
        description: 'Prompt video pendek untuk materi ajar.',
        prompt_content: 'Buat video sinematik 8 detik: {{adegan}}. Pencahayaan lembut, gerakan kamera lambat, nuansa {{mood}}.',
        negative_prompt: 'teks di dalam gambar, distorsi wajah',
        category: 'VIDEO', ai_model: 'Seedance', variables: 'adegan, mood',
      }),
      make({
        id: uuid(), project_id: p1, title: 'Image Restyle Prompt',
        description: 'Mengubah gaya foto agar konsisten dengan identitas visual sekolah.',
        prompt_content: 'Ubah gaya foto berikut menjadi {{gaya}}. Pertahankan komposisi dan subjek.',
        negative_prompt: 'wajah berubah, proporsi aneh',
        category: 'IMAGE', ai_model: 'Gemini', variables: 'gaya, palet',
      }),
    );

    coll(db, 'prompt_versions').push(
      make({ prompt_id: pr1, version_number: 1, label: 'Versi awal', content: 'Buat halaman web sekolah yang rapi dan modern.', negative_prompt: '', note: 'Percobaan pertama.', is_current: false }),
      make({ prompt_id: pr1, version_number: 2, label: 'Tambah konteks', content: 'Buat halaman web sekolah untuk jurusan DKV, gaya minimalis, tipografi jelas.', negative_prompt: '', note: 'Menambahkan jurusan.', is_current: false }),
      make({ prompt_id: pr1, version_number: 3, label: 'Versi terkini', content: 'Kamu adalah frontend developer. Bangun halaman {{nama_halaman}} untuk situs sekolah dengan gaya minimalis, tipografi jelas, dan navigasi sederhana.', negative_prompt: 'jangan gunakan gradien berlebihan', note: 'Menambahkan variabel.', is_current: true }),
    );

    coll(db, 'notes').push(
      make({ project_id: p1, title: 'Supabase Setup', content: '## Langkah setup\n\n1. Buat project di Supabase.\n2. Jalankan `supabase/schema.sql`.\n3. Isi `.env` dengan URL dan anon key.' }),
      make({ project_id: p1, title: 'Astro Deployment', content: '## Deploy ke Vercel\n\n- Framework preset: **Astro**\n- Build command: `npm run build`\n- Output directory: `dist`' }),
      make({ project_id: p2, title: 'Website Ideas', content: '- Halaman galeri karya murid\n- Bank soal latihan\n- Modul ajar yang bisa diunduh' }),
    );

    coll(db, 'links').push(
      make({ project_id: p1, title: 'Astro', url: 'https://astro.build', description: 'Framework situs yang dipakai proyek ini.', category: 'DEVELOPMENT' }),
      make({ project_id: p1, title: 'Supabase', url: 'https://supabase.com', description: 'Database, Auth, dan Storage.', category: 'DEVELOPMENT' }),
      make({ project_id: p1, title: 'Vercel', url: 'https://vercel.com', description: 'Hosting untuk deploy.', category: 'DEVELOPMENT' }),
    );

    coll(db, 'accounts').push(
      make({ project_id: p1, service: 'Supabase', account_name: 'SKAVIS Supabase', email: 'skavis.school@gmail.com', username: 'skavis', purpose: 'Database dan authentication situs.', recovery_email: 'guru.dkv@gmail.com', login_url: 'https://supabase.com/dashboard', notes: 'Gunakan akun Google khusus proyek.', category: 'GOOGLE' }),
      make({ project_id: p2, service: 'Vercel', account_name: 'MAJARA Hosting', email: 'majara.deploy@gmail.com', username: 'majara', purpose: 'Hosting situs dan preview.', recovery_email: 'guru.dkv@gmail.com', login_url: 'https://vercel.com/login', notes: '', category: 'HOSTING' }),
    );

    const due = new Date();
    due.setDate(due.getDate() + 3);
    coll(db, 'tasks').push(
      make({ project_id: p1, title: 'Jalankan schema.sql di Supabase', description: 'Sekali saja saat setup awal.', status: 'DONE', priority: 'HIGH', due_date: null }),
      make({ project_id: p1, title: 'Isi environment variable di Vercel', description: 'PUBLIC_SUPABASE_URL dan PUBLIC_SUPABASE_ANON_KEY.', status: 'TODO', priority: 'HIGH', due_date: due.toISOString().slice(0, 10) }),
      make({ project_id: p2, title: 'Kumpulkan materi ajar semester depan', description: '', status: 'IN_PROGRESS', priority: 'MEDIUM', due_date: null }),
    );

    coll(db, 'snippets').push(
      make({ project_id: p1, title: 'Deploy ke Vercel', content: 'npm run build\nvercel --prod', language: 'bash' }),
      make({ project_id: p1, title: 'Query favorit', content: 'select id, title, category\nfrom prompts\nwhere favorite = true\norder by updated_at desc;', language: 'sql' }),
      make({ project_id: p1, title: 'Environment template', content: 'PUBLIC_SUPABASE_URL=\nPUBLIC_SUPABASE_ANON_KEY=', language: 'env' }),
    );

    for (const name of ['skavis', 'astro', 'supabase', 'ai', 'coding']) ensureTagRow(db, name);
    const skavisTag = coll(db, 'tags').find((t) => str(t.name) === 'skavis');
    const codingTag = coll(db, 'tags').find((t) => str(t.name) === 'coding');
    for (const tag of [skavisTag, codingTag]) {
      if (tag) {
        coll(db, 'tag_relations').push({
          id: uuid(), user_id: userId, tag_id: str(tag.id),
          item_type: 'prompt', item_id: pr1, created_at: stamp,
        } as Row);
      }
    }

    pushActivity(db, 'seed', 'system', null, 'Data demo dimuat');
    writeDb(db);
  },

  async deleteDemo(): Promise<void> {
    const db = readDb();
    for (const resource of CONTENT_RESOURCES) {
      db.collections[resource] = coll(db, resource).filter((r) => !bool(r.is_demo));
    }
    // Bersihkan versi prompt yatim dan relasi tag yatim.
    const promptIds = new Set(coll(db, 'prompts').map((p) => str(p.id)));
    db.collections.prompt_versions = coll(db, 'prompt_versions').filter((v) =>
      promptIds.has(str(v.prompt_id)),
    );
    const itemIds = new Set<string>();
    for (const resource of CONTENT_RESOURCES) {
      for (const row of coll(db, resource)) itemIds.add(str(row.id));
    }
    db.collections.tag_relations = coll(db, 'tag_relations').filter((rel) =>
      itemIds.has(str(rel.item_id)),
    );
    // Rahasia milik account demo ikut terhapus supaya tidak menggantung.
    db.collections.secrets = coll(db, 'secrets').filter((s) => itemIds.has(str(s.account_id)));
    pushActivity(db, 'delete', 'system', null, 'Data demo dihapus');
    writeDb(db);
  },

  /* --- export / import --- */
  async exportAll(): Promise<BackupPayload> {
    const db = readDb();
    return {
      app: 'PERSONAL OS',
      version: 1,
      exported_at: nowIso(),
      mode: 'local',
      vault: await this.getVaultMeta(),
      data: {
        projects: coll(db, 'projects'),
        prompts: coll(db, 'prompts'),
        prompt_versions: coll(db, 'prompt_versions'),
        documents: coll(db, 'documents'),
        notes: coll(db, 'notes'),
        links: coll(db, 'links'),
        accounts: coll(db, 'accounts'),
        tasks: coll(db, 'tasks'),
        snippets: coll(db, 'snippets'),
        tags: coll(db, 'tags'),
        tag_relations: coll(db, 'tag_relations'),
        secrets: coll(db, 'secrets'),
      },
    };
  },

  async importAll(payload: BackupPayload): Promise<{ imported: number }> {
    const db = readDb();
    const data = payload.data ?? {};
    let imported = 0;
    const collections: Collection[] = [
      'projects', 'prompts', 'prompt_versions', 'documents', 'notes',
      'links', 'accounts', 'tasks', 'snippets', 'tags', 'tag_relations', 'secrets',
    ];
    for (const name of collections) {
      const incoming = data[name];
      if (!Array.isArray(incoming)) continue;
      const rows = coll(db, name);
      const existing = new Set(rows.map((r) => str(r.id)));
      for (const raw of incoming) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Row;
        const id = str(row.id) || uuid();
        if (existing.has(id)) continue;
        rows.push({ ...row, id, user_id: currentUserId() });
        existing.add(id);
        imported += 1;
      }
    }
    pushActivity(db, 'import', 'system', null, `${imported} data dipulihkan dari backup`);
    writeDb(db);

    // Pulihkan pengaturan vault kalau di perangkat ini belum ada, supaya
    // password terenkripsi dari backup tetap bisa dibuka dengan master password.
    if (payload.vault && !(await this.getVaultMeta())) {
      await this.setVaultMeta(payload.vault);
    }

    return { imported };
  },

  async wipeAll(): Promise<void> {
    writeDb(emptyDb());
    await idb.clearFiles();
    localStorage.removeItem(VAULT_KEY);
  },
};
