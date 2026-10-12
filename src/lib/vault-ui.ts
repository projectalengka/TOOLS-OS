/**
 * Antarmuka vault: gerbang buka-kunci, pengelola password per account, dan
 * pengaturan vault.
 *
 * Semua nilai asli hanya hidup di dalam modal yang sedang terbuka. Begitu modal
 * ditutup, tidak ada lagi teks password yang tersisa di DOM.
 */

import { db } from './store';
import {
  createVault, decryptSecret, encryptSecret, ensureUnlocked, generatePassword,
  getState, isSupported, isUnlocked, lock, rateMasterPassword, unlockVault,
  changeMasterPassword, type VaultState,
} from './vault';
import {
  confirmDialog, copyText, esc, icon, openModal, showError, toast,
} from './ui';
import { setBusy } from './boot';
import type { Account, Secret } from './types';

const VAULT_STATE_LABEL: Record<VaultState, string> = {
  unset: 'Belum dibuat',
  locked: 'Terkunci',
  unlocked: 'Terbuka',
  unsupported: 'Tidak tersedia',
};

const VAULT_STATE_TONE: Record<VaultState, string> = {
  unset: 'badge-warn',
  locked: '',
  unlocked: 'badge-ok',
  unsupported: 'badge-danger',
};

function strengthHtml(password: string): string {
  const { score, label } = rateMasterPassword(password);
  const bars = [0, 1, 2, 3]
    .map((index) => `<span class="${index < score ? `is-on-${score}` : ''}"></span>`)
    .join('');
  return `<div class="strength-bar">${bars}</div><p class="field-help">Kekuatan: ${esc(label)}</p>`;
}

function passwordFieldHtml(id: string, label: string, autocomplete: string): string {
  return `
    <div class="field is-full">
      <label class="field-label" for="${id}">${esc(label)}</label>
      <div class="secret-input" data-secret-field>
        <input type="password" id="${id}" class="input mono" autocomplete="${autocomplete}" spellcheck="false" />
        <button type="button" class="icon-button" data-secret-reveal aria-label="Tampilkan isi" title="Tampilkan isi">${icon('eye', 16)}</button>
      </div>
      <p class="field-error" data-error="${id}" hidden></p>
    </div>`;
}

/** Memasang tombol tampilkan/sembunyikan di dalam modal. */
function bindRevealButtons(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-secret-field]').forEach((wrapper) => {
    const input = wrapper.querySelector<HTMLInputElement>('input');
    const button = wrapper.querySelector<HTMLElement>('[data-secret-reveal]');
    if (!input || !button) return;
    button.addEventListener('click', () => {
      const revealed = input.type === 'password';
      input.type = revealed ? 'text' : 'password';
      button.innerHTML = icon(revealed ? 'eyeOff' : 'eye', 16);
      button.setAttribute('aria-label', revealed ? 'Sembunyikan isi' : 'Tampilkan isi');
    });
  });
}

function showFieldError(root: HTMLElement, id: string, message: string): void {
  const slot = root.querySelector<HTMLElement>(`[data-error="${id}"]`);
  if (slot) {
    slot.textContent = message;
    slot.hidden = false;
  }
  root.querySelector<HTMLElement>(`#${id}`)?.setAttribute('aria-invalid', 'true');
}

function isLockedError(error: unknown): boolean {
  return error instanceof Error && /terkunci|belum dibuat|harus dibuka/i.test(error.message);
}

/**
 * Menjalankan operasi yang butuh kunci vault.
 *
 * Kalau vault ternyata sudah terkunci (misalnya auto-lock 15 menit terpicu saat
 * modal masih terbuka), pengguna tidak diberi pesan error membingungkan seperti
 * "Vault sedang terkunci" — padahal ia tidak menekan Kunci. Yang terjadi:
 * vault dibuka lagi lebih dulu, lalu operasi diulang sekali.
 */
