/**
 * Halaman Pengaturan: Profil, Tampilan, Keamanan, Backup & Export, Data Demo,
 * dan informasi mode penyimpanan.
 */

import { activeCounts, backupFilename, db, downloadJson, exportBackup, isLocalMode, MODE } from '../store';
import { currentSession } from '../session';
import { getThemePref, setThemePref, type ThemePref } from '../theme';
import { confirmDialog, esc, formatDateTime, icon, openModal, showError, toast } from '../ui';
import { bootPage, setBusy } from '../boot';
import { RESOURCES, RESOURCE_LIST } from '../resources';
import { renderVaultSection } from '../vault-ui';
import type { BackupPayload } from '../types';

const THEMES: { value: ThemePref; label: string; iconName: string }[] = [
  { value: 'light', label: 'Terang', iconName: 'sun' },
  { value: 'dark', label: 'Gelap', iconName: 'moon' },
  { value: 'system', label: 'Mengikuti Sistem', iconName: 'monitor' },
];

/* ------------------------------------------------------------- profil */

async function renderProfile(): Promise<void> {
  const session = await currentSession();
  const profile = await db.getProfile().catch(() => null);

  const nameInput = document.getElementById('settings-name') as HTMLInputElement | null;
  const emailInput = document.getElementById('settings-email') as HTMLInputElement | null;
  const avatar = document.getElementById('settings-avatar');

  const name = profile?.name ?? session?.name ?? '';
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = profile?.email ?? session?.email ?? '';
  if (avatar) {
    avatar.textContent = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '·';
  }
}

/* ------------------------------------------------------------ tampilan */

function renderTheme(): void {
  const container = document.getElementById('settings-theme');
  if (!container) return;
  const current = getThemePref();
  container.innerHTML = THEMES.map(
    (theme) =>
      `<button type="button" class="btn ${current === theme.value ? 'btn-primary' : 'btn-outline'}" data-theme-value="${theme.value}">
        ${icon(theme.iconName, 16)}<span>${esc(theme.label)}</span>
      </button>`,
  ).join('');
}

/* ------------------------------------------------------- ringkasan data */

async function renderDataSummary(): Promise<void> {
  const container = document.getElementById('settings-summary');
  if (!container) return;
  container.innerHTML = `<div class="loading-state"><span class="spinner"></span><span>Menghitung data…</span></div>`;

  try {
    const counts = await activeCounts();
    const archivedEntries = await Promise.all(
      RESOURCE_LIST.map(async (def) => [def.name, await db.count(def.name, { archived: true })] as const),
    );
    const archived = Object.fromEntries(archivedEntries) as Record<string, number>;

    container.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Jenis Data</th><th>Aktif</th><th>Arsip</th><th>Halaman</th></tr>
          </thead>
          <tbody>
            ${RESOURCE_LIST.map(
              (def) => `
              <tr>
                <td><span class="item-meta">${icon(def.icon, 15)}<span>${esc(def.plural)}</span></span></td>
                <td>${counts[def.name]}</td>
                <td>${archived[def.name] ?? 0}</td>
                <td><a class="section-link" href="${def.route}">Buka</a></td>
              </tr>`,
            ).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (error) {
    container.innerHTML = `<p class="page-sub">Ringkasan data tidak dapat dimuat.</p>`;
    showError(error, 'Gagal menghitung data.');
  }
}

/* -------------------------------------------------------------- export */

async function handleExport(button: HTMLButtonElement | null): Promise<void> {
  setBusy(button, true, 'Menyiapkan…');
  try {
    const payload = await exportBackup();
    downloadJson(backupFilename(), payload);
    const total = Object.values(payload.data).reduce(
      (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
      0,
    );
    toast(`Backup berhasil dibuat (${total} data).`);
  } catch (error) {
    showError(error, 'Gagal membuat backup.');
  } finally {
    setBusy(button, false);
  }
}

async function handleImport(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith('.json')) {
    toast('Pilih berkas JSON hasil backup.', 'error');
    return;
  }
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as BackupPayload;
    if (!parsed || parsed.app !== 'PERSONAL OS' || typeof parsed.data !== 'object') {
      toast('Berkas ini bukan backup PERSONAL OS yang valid.', 'error');
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Pulihkan dari backup?',
      message:
        'Data dari berkas backup akan ditambahkan. Data yang sudah ada dengan ID sama akan dilewati, jadi tidak ada yang tertimpa.',
      confirmLabel: 'Ya, pulihkan',
    });
    if (!confirmed) return;

    const result = await db.importAll(parsed);
    toast(`${result.imported} data berhasil dipulihkan.`);
    await Promise.all([renderDataSummary(), renderActivity()]);
  } catch (error) {
    showError(error, 'Berkas backup tidak dapat dibaca.');
  }
}

