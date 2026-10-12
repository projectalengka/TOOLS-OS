import type {
  AccountCategory, DocumentCategory, LinkCategory, PromptCategory,
  ProjectStatus, ResourceName, TagItemType, TaskPriority, TaskStatus,
} from './types';

export type FieldType =
  | 'text' | 'textarea' | 'code' | 'markdown' | 'select' | 'date'
  | 'url' | 'email' | 'color' | 'tags' | 'project' | 'secret';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: readonly string[];
  required?: boolean;
  help?: string;
  /** lebar penuh di form dua kolom */
  full?: boolean;
  rows?: number;
  /** tampilkan tombol "Salin" di kartu daftar untuk field ini */
  copyable?: boolean;
  /** tampilkan di kartu daftar (ringkas) */
  onCard?: boolean;
  /**
   * Field yang nilainya tidak disimpan sebagai kolom tabel, melainkan
   * ditangani terpisah. Dipakai untuk field bertipe 'secret', yang isinya
   * dienkripsi lebih dulu sebelum masuk tabel `secrets`.
   */
  virtual?: boolean;
}

export interface ResourceDef {
  name: ResourceName;
  /** jenis item untuk relasi tag */
  tagType: TagItemType;
  singular: string;
  plural: string;
  title: string;
  subtitle: string;
  icon: string;
  route: string;
  searchPlaceholder: string;
  emptyTitle: string;
  emptyBody: string;
  fields: FieldDef[];
  /** urutan field yang tampil sebagai ringkasan di kartu */
  cardFields: string[];
  categoryField?: string;
  hasProject: boolean;
  hasTags: boolean;
  copyField?: string;
}

/* ---------------------------------------------------------------- kategori */

export const PROJECT_STATUS: readonly ProjectStatus[] = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];
export const PROMPT_CATEGORIES: readonly PromptCategory[] =
  ['IMAGE', 'VIDEO', 'CODING', 'WEBSITE', 'WRITING', 'DESIGN', 'EDUCATION', 'OTHER'];
export const DOCUMENT_CATEGORIES: readonly DocumentCategory[] =
  ['EDUCATION', 'WORK', 'DEVELOPMENT', 'ADMINISTRATION', 'REFERENCE', 'OTHER'];
export const LINK_CATEGORIES: readonly LinkCategory[] =
  ['AI', 'DEVELOPMENT', 'EDUCATION', 'WORK', 'REFERENCE', 'OTHER'];
export const ACCOUNT_CATEGORIES: readonly AccountCategory[] =
  ['GOOGLE', 'AI', 'DEVELOPMENT', 'HOSTING', 'SOCIAL', 'EDUCATION', 'OTHER'];
export const TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

export const SNIPPET_LANGUAGES: readonly string[] =
  ['text', 'bash', 'sql', 'json', 'env', 'typescript', 'javascript', 'css', 'html', 'markdown', 'astro'];

/** Label Bahasa Indonesia untuk nilai enum. Nilai di database tetap Inggris. */
export const LABELS: Record<string, string> = {
  // status project
  ACTIVE: 'Aktif',
  PAUSED: 'Ditunda',
  COMPLETED: 'Selesai',
  ARCHIVED: 'Diarsipkan',
  // kategori
  IMAGE: 'Gambar',
  VIDEO: 'Video',
  CODING: 'Coding',
  WEBSITE: 'Website',
  WRITING: 'Penulisan',
  DESIGN: 'Desain',
  EDUCATION: 'Pendidikan',
  OTHER: 'Lainnya',
  WORK: 'Pekerjaan',
  DEVELOPMENT: 'Development',
  ADMINISTRATION: 'Administrasi',
  REFERENCE: 'Referensi',
  AI: 'AI',
  GOOGLE: 'Google',
  HOSTING: 'Hosting',
  SOCIAL: 'Sosial',
  // tugas
  TODO: 'Belum Dikerjakan',
  IN_PROGRESS: 'Sedang Dikerjakan',
  DONE: 'Selesai',
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  // jenis item
  project: 'Project',
  prompt: 'Prompt',
  document: 'Dokumen',
  note: 'Catatan',
  link: 'Link',
  account: 'Account',
  task: 'Tugas',
  snippet: 'Snippet',
};

export function label(value: string | null | undefined): string {
  if (!value) return '';
  return LABELS[value] ?? value;
}

/* ---------------------------------------------------------------- resource */

const projectField: FieldDef = {
  name: 'project_id', label: 'Project', type: 'project', placeholder: 'Tanpa project',
};

