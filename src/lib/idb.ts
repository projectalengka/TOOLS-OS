/**
 * Penyimpanan berkas untuk Mode Lokal.
 *
 * Metadata dokumen disimpan di localStorage, tetapi isi berkas (Blob) disimpan
 * di IndexedDB. Alasannya: localStorage hanya muat sekitar 5 MB dan hanya bisa
 * menyimpan teks, sedangkan IndexedDB bisa menyimpan Blob berukuran besar.
 *
 * Di mode Supabase, berkas disimpan di Supabase Storage dan file ini tidak
 * dipakai.
 */

const DB_NAME = 'personal-os';
const DB_VERSION = 1;
const STORE = 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia di browser ini.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Gagal membuka IndexedDB.'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Operasi penyimpanan gagal.'));
      }),
  );
}

export async function putFile(key: string, blob: Blob): Promise<void> {
  await tx('readwrite', (store) => store.put(blob, key));
}

export async function getFile(key: string): Promise<Blob | null> {
  const result = await tx<Blob | undefined>('readonly', (store) => store.get(key));
  return result ?? null;
}

export async function deleteFile(key: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(key));
}

export async function clearFiles(): Promise<void> {
  await tx('readwrite', (store) => store.clear());
}

export async function listFileKeys(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
  return keys.map(String);
}
