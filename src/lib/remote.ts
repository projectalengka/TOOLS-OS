/**
 * Adapter Supabase.
 *
 * Semua query dijalankan lewat anon key, dan keamanan ditegakkan oleh Row Level
 * Security di PostgreSQL: user hanya bisa membaca/mengubah baris dengan
 * user_id = auth.uid(). Frontend tidak dipakai sebagai lapisan keamanan.
 */

import { getSupabaseClient } from './supabase';
import type {
  ActivityLog, BackupPayload, ListOptions, PromptVersion, ResourceMap,
  ResourceName, SearchHit, Secret, Session, Tag, TagItemType, VaultMeta,
} from './types';
import { RESOURCES } from './resources';

const BUCKET = 'documents';

/** Pesan error mentah dari server diterjemahkan ke Bahasa Indonesia. */
function friendly(raw: string, fallback: string): string {
  const message = raw.toLowerCase();
  if (message.includes('invalid login credentials')) return 'Email atau password salah.';
  if (message.includes('email not confirmed')) return 'Email belum dikonfirmasi. Periksa kotak masuk email kamu.';
  if (message.includes('user already registered')) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (message.includes('password should be at least')) return 'Password minimal 6 karakter.';
  if (message.includes('unable to validate email')) return 'Format email tidak valid.';
  if (message.includes('duplicate key')) return 'Data dengan nama yang sama sudah ada.';
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return 'Kamu tidak punya akses untuk operasi ini.';
  }
  if (message.includes('payload too large') || message.includes('exceeded the maximum')) {
    return 'Ukuran berkas terlalu besar. Maksimal 10 MB.';
  }
  if (message.includes('mime type') || message.includes('invalid mime')) {
    return 'Jenis berkas ini tidak diizinkan.';
  }
  if (message.includes('jwt') || message.includes('token')) return 'Sesi login sudah berakhir. Silakan masuk lagi.';
  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet kamu.';
  }
  if (message.includes('relation') && message.includes('does not exist')) {
    return 'Tabel belum dibuat. Jalankan supabase/schema.sql lebih dulu.';
  }
  if (message.includes('could not find the function')) {
    return 'Fungsi database belum ada. Jalankan supabase/schema.sql lebih dulu.';
  }
  return fallback;
}

function assert<T>(result: { data: T | null; error: { message: string } | null }, fallback: string): T {
  if (result.error) throw new Error(friendly(result.error.message, fallback));
  if (result.data === null) throw new Error(fallback);
  return result.data;
}

function toSession(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null): Session | null {
  if (!user) return null;
  const name = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
  return {
    userId: user.id,
    email: user.email ?? '',
    name: name || (user.email ?? '').split('@')[0] || 'Pengguna',
  };
}

function orderColumn(resource: ResourceName, orderBy: string): string {
  if (resource === 'projects' && orderBy === 'title') return 'name';
  return orderBy;
}

