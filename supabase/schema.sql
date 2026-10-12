-- ============================================================================
-- PERSONAL OS — Skema Database (PostgreSQL / Supabase)
-- ----------------------------------------------------------------------------
-- Jalankan file ini di Supabase SQL Editor (satu kali, urut dari atas ke bawah).
-- Berisi: enum, tabel, index, trigger, Row Level Security, Storage, Full Text
-- Search, dan fungsi demo data.
--
-- Catatan konfigurasi teks: kolom pencarian memakai konfigurasi 'simple'
-- (bukan 'english') karena PostgreSQL belum punya konfigurasi bahasa Indonesia.
-- 'simple' hanya memecah teks menjadi token tanpa stemming, sehingga kata
-- Indonesia tidak dirusak oleh aturan bahasa Inggris.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TIPE ENUM
-- ============================================================================

do $$ begin
  create type project_status as enum ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prompt_category as enum ('IMAGE', 'VIDEO', 'CODING', 'WEBSITE', 'WRITING', 'DESIGN', 'EDUCATION', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type document_category as enum ('EDUCATION', 'WORK', 'DEVELOPMENT', 'ADMINISTRATION', 'REFERENCE', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type link_category as enum ('AI', 'DEVELOPMENT', 'EDUCATION', 'WORK', 'REFERENCE', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_category as enum ('GOOGLE', 'AI', 'DEVELOPMENT', 'HOSTING', 'SOCIAL', 'EDUCATION', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('TODO', 'IN_PROGRESS', 'DONE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('LOW', 'MEDIUM', 'HIGH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tag_item_type as enum ('project', 'prompt', 'document', 'note', 'link', 'account', 'task', 'snippet');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. FUNGSI BANTU
-- ============================================================================

-- Menjaga kolom updated_at selalu terisi otomatis.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Membuat baris profiles otomatis setiap kali user baru mendaftar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================================
-- 3. TABEL
-- ============================================================================
--
-- ⚠️  JEBAKAN: kolom `search_vector` di bawah memakai GENERATED ALWAYS ... STORED.
--     Ekspresi generated column WAJIB immutable. Di PostgreSQL, cast enum ke text
--     TIDAK immutable (fungsi `enum_out` bertanda STABLE), jadi menulis
--     `coalesce(category::text, '')` di dalam generated column akan ditolak:
--
--         ERROR: 42P17: generation expression is not immutable
--
--     Karena itu kolom enum (status, category, priority) sengaja TIDAK ikut ke
--     search_vector. Pencariannya dilakukan di fungsi search_all() bagian bawah
--     lewat perbandingan ilike biasa — di sana cast enum ke text sah.
--
--     Sudah pernah kena saat deploy pertama. Jangan dikembalikan.
-- ============================================================================

-- 3.1 profiles ---------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  avatar_url  text,
  theme       text not null default 'system' check (theme in ('light', 'dark', 'system')),
  -- Untuk vault: salt PBKDF2 dan pemeriksa master password.
  -- Keduanya BUKAN rahasia: salt memang publik, dan vault_check hanya bisa
  -- dibuka dengan master password yang benar.
  vault_salt  text,
  vault_check text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Untuk pemasangan yang sudah ada sebelumnya (idempoten).
alter table public.profiles add column if not exists vault_salt  text;
alter table public.profiles add column if not exists vault_check text;

-- 3.2 projects ---------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  status       project_status not null default 'ACTIVE',
  color        text not null default '#6366f1',
  favorite     boolean not null default false,
  archived     boolean not null default false,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored
);

-- 3.3 prompts ----------------------------------------------------------------
create table if not exists public.prompts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  title           text not null,
  description     text not null default '',
  prompt_content  text not null default '',
  negative_prompt text not null default '',
  category        prompt_category not null default 'OTHER',
  ai_model        text not null default '',
  variables       text not null default '',
  favorite        boolean not null default false,
  archived        boolean not null default false,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(prompt_content, '') || ' ' || coalesce(ai_model, ''))
  ) stored
);

-- 3.4 prompt_versions --------------------------------------------------------
create table if not exists public.prompt_versions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  prompt_id      uuid not null references public.prompts(id) on delete cascade,
  version_number integer not null default 1,
  label          text not null default '',
  content        text not null default '',
  negative_prompt text not null default '',
  note           text not null default '',
  is_current     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 3.5 documents --------------------------------------------------------------
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  title       text not null,
  description text not null default '',
  file_path   text not null default '',
  file_type   text not null default '',
  file_size   bigint not null default 0,
  category    document_category not null default 'OTHER',
  favorite    boolean not null default false,
  archived    boolean not null default false,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(file_type, ''))
  ) stored
);