async function withVault<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (!isLockedError(error)) throw error;

    toast('Vault berkunci otomatis. Buka dulu untuk melanjutkan.', 'info');
    const ready = await openVaultGate();
    if (!ready) return null;
    try {
      return await operation();
    } catch (retryError) {
      showError(retryError, 'Gagal membuka password.');
      return null;
    }
  }
}

function clearFieldError(root: HTMLElement, id: string): void {
  const slot = root.querySelector<HTMLElement>(`[data-error="${id}"]`);
  if (slot) slot.hidden = true;
  root.querySelector<HTMLElement>(`#${id}`)?.removeAttribute('aria-invalid');
}

/* ------------------------------------------------------------ gerbang */

/**
 * Memastikan vault terbuka. Kalau belum dibuat, pengguna diminta membuat
 * master password lebih dulu. Mengembalikan true kalau vault siap dipakai.
 */
export async function openVaultGate(): Promise<boolean> {
  if (!isSupported()) {
    toast('Vault memerlukan koneksi aman (https atau localhost). Buka aplikasi lewat https:// atau localhost.', 'error');
    return false;
  }
  if (await ensureUnlocked()) return true;

  const state = await getState();
  if (state === 'unset') return createVaultFlow();

  return new Promise<boolean>((resolve) => {
    const body = document.createElement('div');
    body.innerHTML = `
      <form class="form" data-unlock-form novalidate>
        <div class="vault-banner">
          ${icon('vault', 16)}
          <span>Masukkan <strong>master password</strong> untuk membuka password yang tersimpan. Master password tidak pernah dikirim ke server dan tidak bisa dipulihkan kalau lupa.</span>
        </div>
        ${passwordFieldHtml('unlock-password', 'Master Password', 'current-password')}
      </form>`;

    const footer = document.createElement('div');
    footer.className = 'modal-actions';
    footer.innerHTML = `
      <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
      <button type="button" class="btn btn-primary" data-submit>${icon('lock', 16)}<span>Buka Vault</span></button>`;

    const handle = openModal({
      title: 'Buka Vault',
      subtitle: 'Password kamu terenkripsi. Buka untuk melihatnya.',
      body,
      footer,
      size: 'sm',
    });

    bindRevealButtons(body);
    const input = body.querySelector<HTMLInputElement>('#unlock-password') as HTMLInputElement;
    const submit = footer.querySelector<HTMLButtonElement>('[data-submit]');
    let settled = false;

    const attempt = async () => {
      clearFieldError(body, 'unlock-password');
      const value = input.value;
      if (!value) {
        showFieldError(body, 'unlock-password', 'Master password wajib diisi.');
        input.focus();
        return;
      }
      setBusy(submit, true, 'Membuka…');
      try {
        const ok = await unlockVault(value);
        if (!ok) {
          showFieldError(body, 'unlock-password', 'Master password salah.');
          input.select();
          return;
        }
        settled = true;
        handle.close();
        toast('Vault terbuka.');
        resolve(true);
      } catch (error) {
        showError(error, 'Gagal membuka vault.');
      } finally {
        setBusy(submit, false);
      }
    };

    submit?.addEventListener('click', () => void attempt());
    body.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void attempt();
    });
    footer.querySelector('[data-cancel]')?.addEventListener('click', () => handle.close());
    handle.element.closest('.modal-overlay')?.addEventListener('click', (event) => {
      if (event.target === handle.element.closest('.modal-overlay') && !settled) resolve(false);
    });

    input.focus();
  });
}