/* ------------------------------------------------------------- aktivitas */

async function renderActivity(): Promise<void> {
  const container = document.getElementById('settings-activity');
  if (!container) return;
  try {
    const logs = await db.listActivity(12);
    container.innerHTML =
      logs.length === 0
        ? `<p class="page-sub">Belum ada aktivitas tercatat.</p>`
        : `<div class="row-list">${logs
            .map(
              (log) => `
              <div class="row-item" style="cursor:default">
                <span class="row-icon">${icon('history', 16)}</span>
                <span class="row-main">
                  <span class="row-title">${esc(log.item_title || log.item_type)}</span>
                  <span class="row-sub">${esc(describeAction(log.action))} · ${esc(log.item_type)}</span>
                </span>
                <span class="row-time">${esc(formatDateTime(log.created_at))}</span>
              </div>`,
            )
            .join('')}</div>`;
  } catch {
    container.innerHTML = `<p class="page-sub">Riwayat aktivitas tidak tersedia.</p>`;
  }
}

function describeAction(action: string): string {
  const map: Record<string, string> = {
    create: 'Dibuat',
    update: 'Diperbarui',
    delete: 'Dihapus',
    archive: 'Diarsipkan',
    restore: 'Dipulihkan',
    version: 'Versi prompt',
    seed: 'Data demo dimuat',
    import: 'Data dipulihkan',
  };
  return map[action] ?? action;
}

/* ------------------------------------------------------------- keamanan */