-- 3.6 notes ------------------------------------------------------------------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title      text not null default '',
  content    text not null default '',
  favorite   boolean not null default false,
  archived   boolean not null default false,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored
);

-- 3.7 links ------------------------------------------------------------------
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  title       text not null,
  url         text not null,
  description text not null default '',
  category    link_category not null default 'OTHER',
  favorite    boolean not null default false,
  archived    boolean not null default false,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(url, ''))
  ) stored
);

-- 3.8 accounts ---------------------------------------------------------------
-- Informasi identitas akun. Tabel ini sendiri tetap TIDAK menyimpan password:
-- password ada di tabel `secrets` dalam bentuk terenkripsi (lihat 3.14).
create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid references public.projects(id) on delete set null,
  service        text not null,
  account_name   text not null default '',
  email          text not null default '',
  username       text not null default '',
  purpose        text not null default '',
  recovery_email text not null default '',
  login_url      text not null default '',
  notes          text not null default '',
  category       account_category not null default 'OTHER',
  favorite       boolean not null default false,
  archived       boolean not null default false,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(service, '') || ' ' || coalesce(account_name, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(username, '') || ' ' || coalesce(purpose, '') || ' ' || coalesce(notes, ''))
  ) stored
);

-- 3.9 tasks ------------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  title       text not null,
  description text not null default '',
  status      task_status not null default 'TODO',
  priority    task_priority not null default 'MEDIUM',
  due_date    date,
  favorite    boolean not null default false,
  archived    boolean not null default false,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored
);

-- 3.10 snippets --------------------------------------------------------------
create table if not exists public.snippets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title      text not null,
  content    text not null default '',
  language   text not null default 'text',
  favorite   boolean not null default false,
  archived   boolean not null default false,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(language, ''))
  ) stored
);

-- 3.11 tags ------------------------------------------------------------------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- 3.12 tag_relations ---------------------------------------------------------
-- Satu item bisa punya banyak tag; satu tag dipakai lintas jenis item.
create table if not exists public.tag_relations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  item_type  tag_item_type not null,
  item_id    uuid not null,
  created_at timestamptz not null default now(),
  unique (tag_id, item_type, item_id)
);

-- 3.13 activity_logs ---------------------------------------------------------
create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null,
  item_type  text not null,
  item_id    uuid,
  item_title text not null default '',
  created_at timestamptz not null default now()
);

-- 3.14 secrets ---------------------------------------------------------------
-- Password dan rahasia lain milik satu account, DALAM BENTUK TERENKRIPSI.
--
-- Enkripsi dilakukan di browser dengan AES-GCM 256. Kunci diturunkan dari
-- master password pengguna memakai PBKDF2 (250.000 iterasi, SHA-256) dengan
-- salt acak yang tersimpan di profiles.vault_salt.
--
-- Artinya: master password TIDAK PERNAH dikirim ke database, dan isi kolom
-- ciphertext tidak berguna bagi siapa pun yang tidak memilikinya — termasuk
-- bagi yang bisa membaca seluruh isi tabel ini.
--
-- `label` sengaja tidak dienkripsi supaya daftar rahasia bisa ditampilkan
-- tanpa membuka vault. Isinya hanya nama jenis, bukan rahasianya.
create table if not exists public.secrets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  label      text not null default 'Password',
  ciphertext text not null,
  iv         text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. INDEX
-- ============================================================================

create index if not exists projects_user_idx        on public.projects (user_id);
create index if not exists projects_status_idx      on public.projects (user_id, status);
create index if not exists projects_updated_idx     on public.projects (user_id, updated_at desc);
create index if not exists projects_favorite_idx    on public.projects (user_id, favorite) where favorite;
create index if not exists projects_archived_idx    on public.projects (user_id, archived);
create index if not exists projects_search_idx      on public.projects using gin (search_vector);

