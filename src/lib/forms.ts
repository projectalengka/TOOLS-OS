/**
 * Mesin form generik.
 *
 * Semua resource (Project, Prompt, Dokumen, Catatan, Link, Accounts, Tugas,
 * Snippet) memakai renderer yang sama, sehingga tidak ada UI yang terduplikasi
 * dan aturan validasi konsisten di seluruh aplikasi.
 */

import { RESOURCES, label, type FieldDef, type ResourceDef } from './resources';
import { esc, icon, isEmail, safeUrl, parseTagsInput, copyText, toast } from './ui';
import { generatePassword } from './vault';
import type { ResourceName, Tag } from './types';

export interface FormOptions {
  values?: Record<string, unknown>;
  projects?: { id: string; name: string }[];
  tags?: Tag[];
}

type Values = Record<string, unknown>;

function fieldValue(values: Values, name: string, fallback: unknown): string {
  const value = values[name];
  if (value === undefined || value === null) return fallback == null ? '' : String(fallback);
  return String(value);
}

function renderField(field: FieldDef, options: FormOptions): string {
  const values = options.values ?? {};
  const id = `field-${field.name}`;
  const required = field.required ? '<span class="req" aria-hidden="true">*</span>' : '';
  const help = field.help ? `<p class="field-help">${esc(field.help)}</p>` : '';
  const errorSlot = `<p class="field-error" data-error-for="${field.name}" hidden></p>`;
  const wrapperClass = `field ${
    field.full || field.type === 'code' || field.type === 'markdown' || field.type === 'tags' || field.type === 'secret'
      ? 'is-full'
      : ''
  }`;

  let control = '';

  switch (field.type) {
    case 'textarea':
    case 'code':
    case 'markdown': {
      const rows = field.rows ?? (field.type === 'code' ? 6 : 4);
      const cls = field.type === 'code' ? 'textarea mono' : 'textarea';
      control = `<textarea id="${id}" name="${field.name}" class="${cls}" rows="${rows}"
        placeholder="${esc(field.placeholder ?? '')}" ${field.required ? 'required' : ''}>${esc(fieldValue(values, field.name, ''))}</textarea>`;
      break;
    }
    case 'select': {
      const current = fieldValue(values, field.name, field.options?.[0] ?? '');
      const opts = (field.options ?? [])
        .map((option) => `<option value="${esc(option)}" ${option === current ? 'selected' : ''}>${esc(label(option))}</option>`)
        .join('');
      control = `<select id="${id}" name="${field.name}" class="select">${opts}</select>`;
      break;
    }
    case 'project': {
      const current = fieldValue(values, field.name, '');
      const opts = (options.projects ?? [])
        .map((project) => `<option value="${esc(project.id)}" ${project.id === current ? 'selected' : ''}>${esc(project.name)}</option>`)
        .join('');
      control = `<select id="${id}" name="${field.name}" class="select"><option value="">${esc(field.placeholder ?? 'Tanpa project')}</option>${opts}</select>`;
      break;
    }
    case 'tags': {
      const chips = (options.tags ?? [])
        .map(
          (tag) => `<span class="tag" data-tag-chip data-value="${esc(tag.name)}">${esc(tag.name)}<button type="button" data-tag-remove aria-label="Hapus tag ${esc(tag.name)}">${icon('close', 12)}</button></span>`,
        )
        .join('');
      control = `
        <div class="tag-input-wrap" data-tag-input>
          ${chips}
          <input type="text" id="${id}" placeholder="Tambah tag lalu tekan Enter" autocomplete="off" />
        </div>`;
      break;
    }
    case 'secret': {
      const current = fieldValue(values, field.name, '');
      const hasValue = Boolean(current);
      control = `
        <div class="secret-input" data-secret-field>
          <input type="password" id="${id}" name="${field.name}" class="input mono"
            autocomplete="new-password" spellcheck="false"
            placeholder="${esc(field.placeholder ?? 'Belum ada isi')}" value="${esc(current)}" />
          <button type="button" class="icon-button" data-secret-reveal
            aria-label="Tampilkan isi" title="Tampilkan isi">${icon('eye', 16)}</button>
          <button type="button" class="icon-button" data-secret-generate
            aria-label="Buat password acak" title="Buat password acak">${icon('refresh', 16)}</button>
          <button type="button" class="icon-button" data-secret-copy
            aria-label="Salin isi" title="Salin isi">${icon('copy', 16)}</button>
        </div>
        ${hasValue ? '' : '<p class="field-help" data-secret-empty>Belum ada isi tersimpan untuk akun ini.</p>'}`;
      break;
    }
    case 'color': {
      const current = fieldValue(values, field.name, '#6366f1');
      control = `
        <div class="color-input">
          <input type="color" id="${id}" name="${field.name}" value="${esc(current)}" aria-label="${esc(field.label)}" />
          <input type="text" class="input mono" data-color-text value="${esc(current)}" aria-label="Kode warna" />
        </div>`;
      break;
    }
    default: {
      const type = field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text';
      control = `<input type="${type}" id="${id}" name="${field.name}" class="input"
        placeholder="${esc(field.placeholder ?? '')}" value="${esc(fieldValue(values, field.name, ''))}"
        ${field.required ? 'required' : ''} ${field.type === 'url' ? 'inputmode="url"' : ''} />`;
      break;
    }
  }

  const copyHint =
    field.copyable && field.type !== 'color'
      ? ''
      : '';

  return `<div class="${wrapperClass}" data-field="${field.name}">
    <label class="field-label" for="${id}">${esc(field.label)}${required}</label>
    ${control}
    ${errorSlot}
    ${help}
    ${copyHint}
  </div>`;
}