/** Alur pembuatan master password. */
async function createVaultFlow(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const body = document.createElement('div');
    body.innerHTML = `
      <form class="form" data-create-form novalidate>
        <div class="vault-banner is-warn">
          ${icon('alert', 16)}
          <span>
            <strong>Baca dulu sebelum lanjut.</strong> Master password ini adalah satu-satunya kunci untuk membuka
            password yang kamu simpan. Kalau lupa, isinya <strong>tidak bisa dipulihkan</strong> — tidak ada tombol
            "lupa password" dan server tidak menyimpan cadangannya. Tulis di tempat yang aman.
          </span>
        </div>
        ${passwordFieldHtml('master-password', 'Master Password Baru', 'new-password')}
        <div data-strength></div>
        ${passwordFieldHtml('master-confirm', 'Ulangi Master Password', 'new-password')}
      </form>`;

    const footer = document.createElement('div');
    footer.className = 'modal-actions';
    footer.innerHTML = `
      <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
      <button type="button" class="btn btn-primary" data-submit>${icon('vault', 16)}<span>Buat Vault</span></button>`;

    const handle = openModal({
      title: 'Buat Master Password',
      subtitle: 'Satu kunci untuk semua password yang kamu simpan.',
      body,
      footer,
      size: 'sm',
    });

    bindRevealButtons(body);
    const passwordInput = body.querySelector<HTMLInputElement>('#master-password') as HTMLInputElement;
    const confirmInput = body.querySelector<HTMLInputElement>('#master-confirm') as HTMLInputElement;
    const strengthSlot = body.querySelector<HTMLElement>('[data-strength]') as HTMLElement;
    const submit = footer.querySelector<HTMLButtonElement>('[data-submit]');
    let settled = false;

    const paintStrength = () => {
      strengthSlot.innerHTML = passwordInput.value ? strengthHtml(passwordInput.value) : '';
    };
    passwordInput.addEventListener('input', paintStrength);

    const attempt = async () => {
      clearFieldError(body, 'master-password');
      clearFieldError(body, 'master-confirm');
      const value = passwordInput.value;
      const confirmation = confirmInput.value;

      if (value.length < 8) {
        showFieldError(body, 'master-password', 'Minimal 8 karakter. Gunakan minimal 12 karakter untuk keamanan lebih baik.');
        passwordInput.focus();
        return;
      }
      if (value !== confirmation) {
        showFieldError(body, 'master-confirm', 'Kedua isian tidak sama.');
        confirmInput.focus();
        return;
      }

      setBusy(submit, true, 'Membuat…');
      try {
        await createVault(value);
        settled = true;
        handle.close();
        toast('Vault berhasil dibuat. Password kamu sekarang bisa disimpan.');
        resolve(true);
      } catch (error) {
        showError(error, 'Gagal membuat vault.');
      } finally {
        setBusy(submit, false);
      }
    };

    submit?.addEventListener('click', () => void attempt());
    body.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void attempt();
    });
    footer.querySelector('[data-cancel]')?.addEventListener('click', () => handle.close());
    handle.element.closest('.modal-overlay')?.addEventListener('click', (event) => {
      if (event.target === handle.element.closest('.modal-overlay') && !settled) resolve(false);
    });

    passwordInput.focus();
  });
}

/* ------------------------------------------- pengelola password account */

export interface SecretsModalOptions {
  /** Dipanggil setelah ada perubahan, supaya kartu account ikut diperbarui. */
  onChange?: () => void;
}

/**
 * Menampilkan dan mengelola password milik satu account.
 */