create index if not exists prompts_user_idx         on public.prompts (user_id);
create index if not exists prompts_project_idx      on public.prompts (project_id);
create index if not exists prompts_category_idx     on public.prompts (user_id, category);
create index if not exists prompts_updated_idx      on public.prompts (user_id, updated_at desc);
create index if not exists prompts_created_idx      on public.prompts (user_id, created_at desc);
create index if not exists prompts_favorite_idx     on public.prompts (user_id, favorite) where favorite;
create index if not exists prompts_archived_idx     on public.prompts (user_id, archived);
create index if not exists prompts_search_idx       on public.prompts using gin (search_vector);

create index if not exists prompt_versions_prompt_idx on public.prompt_versions (prompt_id, version_number desc);
create index if not exists prompt_versions_user_idx   on public.prompt_versions (user_id);

create index if not exists documents_user_idx       on public.documents (user_id);
create index if not exists documents_project_idx    on public.documents (project_id);
create index if not exists documents_category_idx   on public.documents (user_id, category);
create index if not exists documents_updated_idx    on public.documents (user_id, updated_at desc);
create index if not exists documents_favorite_idx   on public.documents (user_id, favorite) where favorite;
create index if not exists documents_archived_idx   on public.documents (user_id, archived);
create index if not exists documents_search_idx     on public.documents using gin (search_vector);

create index if not exists notes_user_idx           on public.notes (user_id);
create index if not exists notes_project_idx        on public.notes (project_id);
create index if not exists notes_updated_idx        on public.notes (user_id, updated_at desc);
create index if not exists notes_created_idx        on public.notes (user_id, created_at desc);
create index if not exists notes_favorite_idx       on public.notes (user_id, favorite) where favorite;
create index if not exists notes_archived_idx       on public.notes (user_id, archived);
create index if not exists notes_search_idx         on public.notes using gin (search_vector);

create index if not exists links_user_idx           on public.links (user_id);
create index if not exists links_project_idx        on public.links (project_id);
create index if not exists links_category_idx       on public.links (user_id, category);
create index if not exists links_updated_idx        on public.links (user_id, updated_at desc);
create index if not exists links_favorite_idx       on public.links (user_id, favorite) where favorite;
create index if not exists links_archived_idx       on public.links (user_id, archived);
create index if not exists links_search_idx         on public.links using gin (search_vector);

create index if not exists accounts_user_idx        on public.accounts (user_id);
create index if not exists accounts_project_idx     on public.accounts (project_id);
create index if not exists accounts_category_idx    on public.accounts (user_id, category);
create index if not exists accounts_updated_idx     on public.accounts (user_id, updated_at desc);
create index if not exists accounts_favorite_idx    on public.accounts (user_id, favorite) where favorite;
create index if not exists accounts_archived_idx    on public.accounts (user_id, archived);
create index if not exists accounts_search_idx      on public.accounts using gin (search_vector);

create index if not exists tasks_user_idx           on public.tasks (user_id);
create index if not exists tasks_project_idx        on public.tasks (project_id);
create index if not exists tasks_status_idx         on public.tasks (user_id, status);
create index if not exists tasks_due_idx            on public.tasks (user_id, due_date);
create index if not exists tasks_updated_idx        on public.tasks (user_id, updated_at desc);
create index if not exists tasks_favorite_idx       on public.tasks (user_id, favorite) where favorite;
create index if not exists tasks_archived_idx       on public.tasks (user_id, archived);
create index if not exists tasks_search_idx         on public.tasks using gin (search_vector);

create index if not exists snippets_user_idx        on public.snippets (user_id);
create index if not exists snippets_project_idx     on public.snippets (project_id);
create index if not exists snippets_updated_idx     on public.snippets (user_id, updated_at desc);
create index if not exists snippets_favorite_idx    on public.snippets (user_id, favorite) where favorite;
create index if not exists snippets_archived_idx    on public.snippets (user_id, archived);
create index if not exists snippets_search_idx      on public.snippets using gin (search_vector);

create index if not exists tags_user_idx            on public.tags (user_id);
create index if not exists tag_relations_item_idx   on public.tag_relations (item_type, item_id);
create index if not exists tag_relations_tag_idx    on public.tag_relations (tag_id);
create index if not exists tag_relations_user_idx   on public.tag_relations (user_id);