/** HTML lengkap sebuah form resource. */
export function formHtml(resource: ResourceName, options: FormOptions = {}): string {
  const def = RESOURCES[resource];
  const fields = [...def.fields];

  if (def.hasTags) {
    fields.push({
      name: '__tags',
      label: 'Tag',
      type: 'tags',
      help: 'Pisahkan dengan koma atau Enter. Tag yang sama tidak akan dibuat dua kali.',
    });
  }

  return `<form class="form" data-resource="${resource}" novalidate>
    <div class="form-grid">${fields.map((field) => renderField(field, options)).join('')}</div>
  </form>`;
}

/** Memasang perilaku interaktif di dalam form (warna, tag, penghitung). */
export function bindForm(form: HTMLFormElement): void {
  // Sinkronkan input warna dengan kode hex.
  form.querySelectorAll<HTMLElement>('[data-field="color"]').forEach((wrapper) => {
    const picker = wrapper.querySelector<HTMLInputElement>('input[type="color"]');
    const textInput = wrapper.querySelector<HTMLInputElement>('[data-color-text]');
    if (!picker || !textInput) return;
    picker.addEventListener('input', () => {
      textInput.value = picker.value;
    });
    textInput.addEventListener('input', () => {
      const value = textInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) picker.value = value;
    });
  });

  // Input tag: Enter atau koma menambah, Backspace menghapus tag terakhir.
  form.querySelectorAll<HTMLElement>('[data-tag-input]').forEach((wrapper) => {
    const input = wrapper.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input) return;

    const addChip = (raw: string) => {
      const name = raw.trim().replace(/^#+/, '').toLowerCase();
      if (!name) return;
      const exists = Array.from(wrapper.querySelectorAll('[data-tag-chip]')).some(
        (chip) => chip.getAttribute('data-value') === name,
      );
      if (exists) {
        input.value = '';
        return;
      }
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.setAttribute('data-tag-chip', '');
      chip.setAttribute('data-value', name);
      chip.innerHTML = `${esc(name)}<button type="button" data-tag-remove aria-label="Hapus tag ${esc(name)}">${icon('close', 12)}</button>`;
      wrapper.insertBefore(chip, input);
      input.value = '';
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        addChip(input.value);
      } else if (event.key === 'Backspace' && input.value === '') {
        const chips = wrapper.querySelectorAll('[data-tag-chip]');
        chips[chips.length - 1]?.remove();
      }
    });
    input.addEventListener('blur', () => addChip(input.value));

    wrapper.addEventListener('click', (event) => {
      const remove = (event.target as HTMLElement).closest('[data-tag-remove]');
      if (remove) {
        remove.closest('[data-tag-chip]')?.remove();
        input.focus();
      } else if (event.target === wrapper) {
        input.focus();
      }
    });
  });

  // Field rahasia: tampilkan/sembunyikan, buat password acak, salin.
  form.querySelectorAll<HTMLElement>('[data-secret-field]').forEach((wrapper) => {
    const input = wrapper.querySelector<HTMLInputElement>('input');
    if (!input) return;

    // Petunjuk "belum ada isi" harus hilang begitu pengguna mulai mengetik.
    const dropEmptyHint = () => {
      if (input.value) wrapper.parentElement?.querySelector('[data-secret-empty]')?.remove();
    };
    input.addEventListener('input', dropEmptyHint);
    dropEmptyHint();

    const setRevealed = (revealed: boolean) => {
      input.type = revealed ? 'text' : 'password';
      const revealButton = wrapper.querySelector<HTMLElement>('[data-secret-reveal]');
      if (revealButton) {
        revealButton.innerHTML = icon(revealed ? 'eyeOff' : 'eye', 16);
        const label = revealed ? 'Sembunyikan isi' : 'Tampilkan isi';
        revealButton.setAttribute('aria-label', label);
        revealButton.setAttribute('title', label);
      }
    };

    wrapper.querySelector('[data-secret-reveal]')?.addEventListener('click', () => {
      setRevealed(input.type === 'password');
    });

    wrapper.querySelector('[data-secret-generate]')?.addEventListener('click', async () => {
      input.value = generatePassword();
      setRevealed(true);
      wrapper.querySelector('[data-secret-empty]')?.remove();
      const copied = await copyText(input.value);
      toast(
        copied
          ? 'Password acak dibuat dan sudah disalin.'
          : 'Password acak dibuat. Salin dengan tombol di sebelahnya.',
        'info',
      );
    });

    wrapper.querySelector('[data-secret-copy]')?.addEventListener('click', async () => {
      if (!input.value) {
        toast('Belum ada isi untuk disalin.', 'error');
        return;
      }
      const copied = await copyText(input.value);
      toast(copied ? 'Berhasil disalin.' : 'Gagal menyalin. Salin manual ya.', copied ? 'success' : 'error');
    });
  });
}

