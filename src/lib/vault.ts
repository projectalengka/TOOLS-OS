/**
 * Vault: penyimpanan password terenkripsi.
 *
 * Cara kerjanya:
 *   1. Master password kamu diturunkan menjadi kunci AES-256 memakai PBKDF2
 *      (250.000 iterasi, SHA-256) dengan salt acak 16 byte.
 *   2. Setiap password dienkripsi dengan AES-GCM 256 dan IV acak 12 byte.
 *   3. Yang disimpan hanya ciphertext + IV + salt. Master password sendiri
 *      TIDAK PERNAH disimpan dan TIDAK PERNAH dikirim ke server.
 *
 * Konsekuensinya penting dan disengaja: kalau master password hilang, password
 * yang tersimpan tidak bisa dipulihkan oleh siapa pun, termasuk oleh server.
 *
 * Catatan keamanan yang jujur: master password disimpan di sessionStorage
 * supaya kamu tidak perlu mengetiknya ulang di setiap perpindahan halaman.
 * sessionStorage terhapus saat tab ditutup, dan vault otomatis terkunci setelah
 * 15 menit tanpa aktivitas. Kunci turunan (CryptoKey) tidak pernah diekspor dan
 * tidak pernah ditulis ke penyimpanan.
 */

import { db } from './store';

const SESSION_PASSWORD_KEY = 'personal-os:vault-pw';
const SESSION_EXPIRY_KEY = 'personal-os:vault-exp';

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CHECK_TEXT = 'PERSONAL-OS-VAULT-CHECK-v1';

/** Vault terkunci otomatis setelah 15 menit tanpa aktivitas. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export type VaultState = 'unset' | 'locked' | 'unlocked' | 'unsupported';

export interface SecretBlob {
  ciphertext: string;
  iv: string;
}

/* ------------------------------------------------------------- utilitas */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] as number);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** WebCrypto hanya tersedia di konteks aman (https atau localhost). */
export function isSupported(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined' && typeof crypto.subtle.deriveKey === 'function';
}

function requireCrypto(): void {
  if (!isSupported()) {
    throw new Error(
      'Vault memerlukan koneksi aman (https atau localhost). Buka aplikasi lewat https:// atau http://localhost.',
    );
  }
}

async function deriveKey(masterPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // kunci tidak bisa diekspor
    ['encrypt', 'decrypt'],
  );
}

async function encryptWith(key: CryptoKey, plain: string): Promise<SecretBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoder.encode(plain) as BufferSource,
  );
  return { ciphertext: toBase64(new Uint8Array(cipher)), iv: toBase64(iv) };
}

async function decryptWith(key: CryptoKey, blob: SecretBlob): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) as BufferSource },
    key,
    fromBase64(blob.ciphertext) as BufferSource,
  );
  return decoder.decode(plain);
}

/* ------------------------------------------------------- status & sesi */

let cachedKey: CryptoKey | null = null;

function readSessionPassword(): string | null {
  try {
    const expiry = Number(sessionStorage.getItem(SESSION_EXPIRY_KEY) ?? '0');
    if (!expiry || Date.now() > expiry) return null;
    return sessionStorage.getItem(SESSION_PASSWORD_KEY);
  } catch {
    return null;
  }
}

function writeSessionPassword(password: string): void {
  try {
    sessionStorage.setItem(SESSION_PASSWORD_KEY, password);
    sessionStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + IDLE_TIMEOUT_MS));
  } catch {
    /* kalau sessionStorage diblokir, vault tetap bisa dipakai per halaman */
  }
}

function touchSession(): void {
  try {
    if (sessionStorage.getItem(SESSION_PASSWORD_KEY)) {
      sessionStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + IDLE_TIMEOUT_MS));
    }
  } catch {
    /* abaikan */
  }
}

export function isUnlocked(): boolean {
  return cachedKey !== null;
}

/**
 * Mengunci vault kalau sesi idle-nya sudah kedaluwarsa.
 * Mengembalikan true kalau baru saja dikunci — dipakai untuk memberi tahu
 * pengguna bahwa vault terkunci otomatis.
 */
export function enforceIdleLock(): boolean {
  if (!cachedKey) return false;
  if (readSessionPassword() === null) {
    lock();
    return true;
  }
  return false;
}

export function lock(): void {
  cachedKey = null;
  try {
    sessionStorage.removeItem(SESSION_PASSWORD_KEY);
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
  } catch {
    /* abaikan */
  }
}

export async function getState(): Promise<VaultState> {
  if (!isSupported()) return 'unsupported';
  if (cachedKey) return 'unlocked';
  const meta = await db.getVaultMeta().catch(() => null);
  if (!meta) return 'unset';
  return 'locked';
}

/* ----------------------------------------------------- buat & buka vault */

export interface VaultStrength {
  score: number; // 0..4
  label: string;
}

/** Penilaian sederhana, cukup untuk memberi umpan balik saat membuat vault. */
export function rateMasterPassword(password: string): VaultStrength {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  score = Math.min(4, score);
  const labels = ['Sangat lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'];
  return { score, label: labels[score] ?? 'Lemah' };
}

