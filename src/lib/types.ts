/**
 * Tipe data PERSONAL OS.
 * Nama tipe sengaja dibuat sama dengan nama tabel di PostgreSQL supaya
 * pemetaan antara frontend dan database tetap mudah dilacak.
 */

export type UUID = string;
export type ISODate = string;

/** Kolom yang dimiliki semua tabel data. */
export interface BaseRow {
  id: UUID;
  user_id: UUID;
  favorite: boolean;
  archived: boolean;
  is_demo?: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export type ProjectStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type PromptCategory =
  | 'IMAGE' | 'VIDEO' | 'CODING' | 'WEBSITE' | 'WRITING' | 'DESIGN' | 'EDUCATION' | 'OTHER';
export type DocumentCategory =
  | 'EDUCATION' | 'WORK' | 'DEVELOPMENT' | 'ADMINISTRATION' | 'REFERENCE' | 'OTHER';
export type LinkCategory = 'AI' | 'DEVELOPMENT' | 'EDUCATION' | 'WORK' | 'REFERENCE' | 'OTHER';
export type AccountCategory =
  | 'GOOGLE' | 'AI' | 'DEVELOPMENT' | 'HOSTING' | 'SOCIAL' | 'EDUCATION' | 'OTHER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TagItemType =
  | 'project' | 'prompt' | 'document' | 'note' | 'link' | 'account' | 'task' | 'snippet';

export interface Project extends BaseRow {
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  /** Disembunyikan dari tampilan normal; hanya muncul di Ruang Pribadi. */
  hidden: boolean;
}

export interface Prompt extends BaseRow {
  project_id: UUID | null;
  title: string;
  description: string;
  prompt_content: string;
  negative_prompt: string;
  category: PromptCategory;
  ai_model: string;
  variables: string;
  /** Disembunyikan dari tampilan normal; hanya muncul di Ruang Pribadi. */
  hidden: boolean;
}

export interface PromptVersion {
  id: UUID;
  user_id: UUID;
  prompt_id: UUID;
  version_number: number;
  label: string;
  content: string;
  negative_prompt: string;
  note: string;
  is_current: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface DocumentItem extends BaseRow {
  project_id: UUID | null;
  title: string;
  description: string;
  file_path: string;
  file_type: string;
  file_size: number;
  category: DocumentCategory;
}

export interface Note extends BaseRow {
  project_id: UUID | null;
  title: string;
  content: string;
}

export interface LinkItem extends BaseRow {
  project_id: UUID | null;
  title: string;
  url: string;
  description: string;
  category: LinkCategory;
}

export interface Account extends BaseRow {
  project_id: UUID | null;
  service: string;
  account_name: string;
  email: string;
  username: string;
  purpose: string;
  recovery_email: string;
  login_url: string;
  notes: string;
  category: AccountCategory;
}

export interface Task extends BaseRow {
  project_id: UUID | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
}

export interface Snippet extends BaseRow {
  project_id: UUID | null;
  title: string;
  content: string;
  language: string;
}

export interface Tag {
  id: UUID;
  user_id: UUID;
  name: string;
  created_at: ISODate;
}

/**
 * Rahasia terenkripsi milik satu account.
 *
 * `ciphertext` dan `iv` sudah berupa hasil enkripsi AES-GCM di browser.
 * Server tidak pernah menerima bentuk aslinya. Tanpa master password,
 * isi kolom-kolom ini tidak berguna.
 */
export interface Secret {
  id: UUID;
  user_id: UUID;
  account_id: UUID;
  /** Nama rahasia, misalnya "Password" atau "Catatan Rahasia". */
  label: string;
  ciphertext: string;
  iv: string;
  created_at: ISODate;
  updated_at: ISODate;
}

/** Salt dan pemeriksa master password. Keduanya bukan rahasia. */
export interface VaultMeta {
  salt: string;
  check: string;
}

export interface TagRelation {
  id: UUID;
  user_id: UUID;
  tag_id: UUID;
  item_type: TagItemType;
  item_id: UUID;
  created_at: ISODate;
}

export interface ActivityLog {
  id: UUID;
  user_id: UUID;
  action: string;
  item_type: string;
  item_id: UUID | null;
  item_title: string;
  created_at: ISODate;
}

/** Nama resource = nama tabel. Dipakai untuk CRUD generik. */
export type ResourceName =
  | 'projects' | 'prompts' | 'documents' | 'notes'
  | 'links' | 'accounts' | 'tasks' | 'snippets';

export interface ResourceMap {
  projects: Project;
  prompts: Prompt;
  documents: DocumentItem;
  notes: Note;
  links: LinkItem;
  accounts: Account;
  tasks: Task;
  snippets: Snippet;
}

export type AnyRow = ResourceMap[ResourceName];

/** Hasil pencarian global (satu bentuk untuk semua jenis data). */
export interface SearchHit {
  item_type: string;
  item_id: UUID;
  title: string;
  subtitle: string;
  snippet: string;
  project_id: UUID | null;
  favorite: boolean;
  archived: boolean;
  updated_at: ISODate;
  rank?: number;
}

export interface Session {
  userId: UUID;
  email: string;
  name: string;
}

export interface ListOptions {
  projectId?: UUID;
  favorite?: boolean;
  /** undefined = hanya data aktif; true = hanya arsip; null = keduanya */
  archived?: boolean | null;
  status?: string;
  category?: string;
  tagId?: UUID;
  /** teks bebas untuk difilter di kolom judul/konten */
  search?: string;
  orderBy?: 'updated_at' | 'created_at' | 'title' | 'due_date';
  ascending?: boolean;
  limit?: number;
  /**
   * Data yang disembunyikan (Ruang Pribadi) tidak ikut terdaftar secara default.
   * Sengaja begitu supaya aman: halaman biasa tidak perlu ingat memfilternya.
   */
  includeHidden?: boolean;
  /** Hanya ambil yang disembunyikan — dipakai halaman Ruang Pribadi. */
  hiddenOnly?: boolean;
}

/** Resource yang punya kolom `hidden` (Ruang Pribadi). */
export const HIDEABLE_RESOURCES = ['projects', 'prompts'] as const;

export function isHideable(resource: string): boolean {
  return (HIDEABLE_RESOURCES as readonly string[]).includes(resource);
}

export type BackupPayload = {
  app: 'PERSONAL OS';
  version: number;
  exported_at: ISODate;
  mode: 'supabase' | 'local';
  /**
   * Salt dan pemeriksa master password. Ikut disertakan supaya password
   * terenkripsi di dalam backup masih bisa dibuka setelah dipulihkan di
   * perangkat atau browser lain. Keduanya bukan rahasia — tanpa master
   * password, keduanya tidak berguna.
   */
  vault?: VaultMeta | null;
  data: Record<string, unknown[]>;
};