export interface FormResult {
  values: Values;
  tags: string[];
  /** Isi field bertipe 'secret', dipisahkan karena harus dienkripsi dulu. */
  secrets: Values;
  errors: Record<string, string>;
}

/** Membaca isi form, menjalankan validasi, dan menampilkan pesan kesalahan. */
export function readForm(form: HTMLFormElement, resource: ResourceName): FormResult {
  const def: ResourceDef = RESOURCES[resource];
  const values: Values = {};
  const secrets: Values = {};
  const errors: Record<string, string> = {};

  const showError = (name: string, message: string) => {
    errors[name] = message;
    const slot = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    if (slot) {
      slot.textContent = message;
      slot.hidden = false;
    }
    form.querySelector(`[name="${name}"]`)?.setAttribute('aria-invalid', 'true');
  };

  for (const field of def.fields) {
    const element = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `[name="${field.name}"]`,
    );
    const raw = element ? element.value.trim() : '';

    const slot = form.querySelector<HTMLElement>(`[data-error-for="${field.name}"]`);
    if (slot) slot.hidden = true;
    element?.removeAttribute('aria-invalid');

    // Field rahasia tidak pernah masuk ke `values`: isinya dienkripsi lebih
    // dulu, lalu disimpan di tabel `secrets`.
    if (field.type === 'secret') {
      if (raw) secrets[field.name] = raw;
      continue;
    }

    if (field.required && !raw) {
      showError(field.name, `${field.label} wajib diisi.`);
      continue;
    }

    if (raw && field.type === 'url') {
      const url = safeUrl(raw);
      if (!url) {
        showError(field.name, 'URL tidak valid. Contoh: https://contoh.com');
        continue;
      }
      values[field.name] = url;
      continue;
    }

    if (raw && field.type === 'email' && !isEmail(raw)) {
      showError(field.name, 'Format email tidak valid.');
      continue;
    }

    if (field.type === 'project') {
      values[field.name] = raw || null;
      continue;
    }

    if (field.type === 'date') {
      values[field.name] = raw || null;
      continue;
    }

    values[field.name] = raw;
  }

  const tagWrapper = form.querySelector<HTMLElement>('[data-tag-input]');
  const tags = tagWrapper
    ? Array.from(tagWrapper.querySelectorAll('[data-tag-chip]')).map((chip) =>
        String(chip.getAttribute('data-value') ?? ''),
      ).filter(Boolean)
    : [];

  return { values, tags, secrets, errors };
}

/** Fokuskan field pertama yang bermasalah supaya pengguna tahu harus ke mana. */
export function focusFirstError(form: HTMLFormElement): void {
  const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  invalid?.focus();
  invalid?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function parseTagsString(value: string): string[] {
  return parseTagsInput(value);
}