export async function openSecretsModal(account: Account, options: SecretsModalOptions = {}): Promise<void> {
  const ready = await openVaultGate();
  if (!ready) return;

  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '14px';

  const title = account.account_name || account.service || account.email || 'Account';

  openModal({
    title: 'Password Tersimpan',
    subtitle: `${title}${account.email ? ` · ${account.email}` : ''}`,
    body,
    size: 'md',
  });

  /** Nilai asli hanya hidup di variabel ini selama modal terbuka. */
  const revealed = new Map<string, string>();
  let secrets: Secret[] = [];

  const render = async () => {
    secrets = await db.listSecrets(account.id);
    const rows = secrets
      .map((secret) => {
        const plain = revealed.get(secret.id);
        const isPassword = secret.label.toLowerCase() === 'password';
        return `
        <div class="secret-item" data-secret-id="${esc(secret.id)}">
          <span class="row-icon">${icon(isPassword ? 'keyRound' : 'note', 16)}</span>
          <span class="row-main">
            <span class="row-title">${esc(secret.label)}</span>
            <span class="secret-value ${plain ? '' : 'is-masked'}" data-secret-display>${
              plain ? esc(plain) : '••••••••••••'
            }</span>
          </span>
          <span class="row-right">
            <button type="button" class="icon-button" data-secret-toggle
              aria-label="${plain ? 'Sembunyikan' : 'Tampilkan'}" title="${plain ? 'Sembunyikan' : 'Tampilkan'}">
              ${icon(plain ? 'eyeOff' : 'eye', 16)}
            </button>
            <button type="button" class="icon-button" data-secret-copy
              aria-label="Salin" title="Salin">${icon('copy', 16)}</button>
            <button type="button" class="icon-button is-danger" data-secret-delete
              aria-label="Hapus" title="Hapus">${icon('trash', 16)}</button>
          </span>
        </div>`;
      })
      .join('');

    body.innerHTML = `
      <div class="secret-list">
        ${
          secrets.length === 0
            ? `<p class="page-sub">Belum ada password tersimpan untuk akun ini. Tambahkan di bawah.</p>`
            : rows
        }
      </div>
      <hr class="divider" />
      <form class="form" data-secret-form novalidate>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="secret-label">Nama</label>
            <select id="secret-label" class="select">
              <option value="Password">Password</option>
              <option value="PIN">PIN</option>
              <option value="Kode Pemulihan">Kode Pemulihan</option>
              <option value="Pertanyaan Keamanan">Pertanyaan Keamanan</option>
              <option value="Catatan Rahasia">Catatan Rahasia</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="secret-value">Isi</label>
            <div class="secret-input" data-secret-field>
              <input type="password" id="secret-value" class="input mono" autocomplete="new-password" spellcheck="false" placeholder="Tempel atau buat password" />
              <button type="button" class="icon-button" data-secret-reveal aria-label="Tampilkan isi" title="Tampilkan isi">${icon('eye', 16)}</button>
              <button type="button" class="icon-button" data-secret-random aria-label="Buat password acak" title="Buat password acak">${icon('refresh', 16)}</button>
            </div>
          </div>
        </div>
        <p class="field-error" data-error="secret-value" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" data-secret-add>${icon('plus', 16)}<span>Simpan</span></button>
        </div>
      </form>`;

    bindRevealButtons(body);

    const valueInput = body.querySelector<HTMLInputElement>('#secret-value') as HTMLInputElement;

    body.querySelector('[data-secret-random]')?.addEventListener('click', async () => {
      valueInput.value = generatePassword();
      valueInput.type = 'text';
      const revealButton = body.querySelector<HTMLElement>('[data-secret-reveal]');
      if (revealButton) revealButton.innerHTML = icon('eyeOff', 16);
      const copied = await copyText(valueInput.value);
      toast(copied ? 'Password acak dibuat dan sudah disalin.' : 'Password acak dibuat.', 'info');
    });

    body.querySelector('[data-secret-add]')?.addEventListener('click', async () => {
      clearFieldError(body, 'secret-value');
      const value = valueInput.value;
      if (!value.trim()) {
        showFieldError(body, 'secret-value', 'Isi tidak boleh kosong.');
        valueInput.focus();
        return;
      }
      const label = (body.querySelector<HTMLSelectElement>('#secret-label') as HTMLSelectElement).value;
      try {
        const blob = await withVault(() => encryptSecret(value));
        if (!blob) return;
        const existing = secrets.find((secret) => secret.label === label);
        if (existing) {
          await db.updateSecret(existing.id, { ciphertext: blob.ciphertext, iv: blob.iv });
        } else {
          await db.createSecret({ account_id: account.id, label, ciphertext: blob.ciphertext, iv: blob.iv });
        }
        await db.log('vault-save', 'account', account.id, label);
        revealed.clear();
        toast(`${label} berhasil disimpan (terenkripsi).`);
        await render();
        options.onChange?.();
      } catch (error) {
        showError(error, 'Gagal menyimpan password.');
      }
    });

    body.querySelectorAll<HTMLElement>('[data-secret-id]').forEach((item) => {
      const secretId = item.getAttribute('data-secret-id') ?? '';
      const secret = secrets.find((entry) => entry.id === secretId);
      if (!secret) return;

      item.querySelector('[data-secret-toggle]')?.addEventListener('click', async () => {
        if (revealed.has(secretId)) {
          revealed.delete(secretId);
          await render();
          return;
        }
        const plain = await withVault(() =>
          decryptSecret({ ciphertext: secret.ciphertext, iv: secret.iv }),
        );
        if (plain !== null) {
          revealed.set(secretId, plain);
          await render();
        }
      });

      item.querySelector('[data-secret-copy]')?.addEventListener('click', async () => {
        const plain = await withVault(async () => {
          return revealed.get(secretId) ?? (await decryptSecret({ ciphertext: secret.ciphertext, iv: secret.iv }));
        });
        if (plain === null) return;
        const copied = await copyText(plain);
        toast(copied ? 'Password berhasil disalin.' : 'Gagal menyalin.', copied ? 'success' : 'error');
      });

      item.querySelector('[data-secret-delete]')?.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: 'Hapus rahasia ini?',
          message: `"${secret.label}" akan dihapus permanen dan tidak bisa dikembalikan.`,
          confirmLabel: 'Hapus',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await db.deleteSecret(secretId);
          revealed.delete(secretId);
          toast('Rahasia berhasil dihapus.');
          await render();
          options.onChange?.();
        } catch (error) {
          showError(error, 'Gagal menghapus rahasia.');
        }
      });
    });

    valueInput?.focus();
  };

  try {
    await render();
  } catch (error) {
    body.innerHTML = `<p class="page-sub">Gagal memuat password tersimpan.</p>`;
    showError(error, 'Gagal memuat password tersimpan.');
  }
}