export const RESOURCES: Record<ResourceName, ResourceDef> = {
  projects: {
    name: 'projects',
    tagType: 'project',
    singular: 'Project',
    plural: 'Project',
    title: 'Project',
    subtitle: 'Pusat organisasi semua data kamu.',
    icon: 'folder',
    route: '/project',
    searchPlaceholder: 'Cari project...',
    emptyTitle: 'Belum ada project.',
    emptyBody: 'Buat project pertama untuk mulai mengelompokkan prompt, dokumen, dan catatan.',
    categoryField: 'status',
    hasProject: false,
    hasTags: true,
    fields: [
      { name: 'name', label: 'Nama Project', type: 'text', required: true, placeholder: 'Contoh: SKAVIS', full: true },
      { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 3, full: true, placeholder: 'Project ini tentang apa?' },
      { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUS },
      { name: 'color', label: 'Warna Aksen', type: 'color' },
    ],
    cardFields: ['description', 'status'],
  },

  prompts: {
    name: 'prompts',
    tagType: 'prompt',
    singular: 'Prompt',
    plural: 'Prompt',
    title: 'Prompt',
    subtitle: 'Perpustakaan prompt yang siap dipakai ulang.',
    icon: 'sparkles',
    route: '/prompt',
    searchPlaceholder: 'Cari prompt...',
    emptyTitle: 'Belum ada prompt.',
    emptyBody: 'Simpan prompt pertamamu supaya tidak perlu menulis ulang dari nol.',
    categoryField: 'category',
    hasProject: true,
    hasTags: true,
    copyField: 'prompt_content',
    fields: [
      { name: 'title', label: 'Judul', type: 'text', required: true, placeholder: 'Contoh: Website Development Prompt', full: true },
      { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 2, full: true, placeholder: 'Prompt ini untuk apa?' },
      { name: 'prompt_content', label: 'Isi Prompt', type: 'code', rows: 8, required: true, full: true, copyable: true, placeholder: 'Tulis prompt di sini...' },
      { name: 'negative_prompt', label: 'Negative Prompt', type: 'code', rows: 3, full: true, placeholder: 'Hal yang tidak diinginkan (opsional)' },
      { name: 'category', label: 'Kategori', type: 'select', options: PROMPT_CATEGORIES },
      { name: 'ai_model', label: 'AI Model', type: 'text', placeholder: 'GPT / Claude / Gemini / DeepSeek' },
      { name: 'variables', label: 'Variabel', type: 'text', placeholder: 'nama_halaman, konteks', full: true, help: 'Pisahkan dengan koma. Tulis variabel di prompt sebagai {{nama_variabel}}.' },
      projectField,
    ],
    cardFields: ['description', 'category', 'ai_model'],
  },

  documents: {
    name: 'documents',
    tagType: 'document',
    singular: 'Dokumen',
    plural: 'Dokumen',
    title: 'Dokumen',
    subtitle: 'Unggah dan simpan berkas penting di satu tempat.',
    icon: 'file',
    route: '/dokumen',
    searchPlaceholder: 'Cari dokumen...',
    emptyTitle: 'Belum ada dokumen.',
    emptyBody: 'Unggah PDF, DOCX, XLSX, CSV, TXT, atau MD untuk mulai mengarsipkan berkas.',
    categoryField: 'category',
    hasProject: true,
    hasTags: true,
    fields: [
      { name: 'title', label: 'Judul', type: 'text', required: true, placeholder: 'Contoh: Supabase Setup', full: true },
      { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 2, full: true },
      { name: 'category', label: 'Kategori', type: 'select', options: DOCUMENT_CATEGORIES },
      projectField,
    ],
    cardFields: ['description', 'category', 'file_type'],
  },

  notes: {
    name: 'notes',
    tagType: 'note',
    singular: 'Catatan',
    plural: 'Catatan',
    title: 'Catatan',
    subtitle: 'Menangkap informasi dengan cepat sebelum lupa.',
    icon: 'note',
    route: '/catatan',
    searchPlaceholder: 'Cari catatan...',
    emptyTitle: 'Belum ada catatan.',
    emptyBody: 'Buat catatan pertama. Satu kalimat pun sudah berguna.',
    hasProject: true,
    hasTags: true,
    copyField: 'content',
    fields: [
      { name: 'title', label: 'Judul', type: 'text', placeholder: 'Catatan tanpa judul', full: true },
      { name: 'content', label: 'Isi Catatan', type: 'markdown', rows: 12, full: true, copyable: true, placeholder: 'Tulis apa saja. Markdown didukung: **tebal**, *miring*, `kode`, # judul, - daftar.' },
      projectField,
    ],
    cardFields: ['content'],
  },

  links: {
    name: 'links',
    tagType: 'link',
    singular: 'Link',
    plural: 'Link',
    title: 'Link',
    subtitle: 'Simpan tautan penting supaya tidak hilang di riwayat browser.',
    icon: 'link',
    route: '/link',
    searchPlaceholder: 'Cari link...',
    emptyTitle: 'Belum ada link.',
    emptyBody: 'Tambahkan link pertama, misalnya dokumentasi atau dashboard layanan.',
    categoryField: 'category',
    hasProject: true,
    hasTags: true,
    fields: [
      { name: 'title', label: 'Judul', type: 'text', required: true, placeholder: 'Contoh: Supabase Dashboard', full: true },
      { name: 'url', label: 'URL', type: 'url', required: true, placeholder: 'https://supabase.com', full: true },
      { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 2, full: true },
      { name: 'category', label: 'Kategori', type: 'select', options: LINK_CATEGORIES },
      projectField,
    ],
    cardFields: ['url', 'description', 'category'],
  },

  accounts: {
    name: 'accounts',
    tagType: 'account',
    singular: 'Account',
    plural: 'Accounts',
    title: 'Accounts',
    subtitle: 'Semua email dan akunmu, lengkap dengan password yang terenkripsi.',
    icon: 'shield',
    route: '/akun',
    searchPlaceholder: 'Cari account...',
    emptyTitle: 'Belum ada account.',
    emptyBody: 'Catat email mana yang dipakai untuk layanan apa, supaya tidak tertukar dan tidak lupa passwordnya.',
    categoryField: 'category',
    hasProject: true,
    hasTags: true,
    fields: [
      { name: 'service', label: 'Layanan', type: 'text', required: true, placeholder: 'Contoh: Google / Gmail', full: true },
      { name: 'account_name', label: 'Nama Account', type: 'text', placeholder: 'Contoh: Gmail Utama' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'nama@gmail.com' },
      { name: 'username', label: 'Username', type: 'text' },
      { name: 'purpose', label: 'Kegunaan', type: 'textarea', rows: 2, full: true, placeholder: 'Untuk apa akun ini dipakai?' },
      { name: 'recovery_email', label: 'Email Pemulihan', type: 'email' },
      { name: 'login_url', label: 'URL Login', type: 'url', placeholder: 'https://...' },
      { name: 'category', label: 'Kategori', type: 'select', options: ACCOUNT_CATEGORIES },
      { name: 'notes', label: 'Catatan', type: 'textarea', rows: 2, full: true },
      {
        name: 'secret_password',
        label: 'Password',
        type: 'secret',
        virtual: true,
        full: true,
        help: 'Dienkripsi di browser sebelum disimpan. Server tidak pernah menerima bentuk aslinya.',
      },
      {
        name: 'secret_note',
        label: 'Catatan Rahasia',
        type: 'secret',
        virtual: true,
        full: true,
        help: 'Untuk kode pemulihan atau catatan sensitif lain. Ikut terenkripsi.',
      },
      projectField,
    ],
    cardFields: ['email', 'username', 'purpose', 'category'],
  },

  tasks: {
    name: 'tasks',
    tagType: 'task',
    singular: 'Tugas',
    plural: 'Tugas',
    title: 'Tugas',
    subtitle: 'Daftar tugas ringan, bukan sistem manajemen project.',
    icon: 'check',
    route: '/tugas',
    searchPlaceholder: 'Cari tugas...',
    emptyTitle: 'Belum ada tugas.',
    emptyBody: 'Tambahkan tugas pertama supaya tidak ada yang terlewat.',
    categoryField: 'status',
    hasProject: true,
    hasTags: true,
    fields: [
      { name: 'title', label: 'Judul Tugas', type: 'text', required: true, placeholder: 'Contoh: Isi environment variable di Vercel', full: true },
      { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 3, full: true },
      { name: 'status', label: 'Status', type: 'select', options: TASK_STATUSES },
      { name: 'priority', label: 'Prioritas', type: 'select', options: TASK_PRIORITIES },
      { name: 'due_date', label: 'Tenggat', type: 'date' },
      projectField,
    ],
    cardFields: ['description', 'status', 'priority', 'due_date'],
  },

  snippets: {
    name: 'snippets',
    tagType: 'snippet',
    singular: 'Snippet',
    plural: 'Snippet',
    title: 'Snippet',
    subtitle: 'Potongan teks dan kode yang sering dipakai.',
    icon: 'code',
    route: '/snippet',
    searchPlaceholder: 'Cari snippet...',
    emptyTitle: 'Belum ada snippet.',
    emptyBody: 'Simpan perintah terminal, query SQL, atau potongan kode favoritmu.',
    hasProject: true,
    hasTags: true,
    copyField: 'content',
    fields: [
      { name: 'title', label: 'Judul', type: 'text', required: true, placeholder: 'Contoh: Deploy ke Vercel', full: true },
      { name: 'content', label: 'Isi', type: 'code', rows: 10, required: true, full: true, copyable: true, placeholder: 'npm run build' },
      { name: 'language', label: 'Jenis', type: 'select', options: SNIPPET_LANGUAGES },
      projectField,
    ],
    cardFields: ['content', 'language'],
  },
};

export const RESOURCE_LIST: readonly ResourceDef[] = [
  RESOURCES.projects, RESOURCES.prompts, RESOURCES.documents, RESOURCES.notes,
  RESOURCES.links, RESOURCES.accounts, RESOURCES.tasks, RESOURCES.snippets,
];

export function resourceByRoute(route: string): ResourceDef | undefined {
  return RESOURCE_LIST.find((r) => r.route === route);
}
