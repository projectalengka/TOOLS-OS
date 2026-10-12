/**
 * Bootstrap halaman: satu pintu masuk untuk semua skrip halaman.
 * Menangani pemeriksaan sesi, error tak terduga, dan pengaturan awal.
 */

import { showError, toastError } from './ui';
import { requireSession } from './session';

export interface PageContext {
  /** Parameter URL halaman, sudah diurai. */
  params: URLSearchParams;
}

export async function bootPage(
  init: (context: PageContext) => Promise<void> | void,
  options: { auth?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  try {
    if (options.auth !== false) {
      const session = await requireSession();
      if (!session) return;
    }
    await init({ params });
  } catch (error) {
    showError(error);
  }
}

/** Dipakai tombol "Coba lagi" pada state error. */
export function bindRetry(container: HTMLElement, handler: () => void): void {
  container.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-retry]')) handler();
  });
}

export function setBusy(button: HTMLButtonElement | null, busy: boolean, label?: string): void {
  if (!button) return;
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${label ?? 'Memproses…'}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.original) {
      button.innerHTML = button.dataset.original;
      delete button.dataset.original;
    }
  }
}

export function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemen #${id} tidak ditemukan.`);
  return element as T;
}

export { toastError };