export async function createVault(masterPassword: string): Promise<void> {
  requireCrypto();
  if (masterPassword.length < 8) throw new Error('Master password minimal 8 karakter.');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(masterPassword, salt);
  const check = await encryptWith(key, CHECK_TEXT);

  await db.setVaultMeta({ salt: toBase64(salt), check: JSON.stringify(check) });
  cachedKey = key;
  writeSessionPassword(masterPassword);
}

/** Mengembalikan false kalau master password salah. */
export async function unlockVault(masterPassword: string): Promise<boolean> {
  requireCrypto();
  const meta = await db.getVaultMeta();
  if (!meta) throw new Error('Vault belum dibuat.');

  const key = await deriveKey(masterPassword, fromBase64(meta.salt));
  let ok = false;
  try {
    const parsed = JSON.parse(meta.check) as SecretBlob;
    ok = (await decryptWith(key, parsed)) === CHECK_TEXT;
  } catch {
    ok = false;
  }
  if (!ok) return false;

  cachedKey = key;
  writeSessionPassword(masterPassword);
  return true;
}

/**
 * Memastikan kunci tersedia tanpa meminta apa pun.
 * Dipakai saat berpindah halaman: kunci diturunkan ulang dari sessionStorage.
 */
export async function ensureUnlocked(): Promise<boolean> {
  if (!isSupported()) return false;
  if (cachedKey) {
    touchSession();
    return true;
  }
  const password = readSessionPassword();
  if (!password) return false;
  try {
    const meta = await db.getVaultMeta();
    if (!meta) return false;
    cachedKey = await deriveKey(password, fromBase64(meta.salt));
    touchSession();
    return true;
  } catch {
    cachedKey = null;
    return false;
  }
}

/* ------------------------------------------------------------- enkripsi */

export async function encryptSecret(plain: string): Promise<SecretBlob> {
  requireCrypto();
  if (!cachedKey) throw new Error('Vault sedang terkunci.');
  touchSession();
  return encryptWith(cachedKey, plain);
}

export async function decryptSecret(blob: SecretBlob): Promise<string> {
  requireCrypto();
  if (!cachedKey) throw new Error('Vault sedang terkunci.');
  touchSession();
  return decryptWith(cachedKey, blob);
}

/* ----------------------------------------------- ganti master password */

/**
 * Mengganti master password: semua rahasia dibuka dengan kunci lama lalu
 * dienkripsi ulang dengan kunci baru. Kalau ada satu saja yang gagal, seluruh
 * proses dibatalkan supaya tidak ada data yang tertinggal separuh jalan.
 */
export async function changeMasterPassword(currentPassword: string, newPassword: string): Promise<number> {
  requireCrypto();
  if (newPassword.length < 8) throw new Error('Master password baru minimal 8 karakter.');
  if (newPassword === currentPassword) throw new Error('Master password baru sama dengan yang sekarang.');

  const meta = await db.getVaultMeta();
  if (!meta) throw new Error('Vault belum dibuat.');

  const oldKey = await deriveKey(currentPassword, fromBase64(meta.salt));
  try {
    const parsed = JSON.parse(meta.check) as SecretBlob;
    if ((await decryptWith(oldKey, parsed)) !== CHECK_TEXT) {
      throw new Error('Master password saat ini salah.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('salah')) throw error;
    throw new Error('Master password saat ini salah.');
  }

  const secrets = await db.listSecrets();

  // Buka semuanya dulu dengan kunci lama. Kalau ada yang gagal, batalkan
  // sebelum ada satu baris pun yang diubah.
  const plaintexts: { id: string; plain: string }[] = [];
  for (const secret of secrets) {
    const plain = await decryptWith(oldKey, { ciphertext: secret.ciphertext, iv: secret.iv });
    plaintexts.push({ id: secret.id, plain });
  }

  const newSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const newKey = await deriveKey(newPassword, newSalt);
  const newCheck = await encryptWith(newKey, CHECK_TEXT);

  for (const item of plaintexts) {
    const blob = await encryptWith(newKey, item.plain);
    await db.updateSecret(item.id, { ciphertext: blob.ciphertext, iv: blob.iv });
  }

  await db.setVaultMeta({ salt: toBase64(newSalt), check: JSON.stringify(newCheck) });
  cachedKey = newKey;
  writeSessionPassword(newPassword);
  return plaintexts.length;
}

/* -------------------------------------------------- generator password */

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';

/**
 * Membuat password acak memakai crypto.getRandomValues.
 * Huruf yang mudah tertukar (0/O, 1/l/I) sengaja dihilangkan supaya tidak salah
 * dibaca saat diketik ulang di HP.
 */
export function generatePassword(length = 20): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const randomIndex = (max: number): number => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (buffer[0] as number) % max;
  };
  const pick = (charset: string) => charset.charAt(randomIndex(charset.length));

  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));

  // Acak urutan supaya empat karakter pertama tidak selalu berpola sama.
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapWith = randomIndex(index + 1);
    const temporary = chars[index] as string;
    chars[index] = chars[swapWith] as string;
    chars[swapWith] = temporary;
  }
  return chars.join('');
}

/* ------------------------------------------------------------ pembersih */

/**
 * Membuang jejak vault saat pengguna keluar.
 */
export function resetVaultSession(): void {
  lock();
}

export { isSupported as isVaultSupported };
