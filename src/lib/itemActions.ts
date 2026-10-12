/**
 * Aksi bersama untuk satu item: form buat/ubah, unggah dokumen, versi prompt,
 * favorit, arsip, dan hapus.
 *
 * Dipakai oleh halaman resource (Prompt, Dokumen, dst.), halaman Favorit, dan
 * halaman Arsip — sehingga tidak ada UI yang terduplikasi.
 */

import { RESOURCES } from './resources';
import { db } from './store';
import { bindForm, focusFirstError, formHtml, readForm } from './forms';
import { openDetailModal, openDocumentFile } from './detail';
import { openSecretsModal, openVaultGate } from './vault-ui';
import { decryptSecret, encryptSecret, ensureUnlocked } from './vault';
import {
  confirmDialog, esc, formatRelative, icon, openModal, showError, toast,
} from './ui';
import { setBusy } from './boot';
import type { Account, ResourceName, Tag } from './types';

type Row = Record<string, unknown>;

export interface ProjectOption {
  id: string;
  name: string;
  color: string;
}

export interface ActionContext {
  projects: ProjectOption[];
  row?: Row;
  onChanged: () => Promise<void> | void;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/* ------------------------------------------------------- form buat/ubah */

export async function openFormModal(
  resource: ResourceName,
  options: {
    id?: string;
    projects: ProjectOption[];
    onSaved: () => Promise<void> | void;
    /** Nilai awal untuk data baru, misalnya project_id dari halaman detail Project. */
    prefill?: Record<string, unknown>;
    /**
     * Nilai yang selalu ditambahkan saat MEMBUAT data baru, tapi tidak
     * ditampilkan sebagai kolom di form. Dipakai untuk `hidden: true` supaya
     * item baru langsung masuk Secret.
     */
    createDefaults?: Record<string, unknown>;
  },
): Promise<void> {
  const def = RESOURCES[resource];
  const id = options.id;
  let values: Row = options.id ? {} : { ...(options.prefill ?? {}) };
  let existingTags: Tag[] = [];

  if (id) {
    const loaded = (await db.get(resource, id)) as unknown as Row | null;
    if (!loaded) {
      toast('Data tidak ditemukan. Mungkin sudah dihapus.', 'error');
      return;
    }
    values = loaded;
    try {
      existingTags = await db.tagsFor(def.tagType, id);
    } catch {
      existingTags = [];
    }

    // Isi field rahasia dengan nilai aslinya, tapi hanya kalau vault sudah
    // terbuka. Kalau terkunci, field dibiarkan kosong dan isi lama tetap utuh.
    const secretFields = def.fields.filter((field) => field.type === 'secret');
    if (secretFields.length > 0 && (await ensureUnlocked())) {
      try {
        const secrets = await db.listSecrets(id);
        for (const field of secretFields) {
          const secret = secrets.find((entry) => entry.label === field.label);
          if (!secret) continue;
          values[field.name] = await decryptSecret({ ciphertext: secret.ciphertext, iv: secret.iv });
        }
      } catch {
        /* biarkan kosong kalau gagal dibuka */
      }
    }
  }

  const body = document.createElement('div');
  body.innerHTML = formHtml(resource, { values, projects: options.projects, tags: existingTags });
  const form = body.querySelector('form');
  if (!form) return;
  bindForm(form);
  form.dataset.autosaveShortcut = '';

  const footer = document.createElement('div');
  footer.className = 'modal-actions';
  footer.innerHTML = `
    <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
    <button type="submit" class="btn btn-primary" data-save>${icon('check', 16)}<span>${id ? 'Simpan Perubahan' : 'Simpan'}</span></button>`;

  const handle = openModal({
    title: id ? `Ubah ${def.singular}` : `${def.singular} Baru`,
    subtitle: def.subtitle,
    body,
    footer,
    size: 'lg',
  });

  const saveButton = footer.querySelector<HTMLButtonElement>('[data-save]');
  let saving = false;

  const save = async () => {
    if (saving) return;
    const result = readForm(form, resource);
    if (Object.keys(result.errors).length > 0) {
      focusFirstError(form);
      toast('Periksa kembali isian yang ditandai.', 'error');
      return;
    }

    const filledSecrets = Object.entries(result.secrets)
      .map(([key, value]) => [key, typeof value === 'string' ? value : ''] as const)
      .filter(([, value]) => value.trim().length > 0);

    // Vault harus terbuka SEBELUM apa pun disimpan. Kalau pengguna membatalkan,
    // penyimpanan dibatalkan seluruhnya supaya password yang sudah diketik tidak
    // hilang diam-diam.
    if (filledSecrets.length > 0) {
      const ready = (await ensureUnlocked()) || (await openVaultGate());
      if (!ready) {
        toast('Vault harus dibuka untuk menyimpan password. Penyimpanan dibatalkan.', 'error');
        return;
      }
    }

    saving = true;
    setBusy(saveButton, true, 'Menyimpan…');
    let secretWarning = '';
    try {
      let savedId = id ?? '';
      if (id) {
        await db.update(resource, id, result.values as never);
      } else {
        const created = (await db.create(resource, {
          ...(result.values as Record<string, unknown>),
          ...(options.createDefaults ?? {}),
        } as never)) as unknown as Row;
        savedId = text(created.id);
      }
      if (def.hasTags && savedId) await db.setTags(def.tagType, savedId, result.tags);

      if (savedId && filledSecrets.length > 0) {
        // Auto-lock 15 menit bisa terpicu selagi form masih terbuka. Pastikan
        // kunci masih ada; kalau tidak, data akun tetap tersimpan dan pengguna
        // diberi tahu bahwa password perlu disimpan ulang.
        const ready = (await ensureUnlocked()) || (await openVaultGate());
        if (ready) {
          const existingSecrets = await db.listSecrets(savedId);
          for (const [fieldName, plain] of filledSecrets) {
            const field = def.fields.find((entry) => entry.name === fieldName);
            if (!field) continue;
            const blob = await encryptSecret(plain);
            const existing = existingSecrets.find((entry) => entry.label === field.label);
            if (existing) {
              await db.updateSecret(existing.id, { ciphertext: blob.ciphertext, iv: blob.iv });
            } else {
              await db.createSecret({
                account_id: savedId,
                label: field.label,
                ciphertext: blob.ciphertext,
                iv: blob.iv,
              });
            }
          }
        } else {
          secretWarning = ' Data akun tersimpan, tetapi password belum — buka vault lalu simpan ulang.';
        }
      }

      await db.log(
        id ? 'update' : 'create',
        def.tagType,
        savedId || null,
        text(result.values.title ?? result.values.name ?? ''),
      );
      if (secretWarning) {
        toast(secretWarning, 'error');
      } else {
        toast(
          filledSecrets.length > 0
            ? `${def.singular} dan ${filledSecrets.length} rahasia berhasil disimpan (terenkripsi).`
            : id
              ? 'Berhasil disimpan.'
              : `${def.singular} berhasil dibuat.`,
        );
      }
      handle.close();
      await options.onSaved();
    } catch (error) {
      showError(error, 'Terjadi kesalahan saat menyimpan data. Silakan coba lagi.');
    } finally {
      saving = false;
      setBusy(saveButton, false);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void save();
  });
  // Tombol simpan berada di footer modal, di luar elemen <form>, jadi klik-nya
  // harus diteruskan ke form secara eksplisit.
  footer.querySelector('[data-save]')?.addEventListener('click', () => form.requestSubmit());
  footer.querySelector('[data-cancel]')?.addEventListener('click', () => handle.close());
}

/* --------------------------------------------------------- unggah berkas */

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'md', 'doc', 'xls'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function openUploadModal(
  projects: ProjectOption[],
  onSaved: () => Promise<void> | void,
): Promise<void> {
  const body = document.createElement('div');
  body.innerHTML = `
    <form class="form" data-upload-form novalidate>
      <label class="dropzone" data-dropzone>
        <span class="row-icon">${icon('upload', 18)}</span>
        <span class="dropzone-title">Pilih berkas atau tarik ke sini</span>
        <span class="dropzone-hint">PDF, DOCX, XLSX, CSV, TXT, MD · maksimal 10 MB</span>
        <input type="file" hidden data-file-input accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.doc,.xls" />
      </label>
      <div data-file-chip></div>
      <div class="form-grid">
        <div class="field is-full">
          <label class="field-label" for="upload-title">Judul<span class="req">*</span></label>
          <input type="text" id="upload-title" class="input" name="title" placeholder="Contoh: Supabase Setup" />
          <p class="field-error" data-error-for="title" hidden></p>
        </div>
        <div class="field is-full">
          <label class="field-label" for="upload-description">Deskripsi</label>
          <textarea id="upload-description" class="textarea" name="description" rows="2" placeholder="Isi berkas ini tentang apa?"></textarea>
        </div>
        <div class="field">
          <label class="field-label" for="upload-category">Kategori</label>
          <select id="upload-category" class="select" name="category">
            ${['EDUCATION', 'WORK', 'DEVELOPMENT', 'ADMINISTRATION', 'REFERENCE', 'OTHER']
              .map((value) => `<option value="${value}">${esc(value)}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="upload-project">Project</label>
          <select id="upload-project" class="select" name="project_id">
            <option value="">Tanpa project</option>
            ${projects.map((project) => `<option value="${esc(project.id)}">${esc(project.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field is-full">
          <label class="field-label" for="upload-tags">Tag</label>
          <div class="tag-input-wrap" data-tag-input>
            <input type="text" id="upload-tags" placeholder="Tambah tag lalu tekan Enter" autocomplete="off" />
          </div>
          <p class="field-help">Pisahkan dengan koma atau Enter.</p>
        </div>
      </div>
    </form>`;

  const footer = document.createElement('div');
  footer.className = 'modal-actions';
  footer.innerHTML = `
    <button type="button" class="btn btn-ghost" data-cancel>Batal</button>
    <button type="button" class="btn btn-primary" data-save>${icon('upload', 16)}<span>Unggah</span></button>`;

  const handle = openModal({
    title: 'Unggah Dokumen',
    subtitle: 'Berkas hanya bisa diakses oleh akunmu.',
    body,
    footer,
    size: 'lg',
  });

  const form = body.querySelector('form') as HTMLFormElement;
  const dropzone = body.querySelector<HTMLElement>('[data-dropzone]') as HTMLElement;
  const fileInput = body.querySelector<HTMLInputElement>('[data-file-input]') as HTMLInputElement;
  const chip = body.querySelector<HTMLElement>('[data-file-chip]') as HTMLElement;
  const titleInput = body.querySelector<HTMLInputElement>('#upload-title') as HTMLInputElement;
  bindForm(form);

  let file: File | null = null;

  const acceptFile = (selected: File | undefined) => {
    if (!selected) return;
    const extension = (selected.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      toast('Jenis berkas ini tidak diizinkan. Gunakan PDF, DOCX, XLSX, CSV, TXT, atau MD.', 'error');
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      toast('Ukuran berkas terlalu besar. Maksimal 10 MB.', 'error');
      return;
    }
    file = selected;
    chip.innerHTML = `<div class="file-chip">
      <span class="row-icon">${icon('file', 16)}</span>
      <span class="row-main">
        <span class="row-title">${esc(selected.name)}</span>
        <span class="row-sub">${esc((selected.size / 1024).toFixed(0))} KB</span>
      </span>
      <button type="button" class="icon-button is-danger" data-clear-file aria-label="Batalkan berkas">${icon('close', 16)}</button>
    </div>`;
    if (!titleInput.value.trim()) titleInput.value = selected.name.replace(/\.[^.]+$/, '');
    chip.querySelector('[data-clear-file]')?.addEventListener('click', () => {
      file = null;
      chip.innerHTML = '';
      fileInput.value = '';
    });
  };

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => acceptFile(fileInput.files?.[0]));
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-over');
    acceptFile(event.dataTransfer?.files?.[0]);
  });