create index if not exists activity_logs_user_idx   on public.activity_logs (user_id, created_at desc);

create index if not exists secrets_user_idx          on public.secrets (user_id);
create index if not exists secrets_account_idx       on public.secrets (account_id);

-- ============================================================================
-- 5. TRIGGER
-- ============================================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'projects', 'prompts', 'prompt_versions', 'documents',
    'notes', 'links', 'accounts', 'tasks', 'snippets', 'secrets'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Security ditegakkan di database, bukan di frontend. Setiap user hanya bisa
-- membaca dan mengubah baris miliknya sendiri (auth.uid() = user_id).
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.prompts         enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.documents       enable row level security;
alter table public.notes           enable row level security;
alter table public.links           enable row level security;
alter table public.accounts        enable row level security;
alter table public.tasks           enable row level security;
alter table public.snippets        enable row level security;
alter table public.tags            enable row level security;
alter table public.tag_relations   enable row level security;
alter table public.activity_logs   enable row level security;
alter table public.secrets         enable row level security;

-- profiles: user hanya boleh melihat dan mengubah profilnya sendiri.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- Tabel kepemilikan: satu policy "for all" sudah mencakup select/insert/update/delete.
do $$
declare t text;
begin
  foreach t in array array[
    'projects', 'prompts', 'prompt_versions', 'documents',
    'notes', 'links', 'accounts', 'tasks', 'snippets', 'tags',
    'tag_relations', 'activity_logs', 'secrets'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
       using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_owner_all', t);
  end loop;
end $$;

-- ============================================================================
-- 7. STORAGE (dokumen)
-- ----------------------------------------------------------------------------
-- Bucket privat. Path berkas selalu diawali folder <user_id>/ sehingga
-- Storage Policy bisa memisahkan akses antar user.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.ms-excel',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/csv',
    'text/x-markdown',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents_read_own"   on storage.objects;
create policy "documents_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_insert_own" on storage.objects;
create policy "documents_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_update_own" on storage.objects;
create policy "documents_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_delete_own" on storage.objects;
create policy "documents_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 8. GLOBAL SEARCH (PostgreSQL Full Text Search)
-- ----------------------------------------------------------------------------
-- Menggabungkan seluruh jenis data dalam satu hasil terurut.
-- Filter memakai Full Text Search ATAU pencocokan substring (supaya ketikan
-- sebagian seperti "supa" tetap menemukan "Supabase").
-- SECURITY INVOKER: RLS tetap berlaku, jadi user hanya mencari data miliknya.
-- ============================================================================

create or replace function public.search_all(q text, lim int default 8)
returns table (
  item_type  text,
  item_id    uuid,
  title      text,
  subtitle   text,
  snippet    text,
  project_id uuid,
  favorite   boolean,
  archived   boolean,
  updated_at timestamptz,
  rank       real
)
language sql
stable
security invoker
set search_path = public
as $$
  with s as (select nullif(btrim(q), '') as term),
       t as (select websearch_to_tsquery('simple', coalesce((select term from s), '')) as tsq)
  select * from (
    select 'project'::text as item_type, p.id as item_id, p.name as title,
           p.status::text as subtitle, left(coalesce(p.description, ''), 160) as snippet,
           null::uuid as project_id, p.favorite, p.archived, p.updated_at,
           ts_rank(p.search_vector, (select tsq from t)) as rank
    from public.projects p
    where p.user_id = auth.uid()
      and (p.search_vector @@ (select tsq from t)
           or p.name ilike '%' || (select term from s) || '%'
           or coalesce(p.description, '') ilike '%' || (select term from s) || '%'
           or p.status::text ilike '%' || (select term from s) || '%')

    union all
    select 'prompt', x.id, x.title, x.category::text,
           left(coalesce(nullif(x.description, ''), x.prompt_content), 160),
           x.project_id, x.favorite, x.archived, x.updated_at,
           ts_rank(x.search_vector, (select tsq from t))
    from public.prompts x
    where x.user_id = auth.uid()
      and (x.search_vector @@ (select tsq from t)
           or x.title ilike '%' || (select term from s) || '%'
           or coalesce(x.prompt_content, '') ilike '%' || (select term from s) || '%'
           or coalesce(x.description, '') ilike '%' || (select term from s) || '%'
           or x.category::text ilike '%' || (select term from s) || '%')

    union all
    select 'document', x.id, x.title, x.category::text,
           left(coalesce(nullif(x.description, ''), x.file_type), 160),
           x.project_id, x.favorite, x.archived, x.updated_at,
           ts_rank(x.search_vector, (select tsq from t))
    from public.documents x
    where x.user_id = auth.uid()
      and (x.search_vector @@ (select tsq from t)
           or x.title ilike '%' || (select term from s) || '%'
           or coalesce(x.description, '') ilike '%' || (select term from s) || '%'
           or x.category::text ilike '%' || (select term from s) || '%')

    union all
    select 'note', x.id, coalesce(nullif(x.title, ''), 'Catatan tanpa judul'), '',
           left(coalesce(x.content, ''), 160),
           x.project_id, x.favorite, x.archived, x.updated_at,
           ts_rank(x.search_vector, (select tsq from t))
    from public.notes x
    where x.user_id = auth.uid()
      and (x.search_vector @@ (select tsq from t)
           or x.title ilike '%' || (select term from s) || '%'
           or coalesce(x.content, '') ilike '%' || (select term from s) || '%')

    union all
    select 'link', x.id, x.title, x.category::text,
           left(coalesce(nullif(x.description, ''), x.url), 160),
           x.project_id, x.favorite, x.archived, x.updated_at,
           ts_rank(x.search_vector, (select tsq from t))
    from public.links x
    where x.user_id = auth.uid()
      and (x.search_vector @@ (select tsq from t)
           or x.title ilike '%' || (select term from s) || '%'
           or x.url ilike '%' || (select term from s) || '%'
           or coalesce(x.description, '') ilike '%' || (select term from s) || '%'
           or x.category::text ilike '%' || (select term from s) || '%')

    union all
    select 'account', x.id, x.service, coalesce(nullif(x.email, ''), x.username),
           left(coalesce(nullif(x.purpose, ''), x.notes), 160),
           x.project_id, x.favorite, x.archived, x.updated_at,
           ts_rank(x.search_vector, (select tsq from t))
    from public.accounts x
    where x.user_id = auth.uid()
      and (x.search_vector @@ (select tsq from t)
           or x.service ilike '%' || (select term from s) || '%'
           or x.email ilike '%' || (select term from s) || '%'
           or x.account_name ilike '%' || (select term from s) || '%'
           or coalesce(x.notes, '') ilike '%' || (select term from s) || '%')

    union all
    select 'task', x.id, x.title, x.status::text,
           left(coalesce(x.description, ''), 160),
           x.project_id, x.favorite, x.archived, x.updated_at,
           ts_rank(x.search_vector, (select tsq from t))
    from public.tasks x
    where x.user_id = auth.uid()
      and (x.search_vector @@ (select tsq from t)
           or x.title ilike '%' || (select term from s) || '%'
           or coalesce(x.description, '') ilike '%' || (select term from s) || '%')

    union all
    select 'snippet', x.id, x.title, x.language,
           left(coalesce(x.content, ''), 160),
           x.project_id, x.favorite, x.archived, x.updated_at,
           ts_rank(x.search_vector, (select tsq from t))
    from public.snippets x
    where x.user_id = auth.uid()
      and (x.search_vector @@ (select tsq from t)
           or x.title ilike '%' || (select term from s) || '%'
           or coalesce(x.content, '') ilike '%' || (select term from s) || '%')
  ) r
  order by r.rank desc nulls last, r.updated_at desc
  limit lim;
$$;

-- ============================================================================
-- 9. DEMO DATA
-- ----------------------------------------------------------------------------
-- Semua baris demo ditandai is_demo = true sehingga bisa dihapus sekali klik
-- lewat Pengaturan > Data Demo > Hapus Data Demo.
-- ============================================================================

create or replace function public.seed_demo_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p_skavis uuid;
  p_majara uuid;
  p_smk uuid;
  pr_web uuid;
  pr_video uuid;
  pr_image uuid;
begin
  if uid is null then
    raise exception 'Harus login untuk memuat data demo.';
  end if;

  if exists (select 1 from public.projects where user_id = uid and is_demo) then
    return; -- sudah ada, tidak dobel
  end if;

  insert into public.projects (user_id, name, description, status, color, is_demo)
    values (uid, 'SKAVIS', 'Situs pembelajaran Desain Komunikasi Visual untuk kelas X, XI, XII.', 'ACTIVE', '#6366f1', true)
    returning id into p_skavis;

  insert into public.projects (user_id, name, description, status, color, is_demo)
    values (uid, 'MAJARA', 'Database dan arsip materi ajar.', 'ACTIVE', '#0ea5e9', true)
    returning id into p_majara;

  insert into public.projects (user_id, name, description, status, color, is_demo)
    values (uid, 'SMK Jayanegara', 'Dokumen administrasi dan kegiatan sekolah.', 'PAUSED', '#f59e0b', true)
    returning id into p_smk;

  insert into public.prompts (user_id, project_id, title, description, prompt_content, negative_prompt, category, ai_model, variables, is_demo)
    values (uid, p_skavis, 'Website Development Prompt',
      'Prompt untuk membangun halaman situs pembelajaran.',
      E'Kamu adalah frontend developer. Bangun halaman {{nama_halaman}} untuk situs sekolah dengan gaya minimalis, tipografi jelas, dan navigasi sederhana.\n\nKonteks: {{konteks}}\nTarget pengguna: murid SMK jurusan DKV.',
      'jangan gunakan gradien berlebihan, jangan gunakan animasi berat',
      'WEBSITE', 'Claude', 'nama_halaman, konteks', true)
    returning id into pr_web;

  insert into public.prompts (user_id, project_id, title, description, prompt_content, negative_prompt, category, ai_model, variables, is_demo)
    values (uid, p_majara, 'AI Video Prompt',
      'Prompt video pendek untuk materi ajar.',
      E'Buat video sinematik 8 detik: {{adegan}}. Pencahayaan lembut, gerakan kamera lambat, nuansa {{mood}}.',
      'teks di dalam gambar, distorsi wajah, goyangan berlebihan',
      'VIDEO', 'Seedance', 'adegan, mood', true)
    returning id into pr_video;

  insert into public.prompts (user_id, project_id, title, description, prompt_content, negative_prompt, category, ai_model, variables, is_demo)
    values (uid, p_skavis, 'Image Restyle Prompt',
      'Mengubah gaya foto agar konsisten dengan identitas visual sekolah.',
      E'Ubah gaya foto berikut menjadi {{gaya}}. Pertahankan komposisi dan subjek. Palet warna: {{palet}}.',
      'wajah berubah, proporsi aneh',
      'IMAGE', 'Gemini', 'gaya, palet', true);

  insert into public.prompt_versions (user_id, prompt_id, version_number, label, content, negative_prompt, note, is_current)
    values
      (uid, pr_web, 1, 'Versi awal', 'Buat halaman web sekolah yang rapi dan modern.', '', 'Percobaan pertama.', false),
      (uid, pr_web, 2, 'Tambah konteks', 'Buat halaman web sekolah untuk jurusan DKV, gaya minimalis, tipografi jelas.', '', 'Menambahkan jurusan.', false),
      (uid, pr_web, 3, 'Versi terkini', E'Kamu adalah frontend developer. Bangun halaman {{nama_halaman}} untuk situs sekolah dengan gaya minimalis, tipografi jelas, dan navigasi sederhana.', 'jangan gunakan gradien berlebihan', 'Menambahkan variabel.', true);

  insert into public.notes (user_id, project_id, title, content, is_demo)
    values
      (uid, p_skavis, 'Supabase Setup', E'## Langkah setup\n\n1. Buat project di Supabase.\n2. Jalankan `supabase/schema.sql`.\n3. Isi `.env` dengan URL dan anon key.\n4. Aktifkan Email provider di Authentication.', true),
      (uid, p_skavis, 'Astro Deployment', E'## Deploy ke Vercel\n\n- Framework preset: **Astro**.\n- Build command: `npm run build`.\n- Output directory: `dist`.\n- Tambahkan environment variable di Vercel.', true),
      (uid, p_majara, 'Website Ideas', E'- Halaman galeri karya murid\n- Bank soal latihan\n- Modul ajar yang bisa diunduh\n- Jadwal piket kelas', true);

  insert into public.links (user_id, project_id, title, url, description, category, is_demo)
    values
      (uid, p_skavis, 'Astro', 'https://astro.build', 'Framework situs yang dipakai proyek ini.', 'DEVELOPMENT', true),
      (uid, p_skavis, 'Supabase', 'https://supabase.com', 'Database, Auth, dan Storage.', 'DEVELOPMENT', true),
      (uid, p_skavis, 'Vercel', 'https://vercel.com', 'Hosting untuk deploy.', 'DEVELOPMENT', true);

  insert into public.accounts (user_id, project_id, service, account_name, email, username, purpose, recovery_email, login_url, notes, category, is_demo)
    values
      (uid, p_skavis, 'Supabase', 'SKAVIS Supabase', 'skavis.school@gmail.com', 'skavis', 'Database dan authentication situs.', 'guru.dkv@gmail.com', 'https://supabase.com/dashboard', 'Gunakan akun Google khusus proyek.', 'GOOGLE', true),
      (uid, p_majara, 'Vercel', 'MAJARA Hosting', 'majara.deploy@gmail.com', 'majara', 'Hosting situs dan preview.', 'guru.dkv@gmail.com', 'https://vercel.com/login', '', 'HOSTING', true);

  insert into public.tasks (user_id, project_id, title, description, status, priority, due_date, is_demo)
    values
      (uid, p_skavis, 'Jalankan schema.sql di Supabase', 'Sekali saja saat setup awal.', 'DONE', 'HIGH', null, true),
      (uid, p_skavis, 'Isi environment variable di Vercel', 'PUBLIC_SUPABASE_URL dan PUBLIC_SUPABASE_ANON_KEY.', 'TODO', 'HIGH', current_date + 3, true),
      (uid, p_majara, 'Kumpulkan materi ajar semester depan', '', 'IN_PROGRESS', 'MEDIUM', current_date + 14, true);

  insert into public.snippets (user_id, project_id, title, content, language, is_demo)
    values
      (uid, p_skavis, 'Deploy ke Vercel', E'npm run build\nvercel --prod', 'bash', true),
      (uid, p_skavis, 'Query favorit', E'select id, title, category\nfrom prompts\nwhere favorite = true\norder by updated_at desc;', 'sql', true),
      (uid, p_skavis, 'Environment template', E'PUBLIC_SUPABASE_URL=\nPUBLIC_SUPABASE_ANON_KEY=', 'env', true);

  -- Tag demo + relasi
  insert into public.tags (user_id, name) values
    (uid, 'skavis'), (uid, 'astro'), (uid, 'supabase'), (uid, 'ai'), (uid, 'coding')
  on conflict (user_id, name) do nothing;

  insert into public.tag_relations (user_id, tag_id, item_type, item_id)
  select uid, t.id, 'prompt', pr_web
  from public.tags t where t.user_id = uid and t.name in ('skavis', 'coding')
  on conflict do nothing;

  insert into public.activity_logs (user_id, action, item_type, item_title)
    values (uid, 'seed', 'system', 'Data demo dimuat');

  insert into public.activity_logs (user_id, action, item_type, item_id, item_title)
    select uid, 'create', 'note', n.id, n.title from public.notes n where n.user_id = uid and n.is_demo;
end;
$$;

create or replace function public.delete_demo_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Harus login untuk menghapus data demo.';
  end if;

  -- prompt_versions ikut terhapus lewat ON DELETE CASCADE.
  delete from public.prompts  where user_id = uid and is_demo;
  delete from public.documents where user_id = uid and is_demo;
  delete from public.notes    where user_id = uid and is_demo;
  delete from public.links    where user_id = uid and is_demo;
  delete from public.accounts where user_id = uid and is_demo;
  delete from public.tasks    where user_id = uid and is_demo;
  delete from public.snippets where user_id = uid and is_demo;
  delete from public.projects where user_id = uid and is_demo;
end;
$$;

-- ============================================================================
-- 10. HAK AKSES FUNGSI
-- ============================================================================

revoke all on function public.search_all(text, int) from anon;
grant execute on function public.search_all(text, int) to authenticated;
grant execute on function public.seed_demo_data() to authenticated;
grant execute on function public.delete_demo_data() to authenticated;

-- Selesai. Buka Authentication > Providers > Email di dashboard Supabase dan
-- pastikan aktif, lalu daftar akun pertama lewat halaman /masuk.
