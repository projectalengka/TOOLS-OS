/**
 * Halaman masuk / daftar.
 *
 * Mode Supabase: Email + Password lewat Supabase Auth.
 * Mode Lokal: tanpa password, hanya identitas perangkat (aplikasi privat).
 */

import { db, isLocalMode } from '../store';
import { clearSessionCache, currentSession } from '../session';
import { esc, icon, showError, toast } from '../ui';
import { bootPage, setBusy } from '../boot';

type AuthMode = 'signin' | 'signup';

let mode: AuthMode = 'signin';
/**
 * Apakah pendaftaran akun baru terbuka. Kalau pemilik aplikasi menutupnya
 * (disable_signup di Supabase), tab "Daftar" disembunyikan supaya pengunjung
 * tidak menemui jalan buntu.
 */
let signupEnabled = true;

function nextUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  if (!next || !next.startsWith('/')) return '/';
  return next;
}

function applyMode(): void {
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-sub');
  const tabs = document.getElementById('auth-tabs');
  const nameField = document.getElementById('field-name');
  const passwordField = document.getElementById('field-password');
  const submit = document.getElementById('auth-submit');
  const forgot = document.getElementById('auth-forgot');
  const error = document.getElementById('auth-error');
  if (error) error.hidden = true;

  if (isLocalMode) {
    if (tabs) tabs.hidden = true;
    if (passwordField) passwordField.hidden = true;
    if (forgot) forgot.hidden = true;
    if (nameField) nameField.hidden = false;
    if (title) title.textContent = 'Mulai gunakan PERSONAL OS';
    if (subtitle) subtitle.textContent = 'Data disimpan di perangkat ini saja. Tidak perlu password.';
    if (submit) submit.innerHTML = `${icon('arrowRight', 16)}<span>Mulai</span>`;
    return;
  }

  // Aplikasi privat: pendaftaran ditutup, jadi hanya form masuk yang ditampilkan.
  if (!signupEnabled) {
    if (tabs) tabs.hidden = true;
    if (nameField) nameField.hidden = true;
    if (passwordField) passwordField.hidden = false;
    if (forgot) forgot.hidden = false;
    if (title) title.textContent = 'Masuk';
    if (subtitle) subtitle.textContent = 'Aplikasi ini privat. Hanya pemiliknya yang bisa masuk.';
    if (submit) submit.innerHTML = `${icon('arrowRight', 16)}<span>Masuk</span>`;
    return;
  }

  if (tabs) tabs.hidden = false;
  if (passwordField) passwordField.hidden = false;
  if (forgot) forgot.hidden = mode !== 'signin';
  if (nameField) nameField.hidden = mode !== 'signup';
  if (title) title.textContent = mode === 'signin' ? 'Masuk' : 'Buat akun';
  if (subtitle)
    subtitle.textContent =
      mode === 'signin'
        ? 'Masuk untuk membuka meja kerja digitalmu.'
        : 'Akun ini privat. Semua data hanya bisa diakses olehmu.';
  if (submit)
    submit.innerHTML =
      mode === 'signin'
        ? `${icon('arrowRight', 16)}<span>Masuk</span>`
        : `${icon('plus', 16)}<span>Daftar</span>`;

  tabs?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === mode);
  });
}