  const saveButton = footer.querySelector<HTMLButtonElement>('[data-save]');
  let saving = false;

  const upload = async () => {
    if (saving) return;
    const errorSlot = body.querySelector<HTMLElement>('[data-error-for="title"]');
    const title = titleInput.value.trim();

    if (!file) {
      toast('Pilih berkas terlebih dahulu.', 'error');
      return;
    }
    if (!title) {
      if (errorSlot) {
        errorSlot.textContent = 'Judul wajib diisi.';
        errorSlot.hidden = false;
      }
      titleInput.setAttribute('aria-invalid', 'true');
      titleInput.focus();
      return;
    }
    if (errorSlot) errorSlot.hidden = true;
    titleInput.removeAttribute('aria-invalid');

    saving = true;
    setBusy(saveButton, true, 'Mengunggah…');
    try {
      const selected = file;
      const extension = (selected.name.split('.').pop() ?? '').toLowerCase();
      const key = `${Date.now()}-${selected.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80)}`;
      const uploaded = await db.uploadFile(selected, key);

      const category = (body.querySelector<HTMLSelectElement>('#upload-category') as HTMLSelectElement).value;
      const projectId = (body.querySelector<HTMLSelectElement>('#upload-project') as HTMLSelectElement).value;
      const description = (body.querySelector<HTMLTextAreaElement>('#upload-description') as HTMLTextAreaElement).value.trim();

      const created = (await db.create('documents', {
        title,
        description,
        category,
        project_id: projectId || null,
        file_path: uploaded.path,
        file_type: extension.toUpperCase(),
        file_size: selected.size,
      } as never)) as unknown as Row;

      const tagWrapper = body.querySelector<HTMLElement>('[data-tag-input]');
      const tagNames = tagWrapper
        ? Array.from(tagWrapper.querySelectorAll('[data-tag-chip]')).map((chipEl) => String(chipEl.getAttribute('data-value') ?? ''))
        : [];
      if (tagNames.length > 0) await db.setTags('document', text(created.id), tagNames);

      toast('Dokumen berhasil diunggah.');
      handle.close();
      await onSaved();
    } catch (error) {
      showError(error, 'Gagal mengunggah dokumen. Silakan coba lagi.');
    } finally {
      saving = false;
      setBusy(saveButton, false);
    }
  };