/* ------------------------------------------------- pengaturan vault */

/** Menggambar bagian vault di halaman Pengaturan. */
export async function renderVaultSection(container: HTMLElement): Promise<void> {
  if (!isSupported()) {
    container.innerHTML = `
      <div class="vault-banner is-warn">
        ${icon('alert', 16)}
        <span>Vault memerlukan koneksi aman. Buka aplikasi lewat <code>https://</code> atau <code>http://localhost</code>.</span>
      </div>`;
    return;
  }

  await ensureUnlocked();
  const state = await getState();
  const secretCount = state === 'unset' ? 0 : (await db.listSecrets().catch(() => [])).length;

  container.innerHTML = `
    <div class="section-head" style="margin-bottom:10px">
      <div class="item-meta">
        <span class="badge ${VAULT_STATE_TONE[state]}">${esc(VAULT_STATE_LABEL[state])}</span>
        <span class="badge">${secretCount} rahasia tersimpan</span>
      </div>
    </div>
    <p class="page-sub" style="margin-bottom:12px">
      Password disimpan dengan enkripsi <strong>AES-GCM 256</strong>. Kuncinya diturunkan dari master password
      memakai <strong>PBKDF2 250.000 iterasi</strong>. Master password tidak pernah dikirim ke server dan tidak
      disimpan di mana pun.
    </p>
    ${
      state === 'unset'
        ? `<div class="vault-banner is-warn" style="margin-bottom:12px">
             ${icon('alert', 16)}
             <span>Vault belum dibuat. Buat master password dulu sebelum menyimpan password apa pun.</span>
           </div>`
        : ''
    }
    <div class="page-actions">
      ${
        state === 'unlocked'
          ? `<button type="button" class="btn btn-outline" data-vault="lock">${icon('lock', 16)}<span>Kunci Vault</span></button>`
          : `<button type="button" class="btn btn-primary" data-vault="open">${icon('vault', 16)}<span>${state === 'unset' ? 'Buat Vault' : 'Buka Vault'}</span></button>`
      }
      ${
        state === 'unset'
          ? ''
          : `<button type="button" class="btn btn-outline" data-vault="change">${icon('keyRound', 16)}<span>Ganti Master Password</span></button>`
      }
    </div>`;

  container.querySelector('[data-vault="open"]')?.addEventListener('click', async () => {
    await openVaultGate();
    await renderVaultSection(container);
  });

  container.querySelector('[data-vault="lock"]')?.addEventListener('click', async () => {
    lock();
    toast('Vault dikunci.', 'info');
    await renderVaultSection(container);
  });

  container.querySelector('[data-vault="change"]')?.addEventListener('click', async () => {
    await openChangeMasterPasswordFlow();
    await renderVaultSection(container);
  });
}

