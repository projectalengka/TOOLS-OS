/**
 * Sesi pengguna.
 *
 * Supabase menyimpan sesi di localStorage dan menyegarkan token secara
 * otomatis. Di sini hasilnya di-cache hanya selama satu kali muat halaman
 * supaya tidak ada permintaan berulang ke server.
 */

import { db } from './store';
import type { Session } from './types';

let cached: Session | null | undefined;

export async function currentSession(): Promise<Session | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await db.getSession();
  } catch {
    cached = null;
  }
  return cached;
}

export function clearSessionCache(): void {
  cached = undefined;
}

export function loginUrl(next?: string): string {
  const target = next ?? (window.location.pathname + window.location.search);
  return `/masuk?next=${encodeURIComponent(target)}`;
}

/**
 * Dipanggil setiap halaman sebelum menampilkan data.
 * Kalau belum login, pengguna diarahkan ke halaman masuk.
 */
export async function requireSession(): Promise<Session | null> {
  const session = await currentSession();
  if (!session) {
    window.location.replace(loginUrl());
    return null;
  }
  return session;
}