  footer.querySelector('[data-cancel]')?.addEventListener('click', () => handle.close());
  saveButton?.addEventListener('click', () => void upload());
}

/* ----------------------------------------------------------- versi prompt */

export async function openVersionsModal(promptId: string, onChanged: () => Promise<void> | void): Promise<void> {
  const prompt = (await db.get('prompts', promptId)) as unknown as Row | null;
  if (!prompt) {
    toast('Prompt tidak ditemukan.', 'error');
    return;
  }

  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '14px';

  openModal({ title: 'Versi Prompt', subtitle: text(prompt.title), body, size: 'lg' });

  const renderVersions = async () => {
    const versions = await db.listVersions(promptId);
    body.innerHTML = `
      <form class="form" data-version-form>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="version-label">Label Versi</label>
            <input type="text" id="version-label" class="input" name="label" placeholder="Contoh: Perbaikan struktur" />
          </div>
          <div class="field">
            <label class="field-label" for="version-note">Catatan</label>
            <input type="text" id="version-note" class="input" name="note" placeholder="Apa yang berubah?" />
          </div>
          <div class="field is-full">
            <label class="field-label" for="version-content">Isi Prompt</label>
            <textarea id="version-content" class="textarea mono" name="content" rows="6">${esc(text(prompt.prompt_content))}</textarea>
          </div>
          <div class="field is-full">
            <label class="field-label" for="version-negative">Negative Prompt</label>
            <textarea id="version-negative" class="textarea mono" name="negative_prompt" rows="2">${esc(text(prompt.negative_prompt))}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${icon('plus', 16)}<span>Buat Versi Baru</span></button>
        </div>
      </form>
      <hr class="divider" />
      <div class="version-list">
        ${
          versions.length === 0
            ? '<p class="page-sub">Belum ada versi tersimpan. Versi pertama akan dibuat saat kamu menyimpan di atas.</p>'
            : versions
                .map(
                  (version) => `
          <div class="version-item ${version.is_current ? 'is-current' : ''}" data-version-id="${esc(version.id)}">
            <div class="version-head">
              <span class="version-number">v${version.version_number}</span>
              ${version.is_current ? '<span class="badge badge-accent">Versi saat ini</span>' : ''}
              ${version.label ? `<span class="badge">${esc(version.label)}</span>` : ''}
              <span class="row-time" style="margin-left:auto">${esc(formatRelative(version.created_at))}</span>
            </div>
            ${version.note ? `<p class="row-sub">${esc(version.note)}</p>` : ''}
            <div class="version-body">${esc(version.content)}</div>
            <div class="item-actions" style="border:0;padding-top:0;margin:0">
              <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(version.content)}" data-copy-message="Isi versi berhasil disalin.">${icon('copy', 15)}<span>Salin</span></button>
              ${version.is_current ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-version-current>${icon('check', 15)}<span>Jadikan saat ini</span></button>`}
              <button type="button" class="btn btn-ghost btn-sm" data-version-edit>${icon('edit', 15)}<span>Ubah label</span></button>
              <button type="button" class="btn btn-ghost btn-sm" data-version-duplicate>${icon('copy', 15)}<span>Duplikat</span></button>
              <button type="button" class="btn btn-ghost btn-sm" data-version-delete>${icon('trash', 15)}<span>Hapus</span></button>
            </div>
          </div>`,
                )
                .join('')
        }
      </div>`;

    body.querySelector<HTMLFormElement>('[data-version-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const content = (body.querySelector<HTMLTextAreaElement>('#version-content') as HTMLTextAreaElement).value;
      if (!content.trim()) {
        toast('Isi prompt tidak boleh kosong.', 'error');
        return;
      }
      try {
        await db.createVersion(promptId, {
          content,
          label: (body.querySelector<HTMLInputElement>('#version-label') as HTMLInputElement).value.trim(),
          note: (body.querySelector<HTMLInputElement>('#version-note') as HTMLInputElement).value.trim(),
          negative_prompt: (body.querySelector<HTMLTextAreaElement>('#version-negative') as HTMLTextAreaElement).value,
        });
        await db.log('version', 'prompt', promptId, text(prompt.title));
        toast('Versi baru berhasil dibuat.');
        await renderVersions();
        await onChanged();
      } catch (error) {
        showError(error, 'Gagal membuat versi baru.');
      }
    });

    body.querySelectorAll<HTMLElement>('[data-version-id]').forEach((item) => {
      const versionId = item.getAttribute('data-version-id') ?? '';
      const versionContent = item.querySelector('.version-body')?.textContent ?? '';

      item.querySelector('[data-version-current]')?.addEventListener('click', async () => {
        try {
          await db.setCurrentVersion(promptId, versionId);
          toast('Versi ini sekarang menjadi versi saat ini.');
          await renderVersions();
          await onChanged();
        } catch (error) {
          showError(error, 'Gagal menetapkan versi.');
        }
      });

      item.querySelector('[data-version-edit]')?.addEventListener('click', async () => {
        const label = window.prompt('Label versi:', '');
        if (label === null) return;
        try {
          await db.updateVersion(versionId, { label: label.trim() });
          toast('Label versi berhasil diperbarui.');
          await renderVersions();
        } catch (error) {
          showError(error, 'Gagal memperbarui versi.');
        }
      });

      item.querySelector('[data-version-duplicate]')?.addEventListener('click', async () => {
        try {
          await db.createVersion(promptId, { content: versionContent, label: 'Duplikat' });
          toast('Versi berhasil diduplikasi.');
          await renderVersions();
          await onChanged();
        } catch (error) {
          showError(error, 'Gagal menduplikasi versi.');
        }
      });

      item.querySelector('[data-version-delete]')?.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: 'Hapus versi ini?',
          message: 'Versi yang dihapus tidak bisa dikembalikan.',
          confirmLabel: 'Hapus',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await db.deleteVersion(versionId);
          toast('Versi berhasil dihapus.');
          await renderVersions();
        } catch (error) {
          showError(error, 'Gagal menghapus versi.');
        }
      });
    });
  };

  await renderVersions();
}

/* ------------------------------------------------------------ aksi item */

export async function handleItemAction(
  resource: ResourceName,
  action: string,
  id: string,
  context: ActionContext,
): Promise<void> {
  const def = RESOURCES[resource];
  const row = context.row;
  const label = text(row?.title ?? row?.name ?? row?.service ?? '');

  switch (action) {
    case 'new':
      if (resource === 'documents') await openUploadModal(context.projects, context.onChanged);
      else await openFormModal(resource, { projects: context.projects, onSaved: context.onChanged });
      return;

    case 'edit':
      await openFormModal(resource, { id, projects: context.projects, onSaved: context.onChanged });
      return;

    case 'detail':
      if (resource === 'projects') {
        window.location.assign(`/project/lihat?id=${encodeURIComponent(id)}`);
        return;
      }
      await openDetailModal(resource, id, {
        onChange: context.onChanged,
        onEdit: () => void openFormModal(resource, { id, projects: context.projects, onSaved: context.onChanged }),
      });
      return;

    case 'versions':
      await openVersionsModal(id, context.onChanged);
      return;

    case 'secrets': {
      const account = (await db.get('accounts', id)) as unknown as Account | null;
      if (!account) {
        toast('Account tidak ditemukan. Mungkin sudah dihapus.', 'error');
        return;
      }
      await openSecretsModal(account, { onChange: context.onChanged });
      return;
    }

    case 'favorite':
      try {
        const next = !Boolean(row?.favorite);
        await db.update(resource, id, { favorite: next } as never);
        toast(next ? 'Ditambahkan ke favorit.' : 'Dihapus dari favorit.');
        await context.onChanged();
      } catch (error) {
        showError(error, 'Gagal memperbarui favorit.');
      }
      return;

    /* -------------------------------------------------- secret */
    case 'hide': {
      const isProject = resource === 'projects';
      const confirmed = await confirmDialog({
        title: 'Pindahkan ke Secret?',
        message: isProject
          ? 'Project ini beserta seluruh prompt di dalamnya akan disembunyikan dari semua daftar, pencarian, dan statistik. Untuk membukanya lagi, gunakan Secret.'
          : 'Item ini akan disembunyikan dari semua daftar, pencarian, dan statistik. Untuk membukanya lagi, gunakan Secret.',
        confirmLabel: 'Sembunyikan',
      });
      if (!confirmed) return;
      try {
        await db.update(resource, id, { hidden: true } as never);
        let cascade = 0;
        if (isProject) {
          // Prompt di dalam project rahasia ikut disembunyikan — kalau tidak,
          // judulnya masih muncul di halaman Prompt dan itu membocorkan.
          const prompts = await db.list('prompts', { projectId: id, archived: null, includeHidden: true });
          for (const prompt of prompts) {
            if (prompt.hidden) continue;
            await db.update('prompts', prompt.id, { hidden: true } as never);
            cascade += 1;
          }
        }
        await db.log('hide', def.tagType, id, label);
        toast(
          cascade > 0
            ? `Disembunyikan ke Secret, termasuk ${cascade} prompt di dalamnya.`
            : 'Disembunyikan ke Secret.',
        );
        await context.onChanged();
      } catch (error) {
        showError(error, 'Gagal menyembunyikan data.');
      }
      return;
    }

    case 'unhide': {
      try {
        await db.update(resource, id, { hidden: false } as never);
        let cascade = 0;
        if (resource === 'projects') {
          const prompts = await db.list('prompts', { projectId: id, archived: null, includeHidden: true });
          for (const prompt of prompts) {
            if (!prompt.hidden) continue;
            await db.update('prompts', prompt.id, { hidden: false } as never);
            cascade += 1;
          }
        }
        await db.log('unhide', def.tagType, id, label);
        toast(
          cascade > 0
            ? `Dikeluarkan dari Secret, termasuk ${cascade} prompt di dalamnya.`
            : 'Dikeluarkan dari Secret.',
        );
        await context.onChanged();
      } catch (error) {
        showError(error, 'Gagal mengeluarkan data dari Secret.');
      }
      return;
    }

    case 'archive':
      try {
        await db.update(resource, id, { archived: true } as never);
        await db.log('archive', def.tagType, id, label);
        toast('Data diarsipkan. Kamu bisa memulihkannya dari halaman Arsip.');
        await context.onChanged();
      } catch (error) {
        showError(error, 'Gagal mengarsipkan data.');
      }
      return;

    case 'restore':
      try {
        await db.update(resource, id, { archived: false } as never);
        await db.log('restore', def.tagType, id, label);
        toast('Data berhasil dipulihkan.');
        await context.onChanged();
      } catch (error) {
        showError(error, 'Gagal memulihkan data.');
      }
      return;

    case 'delete': {
      const archived = Boolean(row?.archived);
      const confirmed = await confirmDialog({
        title: 'Hapus permanen?',
        message: archived
          ? 'Data ini akan dihapus permanen dan tidak bisa dikembalikan.'
          : 'Data ini akan dihapus permanen, bukan diarsipkan. Tindakan ini tidak bisa dibatalkan.',
        confirmLabel: 'Ya, hapus permanen',
        danger: true,
      });
      if (!confirmed) return;
      try {
        await db.remove(resource, id);
        await db.log('delete', def.tagType, null, label);
        toast('Data berhasil dihapus.');
        await context.onChanged();
      } catch (error) {
        showError(error, 'Gagal menghapus data.');
      }
      return;
    }

    case 'toggle-task': {
      try {
        const done = text(row?.status) === 'DONE';
        await db.update('tasks', id, { status: done ? 'TODO' : 'DONE' } as never);
        toast(done ? 'Tugas dibuka kembali.' : 'Tugas ditandai selesai.');
        await context.onChanged();
      } catch (error) {
        showError(error, 'Gagal memperbarui status tugas.');
      }
      return;
    }

    case 'open-file':
    case 'download': {
      if (!row) return;
      try {
        await openDocumentFile(row, action === 'download');
        if (action === 'download') toast('Unduhan dimulai.');
      } catch (error) {
        showError(error, 'Gagal membuka berkas.');
      }
      return;
    }

    default:
      return;
  }
}