export const remoteAdapter = {
  mode: 'supabase' as const,

  /* ------------------------------------------------------------- auth */
  async getSession(): Promise<Session | null> {
    const { data } = await (await getSupabaseClient()).auth.getSession();
    return toSession(data.session?.user ?? null);
  },

  async signIn(email: string, password: string): Promise<Session> {
    const result = await (await getSupabaseClient()).auth.signInWithPassword({ email, password });
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal masuk. Coba lagi.'));
    const session = toSession(result.data.user);
    if (!session) throw new Error('Gagal masuk. Coba lagi.');
    return session;
  },

  async signUp(email: string, password: string, name: string): Promise<{ session: Session | null; needsConfirm: boolean }> {
    const result = await (await getSupabaseClient()).auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal mendaftar. Coba lagi.'));
    return {
      session: toSession(result.data.user),
      needsConfirm: !result.data.session,
    };
  },

  async signOut(): Promise<void> {
    await (await getSupabaseClient()).auth.signOut();
  },

  /** Mengirim email reset password lewat Supabase Auth. */
  async sendPasswordReset(email: string): Promise<void> {
    const result = await (await getSupabaseClient()).auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/masuk`,
    });
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal mengirim email reset password.'));
  },

  async wipeAll(): Promise<void> {
    throw new Error('Reset total hanya tersedia di Mode Lokal. Di Supabase, hapus data per item.');
  },

  async onAuthChange(callback: (session: Session | null) => void): Promise<() => void> {
    const client = await getSupabaseClient();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      callback(toSession(session?.user ?? null));
    });
    return () => data.subscription.unsubscribe();
  },

  async getProfile(): Promise<{ name: string; email: string; theme: string } | null> {
    const session = await this.getSession();
    if (!session) return null;
    const result = await (await getSupabaseClient()).from('profiles').select('full_name, email, theme').eq('id', session.userId).maybeSingle();
    if (result.error) return { name: session.name, email: session.email, theme: 'system' };
    return {
      name: result.data?.full_name || session.name,
      email: result.data?.email || session.email,
      theme: result.data?.theme || 'system',
    };
  },

  async updateProfile(patch: { full_name?: string; theme?: string }): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    const result = await (await getSupabaseClient()).from('profiles').update(patch).eq('id', session.userId);
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal menyimpan profil.'));
  },

  /* ------------------------------------------------------------- CRUD */
  async list<R extends ResourceName>(resource: R, opts: ListOptions = {}): Promise<ResourceMap[R][]> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');

    let query = (await getSupabaseClient()).from(resource).select('*').eq('user_id', session.userId);

    if (opts.archived === undefined) query = query.eq('archived', false);
    else if (opts.archived === true) query = query.eq('archived', true);

    if (opts.favorite) query = query.eq('favorite', true);
    if (opts.projectId) query = query.eq('project_id', opts.projectId);
    if (opts.status) query = query.eq('status', opts.status);
    if (opts.category) {
      const field = RESOURCES[resource].categoryField;
      if (field) query = query.eq(field, opts.category);
    }
    if (opts.search) {
      const fields = RESOURCES[resource].fields.filter((f) => f.type !== 'select' && f.type !== 'project');
      const parts = fields.map((f) => `${f.name}.ilike.%${opts.search}%`);
      const titleField = resource === 'projects' ? 'name' : 'title';
      if (!fields.some((f) => f.name === titleField)) parts.push(`${titleField}.ilike.%${opts.search}%`);
      query = query.or(parts.join(','));
    }

    query = query.order(orderColumn(resource, opts.orderBy ?? 'updated_at'), {
      ascending: opts.ascending ?? false,
      nullsFirst: false,
    });
    if (opts.limit) query = query.limit(opts.limit);

    const result = await query;
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal memuat data.'));
    return (result.data ?? []) as unknown as ResourceMap[R][];
  },

  async get<R extends ResourceName>(resource: R, id: string): Promise<ResourceMap[R] | null> {
    const result = await (await getSupabaseClient()).from(resource).select('*').eq('id', id).maybeSingle();
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal memuat data.'));
    return (result.data as unknown as ResourceMap[R]) ?? null;
  },

  async create<R extends ResourceName>(resource: R, payload: Partial<ResourceMap[R]>): Promise<ResourceMap[R]> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    const result = await (await getSupabaseClient())
      .from(resource)
      .insert({ ...(payload as Record<string, unknown>), user_id: session.userId })
      .select('*')
      .single();
    return assert(result as { data: ResourceMap[R] | null; error: { message: string } | null }, 'Gagal menyimpan data.');
  },

  async update<R extends ResourceName>(resource: R, id: string, patch: Partial<ResourceMap[R]>): Promise<ResourceMap[R]> {
    const result = await (await getSupabaseClient())
      .from(resource)
      .update(patch as Record<string, unknown>)
      .eq('id', id)
      .select('*')
      .single();
    return assert(result as { data: ResourceMap[R] | null; error: { message: string } | null }, 'Gagal memperbarui data.');
  },

  async remove(resource: ResourceName, id: string): Promise<void> {
    // Hapus berkas Storage dulu supaya tidak meninggalkan file yatim.
    if (resource === 'documents') {
      const doc = await this.get('documents', id);
      if (doc?.file_path) await this.deleteFile(doc.file_path).catch(() => undefined);
    }
    const result = await (await getSupabaseClient()).from(resource).delete().eq('id', id);
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal menghapus data.'));
  },

  async count(resource: ResourceName, opts: { archived?: boolean } = {}): Promise<number> {
    const session = await this.getSession();
    if (!session) return 0;
    let query = (await getSupabaseClient())
      .from(resource)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.userId)
      .eq('archived', opts.archived ?? false);
    const result = await query;
    if (result.error) return 0;
    return result.count ?? 0;
  },

  async countByProject(resource: ResourceName, projectId: string): Promise<number> {
    const result = await (await getSupabaseClient())
      .from(resource)
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('archived', false);
    if (result.error) return 0;
    return result.count ?? 0;
  },

  /* -------------------------------------------------------- pencarian */
  async search(q: string, limit = 12): Promise<SearchHit[]> {
    const result = await (await getSupabaseClient()).rpc('search_all', { q, lim: limit });
    if (result.error) throw new Error(friendly(result.error.message, 'Pencarian gagal dijalankan.'));
    return (result.data ?? []) as SearchHit[];
  },

  /* ------------------------------------------------------------- versi */
  async listVersions(promptId: string): Promise<PromptVersion[]> {
    const result = await (await getSupabaseClient())
      .from('prompt_versions')
      .select('*')
      .eq('prompt_id', promptId)
      .order('version_number', { ascending: false });
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal memuat versi prompt.'));
    return (result.data ?? []) as PromptVersion[];
  },

  async createVersion(
    promptId: string,
    data: { content: string; label?: string; note?: string; negative_prompt?: string },
  ): Promise<PromptVersion> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');

    const existing = await (await getSupabaseClient())
      .from('prompt_versions')
      .select('version_number')
      .eq('prompt_id', promptId)
      .order('version_number', { ascending: false })
      .limit(1);
    const last = (existing.data?.[0] as { version_number?: number } | undefined)?.version_number ?? 0;

    // Tandai semua versi lama bukan lagi versi saat ini.
    await (await getSupabaseClient()).from('prompt_versions').update({ is_current: false }).eq('prompt_id', promptId);

    const result = await (await getSupabaseClient())
      .from('prompt_versions')
      .insert({
        user_id: session.userId,
        prompt_id: promptId,
        version_number: last + 1,
        label: data.label ?? '',
        content: data.content,
        negative_prompt: data.negative_prompt ?? '',
        note: data.note ?? '',
        is_current: true,
      })
      .select('*')
      .single();
    const version = assert(
      result as { data: PromptVersion | null; error: { message: string } | null },
      'Gagal membuat versi baru.',
    );

    await (await getSupabaseClient())
      .from('prompts')
      .update({ prompt_content: data.content, negative_prompt: data.negative_prompt ?? '' })
      .eq('id', promptId);
    return version;
  },

  async updateVersion(id: string, patch: Partial<PromptVersion>): Promise<PromptVersion> {
    const result = await (await getSupabaseClient()).from('prompt_versions').update(patch).eq('id', id).select('*').single();
    return assert(
      result as { data: PromptVersion | null; error: { message: string } | null },
      'Gagal memperbarui versi.',
    );
  },

  async deleteVersion(id: string): Promise<void> {
    const result = await (await getSupabaseClient()).from('prompt_versions').delete().eq('id', id);
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal menghapus versi.'));
  },

  async setCurrentVersion(promptId: string, versionId: string): Promise<void> {
    await (await getSupabaseClient()).from('prompt_versions').update({ is_current: false }).eq('prompt_id', promptId);
    const result = await (await getSupabaseClient()).from('prompt_versions').update({ is_current: true }).eq('id', versionId).select('*').single();
    const version = assert(
      result as { data: PromptVersion | null; error: { message: string } | null },
      'Gagal menetapkan versi.',
    );
    await (await getSupabaseClient())
      .from('prompts')
      .update({ prompt_content: version.content, negative_prompt: version.negative_prompt })
      .eq('id', promptId);
  },

  /* -------------------------------------------------------------- tag */
  async listTags(): Promise<Tag[]> {
    const result = await (await getSupabaseClient()).from('tags').select('*').order('name', { ascending: true });
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal memuat tag.'));
    return (result.data ?? []) as Tag[];
  },

  async tagsFor(itemType: TagItemType, itemId: string): Promise<Tag[]> {
    const relations = await (await getSupabaseClient()).from('tag_relations').select('tag_id').eq('item_type', itemType).eq('item_id', itemId);
    if (relations.error) return [];
    const ids = (relations.data ?? []).map((r) => (r as { tag_id: string }).tag_id);
    if (ids.length === 0) return [];
    const tags = await (await getSupabaseClient()).from('tags').select('*').in('id', ids);
    if (tags.error) return [];
    return (tags.data ?? []) as Tag[];
  },

  async tagsForMany(itemType: TagItemType, itemIds: string[]): Promise<Record<string, Tag[]>> {
    if (itemIds.length === 0) return {};
    const relations = await (await getSupabaseClient())
      .from('tag_relations')
      .select('tag_id, item_id')
      .eq('item_type', itemType)
      .in('item_id', itemIds);
    if (relations.error) return {};
    const rows = (relations.data ?? []) as { tag_id: string; item_id: string }[];
    if (rows.length === 0) return {};
    const tags = await (await getSupabaseClient()).from('tags').select('*').in('id', Array.from(new Set(rows.map((r) => r.tag_id))));
    if (tags.error) return {};
    const byId = new Map((tags.data as Tag[]).map((t) => [t.id, t]));
    const result: Record<string, Tag[]> = {};
    for (const row of rows) {
      const tag = byId.get(row.tag_id);
      if (!tag) continue;
      (result[row.item_id] ??= []).push(tag);
    }
    return result;
  },

  async setTags(itemType: TagItemType, itemId: string, names: string[]): Promise<Tag[]> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    const cleaned = Array.from(
      new Set(names.map((n) => n.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean)),
    );

    await (await getSupabaseClient()).from('tag_relations').delete().eq('item_type', itemType).eq('item_id', itemId);
    if (cleaned.length === 0) return [];

    // upsert tag (unique: user_id + name) supaya tidak ada tag duplikat
    await (await getSupabaseClient())
      .from('tags')
      .upsert(cleaned.map((name) => ({ user_id: session.userId, name })), { onConflict: 'user_id,name', ignoreDuplicates: true });

    const tags = await (await getSupabaseClient()).from('tags').select('*').in('name', cleaned);
    if (tags.error) throw new Error(friendly(tags.error.message, 'Gagal menyimpan tag.'));
    const rows = (tags.data ?? []) as Tag[];

    const relations = rows.map((tag) => ({
      user_id: session.userId,
      tag_id: tag.id,
      item_type: itemType,
      item_id: itemId,
    }));
    if (relations.length > 0) {
      await (await getSupabaseClient()).from('tag_relations').upsert(relations, { onConflict: 'tag_id,item_type,item_id', ignoreDuplicates: true });
    }
    return rows;
  },

  async deleteTag(id: string): Promise<void> {
    const result = await (await getSupabaseClient()).from('tags').delete().eq('id', id);
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal menghapus tag.'));
  },

  /* --------------------------------------------------------- aktivitas */
  async log(action: string, itemType: string, itemId: string | null, title: string): Promise<void> {
    const session = await this.getSession();
    if (!session) return;
    await (await getSupabaseClient()).from('activity_logs').insert({
      user_id: session.userId,
      action,
      item_type: itemType,
      item_id: itemId,
      item_title: title,
    });
  },

  async listActivity(limit = 30): Promise<ActivityLog[]> {
    const result = await (await getSupabaseClient())
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (result.error) return [];
    return (result.data ?? []) as ActivityLog[];
  },

  /* ------------------------------------------------------ rahasia (vault) */
  async listSecrets(accountId?: string): Promise<Secret[]> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    let query = (await getSupabaseClient())
      .from('secrets')
      .select('*')
      .eq('user_id', session.userId)
      .order('label', { ascending: true });
    if (accountId) query = query.eq('account_id', accountId);
    const result = await query;
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal memuat password tersimpan.'));
    return (result.data ?? []) as Secret[];
  },

  async countSecretsByAccount(accountIds: string[]): Promise<Record<string, number>> {
    if (accountIds.length === 0) return {};
    const result = await (await getSupabaseClient())
      .from('secrets')
      .select('account_id')
      .in('account_id', accountIds);
    if (result.error) return {};
    const counts: Record<string, number> = {};
    for (const row of (result.data ?? []) as { account_id: string }[]) {
      counts[row.account_id] = (counts[row.account_id] ?? 0) + 1;
    }
    return counts;
  },

  async createSecret(data: { account_id: string; label: string; ciphertext: string; iv: string }): Promise<Secret> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    const result = await (await getSupabaseClient())
      .from('secrets')
      .insert({ ...data, user_id: session.userId })
      .select('*')
      .single();
    return assert(result as { data: Secret | null; error: { message: string } | null }, 'Gagal menyimpan password.');
  },

  async updateSecret(id: string, patch: Partial<Secret>): Promise<Secret> {
    const result = await (await getSupabaseClient())
      .from('secrets')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    return assert(result as { data: Secret | null; error: { message: string } | null }, 'Gagal memperbarui password.');
  },

  async deleteSecret(id: string): Promise<void> {
    const result = await (await getSupabaseClient()).from('secrets').delete().eq('id', id);
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal menghapus password.'));
  },

  async getVaultMeta(): Promise<VaultMeta | null> {
    const session = await this.getSession();
    if (!session) return null;
    const result = await (await getSupabaseClient())
      .from('profiles')
      .select('vault_salt, vault_check')
      .eq('id', session.userId)
      .maybeSingle();
    if (result.error) return null;
    const row = result.data as { vault_salt?: string | null; vault_check?: string | null } | null;
    if (!row?.vault_salt || !row?.vault_check) return null;
    return { salt: row.vault_salt, check: row.vault_check };
  },

  async setVaultMeta(meta: VaultMeta): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    const result = await (await getSupabaseClient())
      .from('profiles')
      .update({ vault_salt: meta.salt, vault_check: meta.check })
      .eq('id', session.userId);
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal menyimpan pengaturan vault.'));
  },

  /* ------------------------------------------------------------ berkas */
  async uploadFile(file: File, key: string): Promise<{ path: string }> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    const path = `${session.userId}/${key}`;
    const result = await (await getSupabaseClient())
      .storage.from(BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal mengunggah berkas.'));
    return { path };
  },

  async fileUrl(path: string, download?: string): Promise<string> {
    const options = download ? { download } : undefined;
    const result = await (await getSupabaseClient()).storage.from(BUCKET).createSignedUrl(path, 60 * 60, options);
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal membuka berkas.'));
    return result.data.signedUrl;
  },

  async deleteFile(path: string): Promise<void> {
    await (await getSupabaseClient()).storage.from(BUCKET).remove([path]);
  },

  /* --------------------------------------------------------------- demo */
  async seedDemo(): Promise<void> {
    const result = await (await getSupabaseClient()).rpc('seed_demo_data');
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal memuat data demo.'));
  },

  async deleteDemo(): Promise<void> {
    const result = await (await getSupabaseClient()).rpc('delete_demo_data');
    if (result.error) throw new Error(friendly(result.error.message, 'Gagal menghapus data demo.'));
  },

  /* ------------------------------------------------------ export / import */
  async exportAll(): Promise<BackupPayload> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    const tables = [
      'projects', 'prompts', 'prompt_versions', 'documents', 'notes',
      'links', 'accounts', 'tasks', 'snippets', 'tags', 'tag_relations', 'secrets',
    ];
    const data: Record<string, unknown[]> = {};
    for (const table of tables) {
      const result = await (await getSupabaseClient()).from(table).select('*').eq('user_id', session.userId);
      if (result.error) throw new Error(friendly(result.error.message, 'Gagal mengekspor data.'));
      data[table] = (result.data ?? []) as unknown[];
    }
    return {
      app: 'PERSONAL OS',
      version: 1,
      exported_at: new Date().toISOString(),
      mode: 'supabase',
      vault: await this.getVaultMeta(),
      data,
    };
  },

  async importAll(payload: BackupPayload): Promise<{ imported: number }> {
    const session = await this.getSession();
    if (!session) throw new Error('Sesi login sudah berakhir.');
    const data = payload.data ?? {};
    let imported = 0;

    // Urutan penting: project dulu, lalu prompt, lalu versi. Secrets ikut
    // setelah accounts karena bergantung pada account_id.
    const ordered = [
      'projects', 'prompts', 'prompt_versions', 'documents', 'notes',
      'links', 'accounts', 'tasks', 'snippets', 'secrets',
    ];

    for (const table of ordered) {
      const rows = data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const prepared = rows.map((row) => ({
        ...(row as Record<string, unknown>),
        user_id: session.userId,
      }));
      const result = await (await getSupabaseClient()).from(table).upsert(prepared, { onConflict: 'id' });
      if (result.error) throw new Error(friendly(result.error.message, 'Gagal memulihkan data.'));
      imported += prepared.length;
    }

    // Tag dipulihkan berdasarkan nama (bukan id) agar tidak bentrok.
    const backupTags = data.tags;
    const tagMap = new Map<string, string>();
    if (Array.isArray(backupTags) && backupTags.length > 0) {
      const names = backupTags.map((t) => String((t as { name?: unknown }).name ?? '')).filter(Boolean);
      if (names.length > 0) {
        await (await getSupabaseClient())
          .from('tags')
          .upsert(names.map((name) => ({ user_id: session.userId, name })), { onConflict: 'user_id,name', ignoreDuplicates: true });
        const stored = await (await getSupabaseClient()).from('tags').select('id, name').in('name', names);
        for (const row of (stored.data ?? []) as { id: string; name: string }[]) {
          tagMap.set(row.name, row.id);
        }
        for (const raw of backupTags) {
          const old = raw as { id?: string; name?: string };
          if (old.id && old.name && tagMap.has(old.name)) tagMap.set(old.id, tagMap.get(old.name) as string);
        }
      }
    }

    const relations = data.tag_relations;
    if (Array.isArray(relations) && relations.length > 0) {
      const prepared = relations
        .map((raw) => {
          const row = raw as { tag_id?: string; item_type?: string; item_id?: string };
          const tagId = row.tag_id ? tagMap.get(row.tag_id) : undefined;
          if (!tagId || !row.item_type || !row.item_id) return null;
          return {
            user_id: session.userId,
            tag_id: tagId,
            item_type: row.item_type,
            item_id: row.item_id,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      if (prepared.length > 0) {
        await (await getSupabaseClient())
          .from('tag_relations')
          .upsert(prepared, { onConflict: 'tag_id,item_type,item_id', ignoreDuplicates: true });
        imported += prepared.length;
      }
    }

    // Pulihkan pengaturan vault kalau belum ada, supaya password terenkripsi
    // dari backup tetap bisa dibuka dengan master password yang sama.
    if (payload.vault && !(await this.getVaultMeta())) {
      await this.setVaultMeta(payload.vault);
    }

    return { imported };
  },
};
