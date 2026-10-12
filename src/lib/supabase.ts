/**
 * Klien Supabase.
 *
 * Library @supabase/supabase-js dimuat secara dinamis (dynamic import) dan baru
 * diambil dari server ketika aplikasi benar-benar memakai Supabase. Dengan
 * begitu, Mode Lokal tidak perlu mengunduh library besar itu sama sekali.
 *
 * Yang dipakai di browser HANYA anon key. Anon key memang dirancang publik:
 * keamanan data dijaga oleh Row Level Security di database, bukan oleh
 * kerahasiaan key ini. Service Role Key tidak pernah dipakai di frontend.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const supabaseUrl: string = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
export const supabaseAnonKey: string = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

let clientPromise: Promise<SupabaseClient> | null = null;

export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) {
    return Promise.reject(
      new Error(
        'Supabase belum dikonfigurasi. Isi PUBLIC_SUPABASE_URL dan PUBLIC_SUPABASE_ANON_KEY lebih dulu.',
      ),
    );
  }
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  return clientPromise;
}