function renderSecurity(): void {
  const container = document.getElementById('settings-security');
  if (!container) return;

  if (isLocalMode) {
    container.innerHTML = `
      <p class="page-sub">
        Mode Lokal tidak memakai password untuk masuk. Yang melindungi password akunmu adalah
        <strong>master password vault</strong> (lihat bagian Vault Password di atas), dan master password itu tidak
        disimpan di mana pun.
      </p>
      <div class="banner">
        ${icon('alert', 16)}
        <span>
          Karena tidak ada server, keamanan bergantung pada perangkat ini. Kalau perangkat dipakai bersama,
          gunakan mode Supabase dengan <strong>Row Level Security</strong> dan password akun.
        </span>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="form-grid">
      <div class="field is-full">
        <label class="field-label" for="settings-reset-email">Email untuk reset password</label>
        <div class="item-meta" style="flex-wrap:nowrap">
          <input type="email" id="settings-reset-email" class="input" placeholder="nama@email.com" />
          <button type="button" class="btn btn-outline" id="settings-reset">${icon('key', 16)}<span>Kirim</span></button>
        </div>
        <p class="field-help">Supabase akan mengirim tautan untuk membuat password baru.</p>
      </div>
    </div>
    <ul class="page-sub" style="margin-top:10px;padding-left:18px;line-height:1.8">
      <li>Setiap baris data punya kolom <code>user_id</code> dan dilindungi kebijakan <strong>Row Level Security</strong>.</li>
      <li>Frontend memakai <code>anon key</code> yang memang publik. Service Role Key tidak pernah dipakai di browser.</li>
      <li>Berkas dokumen disimpan di bucket privat, hanya bisa diakses lewat signed URL berumur pendek.</li>
      <li>Password akun disimpan <strong>terenkripsi</strong> di tabel <code>secrets</code> (AES-GCM 256). Server hanya
          menerima ciphertext; master password tidak pernah dikirim ke mana pun.</li>
    </ul>`;
}

/* ---------------------------------------------------------------- init */

export async function initSettingsPage(): Promise<void> {
  await bootPage(async () => {
    const modeBadge = document.getElementById('settings-mode');
    if (modeBadge) {
      modeBadge.textContent = MODE === 'supabase' ? 'Supabase' : 'Mode Lokal';
      modeBadge.className = `badge ${MODE === 'supabase' ? 'badge-ok' : 'badge-warn'}`;
    }

    await renderProfile();
    renderTheme();
    renderSecurity();

    const vaultSlot = document.getElementById('settings-vault');
    if (vaultSlot) {
      try {
        await renderVaultSection(vaultSlot);
      } catch (error) {
        vaultSlot.innerHTML = `<p class="page-sub">Bagian vault tidak dapat dimuat.</p>`;
        showError(error, 'Gagal memuat bagian vault.');
      }
    }

    const demoBanner = document.getElementById('settings-demo-note');
    if (demoBanner && isLocalMode) {
      demoBanner.textContent =
        'Data demo mencakup 3 project, 3 prompt, 3 catatan, 3 link, 2 account, 3 tugas, dan 3 snippet. Semuanya ditandai sebagai data demo sehingga bisa dihapus sekali klik.';
    }

    await Promise.all([renderDataSummary(), renderActivity()]);

    const saveProfile = document.getElementById('settings-save-profile') as HTMLButtonElement | null;
    saveProfile?.addEventListener('click', async () => {
      const nameInput = document.getElementById('settings-name') as HTMLInputElement;
      setBusy(saveProfile, true, 'Menyimpan…');
      try {
        await db.updateProfile({ full_name: nameInput.value.trim() });
        toast('Profil berhasil disimpan.');
        await renderProfile();
      } catch (error) {
        showError(error, 'Gagal menyimpan profil.');
      } finally {
        setBusy(saveProfile, false);
      }
    });

    document.getElementById('settings-theme')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-theme-value]');
      if (!button) return;
      const value = button.dataset.themeValue as ThemePref;
      setThemePref(value);
      renderTheme();
      toast(`Tampilan: ${THEMES.find((theme) => theme.value === value)?.label ?? value}.`, 'info');
    });

    document.getElementById('settings-reset')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const email = (document.getElementById('settings-reset-email') as HTMLInputElement | null)?.value.trim() ?? '';
      if (!email) {
        toast('Isi email terlebih dahulu.', 'error');
        return;
      }
      setBusy(button, true, 'Mengirim…');
      try {
        await db.sendPasswordReset(email);
        toast('Email reset password sudah dikirim. Periksa kotak masuk.');
      } catch (error) {
        showError(error, 'Gagal mengirim email reset password.');
      } finally {
        setBusy(button, false);
      }
    });

    const exportButton = document.getElementById('settings-export') as HTMLButtonElement | null;
    exportButton?.addEventListener('click', () => void handleExport(exportButton));

    const importInput = document.getElementById('settings-import') as HTMLInputElement | null;
    importInput?.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (file) await handleImport(file);
      importInput.value = '';
    });

    document.getElementById('settings-seed')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      setBusy(button, true, 'Memuat…');
      try {
        await db.seedDemo();
        toast('Data demo berhasil dimuat.');
        await Promise.all([renderDataSummary(), renderActivity()]);
      } catch (error) {
        showError(error, 'Gagal memuat data demo.');
      } finally {
        setBusy(button, false);
      }
    });

    document.getElementById('settings-delete-demo')?.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Hapus semua data demo?',
        message: 'Hanya data yang ditandai sebagai data demo yang akan dihapus. Data milikmu sendiri tidak tersentuh.',
        confirmLabel: 'Hapus data demo',
        danger: true,
      });
      if (!confirmed) return;
      try {
        await db.deleteDemo();
        toast('Data demo berhasil dihapus.');
        await Promise.all([renderDataSummary(), renderActivity()]);
      } catch (error) {
        showError(error, 'Gagal menghapus data demo.');
      }
    });

    if (isLocalMode) {
      document.getElementById('settings-wipe')?.addEventListener('click', async () => {
        const modal = openModal({
          title: 'Reset Mode Lokal',
          subtitle: 'Tindakan ini tidak bisa dibatalkan.',
          size: 'sm',
          body: `<p class="modal-text">Semua data di perangkat ini akan dihapus, termasuk berkas yang tersimpan. Ketik <strong>HAPUS</strong> untuk melanjutkan.</p>
            <div class="field" style="margin-top:12px">
              <input type="text" class="input" id="wipe-confirm" placeholder="HAPUS" />
            </div>`,
          footer: `<div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
            <button type="button" class="btn btn-danger" data-confirm>Reset sekarang</button>
          </div>`,
        });

        const footer = modal.element.querySelector('.modal-footer');
        footer?.querySelector('[data-cancel]')?.addEventListener('click', () => modal.close());
        footer?.querySelector('[data-confirm]')?.addEventListener('click', async () => {
          const value = (modal.element.querySelector('#wipe-confirm') as HTMLInputElement | null)?.value.trim().toUpperCase() ?? '';
          if (value !== 'HAPUS') {
            toast('Ketik HAPUS untuk mengonfirmasi.', 'error');
            return;
          }
          try {
            await db.wipeAll();
            modal.close();
            toast('Semua data lokal berhasil dihapus.');
            window.setTimeout(() => window.location.assign('/masuk'), 600);
          } catch (error) {
            showError(error, 'Gagal menghapus data.');
          }
        });
      });
    } else {
      const wipeSection = document.getElementById('settings-wipe-section');
      if (wipeSection) wipeSection.hidden = true;
    }

    const modeNote = document.getElementById('settings-mode-note');
    if (modeNote) {
      modeNote.innerHTML = isLocalMode
        ? 'Data disimpan di <code>localStorage</code> (metadata) dan <code>IndexedDB</code> (berkas) pada perangkat ini.'
        : 'Data disimpan di <strong>Supabase</strong>: PostgreSQL untuk data teks dan Supabase Storage untuk berkas.';
    }
  });
}

export { RESOURCES };