async function openChangeMasterPasswordFlow(): Promise<void> {
  const ready = await openVaultGate();
  if (!ready) return;

  const body = document.createElement('div');
  body.innerHTML = `
    <form class="form" data-change-form novalidate>
      <div class="vault-banner">
        ${icon('vault', 16)}
        <span>Semua rahasia akan dibuka dengan master password lama lalu dienkripsi ulang dengan yang baru. Proses ini tidak mengubah isi password kamu.</span>
      </div>
      ${passwordFieldHtml('current-password', 'Master Password Saat Ini', 'current-password')}
      ${passwordFieldHtml('new-password', 'Master Password Baru', 'new-password')}
      <div data-strength></div>
      ${passwordFieldHtml('confirm-password', 'Ulangi Master Password Baru', 'new-password')}
    </form>`;

  const footer = document.createElement('div');
  footer.className = 'modal-actions';
  footer.innerHTML = `
    <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
    <button type="button" class="btn btn-primary" data-submit>${icon('check', 16)}<span>Ganti Master Password</span></button>`;

  const handle = openModal({
    title: 'Ganti Master Password',
    subtitle: 'Semua password tersimpan akan dienkripsi ulang.',
    body,
    footer,
    size: 'sm',
  });

  bindRevealButtons(body);
  const currentInput = body.querySelector<HTMLInputElement>('#current-password') as HTMLInputElement;
  const newInput = body.querySelector<HTMLInputElement>('#new-password') as HTMLInputElement;
  const confirmInput = body.querySelector<HTMLInputElement>('#confirm-password') as HTMLInputElement;
  const strengthSlot = body.querySelector<HTMLElement>('[data-strength]') as HTMLElement;
  const submit = footer.querySelector<HTMLButtonElement>('[data-submit]');

  newInput.addEventListener('input', () => {
    strengthSlot.innerHTML = newInput.value ? strengthHtml(newInput.value) : '';
  });

  submit?.addEventListener('click', async () => {
    for (const id of ['current-password', 'new-password', 'confirm-password']) clearFieldError(body, id);

    if (!currentInput.value) {
      showFieldError(body, 'current-password', 'Isi master password saat ini.');
      currentInput.focus();
      return;
    }
    if (newInput.value.length < 8) {
      showFieldError(body, 'new-password', 'Master password baru minimal 8 karakter.');
      newInput.focus();
      return;
    }
    if (newInput.value !== confirmInput.value) {
      showFieldError(body, 'confirm-password', 'Kedua isian tidak sama.');
      confirmInput.focus();
      return;
    }

    setBusy(submit, true, 'Mengenkripsi ulang…');
    try {
      const total = await changeMasterPassword(currentInput.value, newInput.value);
      handle.close();
      toast(`${total} rahasia berhasil dienkripsi ulang dengan master password baru.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('saat ini salah')) {
        showFieldError(body, 'current-password', message);
        currentInput.select();
      } else {
        showError(error, 'Gagal mengganti master password.');
      }
    } finally {
      setBusy(submit, false);
    }
  });

  footer.querySelector('[data-cancel]')?.addEventListener('click', () => handle.close());
  currentInput.focus();
}

export { isUnlocked, VAULT_STATE_LABEL };
