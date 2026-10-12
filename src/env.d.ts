/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** URL project Supabase, contoh: https://xxxxx.supabase.co */
  readonly PUBLIC_SUPABASE_URL?: string;
  /** Anon public key Supabase. Aman dipakai di browser karena dilindungi RLS. */
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