export async function initLoginPage(): Promise<void> {
  await bootPage(
    async () => {
      // Kalau sudah punya sesi, langsung ke halaman tujuan.
      const existing = await currentSession();
      if (existing) {
        window.location.replace(nextUrl());
        return;
      }

      const tabs = document.getElementById('auth-tabs');
      const form = document.getElementById('auth-form') as HTMLFormElement;
      const submit = document.getElementById('auth-submit') as HTMLButtonElement;
      const errorEl = document.getElementById('auth-error');
      const note = document.getElementById('auth-note');

      if (note) {
        note.innerHTML = isLocalMode
          ? '<strong>Mode Lokal.</strong> Tidak ada server dan tidak ada password. Isi nama dan email, lalu data tersimpan di perangkat ini.'
          : '<strong>Privasi.</strong> Setiap baris data dilindungi Row Level Security, jadi hanya akunmu yang bisa membacanya.';
      }

      // Cek dulu apakah pendaftaran terbuka, baru gambar tampilannya.
      if (!isLocalMode) {
        try {
          signupEnabled = await db.isSignupEnabled();
        } catch {
          signupEnabled = true;
        }
        if (!signupEnabled) mode = 'signin';
      }

      applyMode();

      tabs?.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
        if (!button) return;
        mode = (button.dataset.mode as AuthMode) ?? 'signin';
        applyMode();
      });

      const showFormError = (message: string) => {
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.hidden = false;
      };

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (errorEl) errorEl.hidden = true;

        const email = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
        const password = (document.getElementById('auth-password') as HTMLInputElement | null)?.value ?? '';
        const name = (document.getElementById('auth-name') as HTMLInputElement | null)?.value.trim() ?? '';

        if (!email) {
          showFormError('Email wajib diisi.');
          return;
        }
        if (!isLocalMode && password.length < 6) {
          showFormError('Password minimal 6 karakter.');
          return;
        }
        // Penjaga tambahan: pendaftaran tertutup tidak boleh bisa ditembus
        // walaupun seseorang menyunting DOM dan memaksa mode 'signup'.
        if (!isLocalMode && mode === 'signup' && !signupEnabled) {
          showFormError('Pendaftaran akun baru ditutup oleh pemilik aplikasi.');
          return;
        }

        setBusy(submit, true, isLocalMode ? 'Menyiapkan…' : mode === 'signin' ? 'Masuk…' : 'Mendaftarkan…');
        try {
          if (isLocalMode) {
            await db.signUp(email, 'lokal', name || email.split('@')[0] || 'Pengguna');
            clearSessionCache();
            toast('Selamat datang di PERSONAL OS.');
            window.location.replace(nextUrl());
            return;
          }

          if (mode === 'signin') {
            await db.signIn(email, password);
            clearSessionCache();
            toast('Berhasil masuk.');
            window.location.replace(nextUrl());
            return;
          }

          const result = await db.signUp(email, password, name || email.split('@')[0] || 'Pengguna');
          clearSessionCache();
          if (result.needsConfirm) {
            if (note) {
              note.innerHTML =
                'Akun dibuat. Supabase mengirim email konfirmasi — buka tautannya, lalu masuk kembali di sini.';
            }
            toast('Cek email kamu untuk mengonfirmasi akun.', 'info');
            mode = 'signin';
            applyMode();
            return;
          }
          toast('Akun berhasil dibuat.');
          window.location.replace(nextUrl());
        } catch (error) {
          showError(error, 'Gagal masuk. Silakan coba lagi.');
        } finally {
          setBusy(submit, false);
        }
      });

      document.getElementById('auth-forgot')?.addEventListener('click', async (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const email = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
        if (!email) {
          showFormError('Isi email dulu, lalu klik "Lupa password?".');
          return;
        }
        setBusy(button, true, 'Mengirim…');
        try {
          await db.sendPasswordReset(email);
          toast('Email reset password sudah dikirim.');
        } catch (error) {
          showError(error, 'Gagal mengirim email reset password.');
        } finally {
          setBusy(button, false);
        }
      });

      // Tampilkan catatan tambahan kalau konfigurasi Supabase belum lengkap.
      if (!isLocalMode) {
        const hint = document.getElementById('auth-hint');
        if (hint) {
          hint.innerHTML = signupEnabled
            ? 'Belum punya akun? Klik <strong>Daftar</strong>.'
            : 'Pendaftaran akun baru ditutup oleh pemilik aplikasi. Kalau ini aplikasimu, masuk memakai akun yang sudah terdaftar.';
          hint.hidden = false;
        }
      }

      const firstInput = document.querySelector<HTMLInputElement>('#auth-form input:not([type=hidden])');
      firstInput?.focus();
    },
    { auth: false },
  );
}

export { esc };
