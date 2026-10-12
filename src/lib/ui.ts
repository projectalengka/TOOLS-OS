/**
 * Kumpulan utilitas UI bersama: ikon, toast, dialog, markdown, dan format.
 * Semua teks yang dilihat pengguna memakai Bahasa Indonesia.
 */

/* ------------------------------------------------------------- escaping */

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ ikon */

const ICON_PATHS: Record<string, string> = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8Z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  note: '<path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11l-5 5H7a2 2 0 0 1-2-2Z"/><path d="M14 20v-4a1 1 0 0 1 1-1h4"/>',
  link: '<path d="M10 13a4 4 0 0 0 5.7.3l3-3A4 4 0 0 0 13 4.7l-1.2 1.2"/><path d="M14 11a4 4 0 0 0-5.7-.3l-3 3A4 4 0 0 0 11 19.3l1.2-1.2"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
  code: '<path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9Z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1.5"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16Z"/><path d="m14 6 4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4 4.2 19.8M19.8 4.2l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M20 19v-4h-4"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  restore: '<path d="M4 10a8 8 0 1 1 2.3 5.7"/><path d="M4 5v5h5"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2"/><path d="m17 6 2 2"/><path d="m14 9 2 2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M19 17H6a2 2 0 0 0-2 2"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-2.6 3.3"/><path d="M6.6 7.6A16.7 16.7 0 0 0 2 12s3.6 6 10 6a10.6 10.6 0 0 0 4.3-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8V6.5M12 15.2v2.3"/>',
  wand: '<path d="M15 4V2M15 10V8M12.5 6h-2M19.5 6h-2"/><path d="M4 20 14 10"/><path d="m12.5 8.5 3 3"/>',
  keyRound: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M18 12v3"/><path d="M15 12v2"/>',
};

export function icon(name: string, size = 18, extraClass = ''): string {
  const path = ICON_PATHS[name] ?? ICON_PATHS.file;
  return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* ----------------------------------------------------------------- toast */

type ToastKind = 'success' | 'error' | 'info';

function toastContainer(): HTMLElement {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

export function toast(message: string, kind: ToastKind = 'success'): void {
  const container = toastContainer();
  const element = document.createElement('div');
  element.className = `toast toast-${kind}`;
  const iconName = kind === 'success' ? 'check' : kind === 'error' ? 'alert' : 'clock';
  element.innerHTML = `${icon(iconName, 16)}<span>${esc(message)}</span>`;
  container.appendChild(element);
  requestAnimationFrame(() => element.classList.add('is-visible'));
  window.setTimeout(() => {
    element.classList.remove('is-visible');
    window.setTimeout(() => element.remove(), 200);
  }, kind === 'error' ? 5200 : 3200);
}

export const toastSuccess = (message: string) => toast(message, 'success');
export const toastError = (message: string) => toast(message, 'error');

/** Menampilkan error apa pun sebagai pesan yang ramah, bukan stack trace. */
export function showError(error: unknown, fallback = 'Terjadi kesalahan. Silakan coba lagi.'): void {
  const message = error instanceof Error && error.message ? error.message : fallback;
  toast(message, 'error');
}

/* ---------------------------------------------------------------- dialog */

export interface ModalOptions {
  title: string;
  subtitle?: string;
  /** isi modal: HTMLElement atau string HTML */
  body: HTMLElement | string;
  /** tombol di bagian bawah */
  footer?: HTMLElement | string;
  size?: 'sm' | 'md' | 'lg';
  onClose?: () => void;
}

export interface ModalHandle {
  element: HTMLElement;
  close: () => void;
}

let openModals = 0;

/**
 * Tumpukan modal yang sedang terbuka.
 *
 * Modal bisa bersarang (misalnya dialog "Buka Vault" muncul di atas form
 * account). Tanpa tumpukan ini, satu tekanan Escape akan menutup semuanya dan
 * isian form pengguna ikut hilang.
 */
const modalStack: Array<() => void> = [];

export function openModal(options: ModalOptions): ModalHandle {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = `modal modal-${options.size ?? 'md'}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const head = document.createElement('div');
  head.className = 'modal-head';
  head.innerHTML = `
    <div>
      <h2 class="modal-title">${esc(options.title)}</h2>
      ${options.subtitle ? `<p class="modal-subtitle">${esc(options.subtitle)}</p>` : ''}
    </div>
    <button type="button" class="icon-button" data-modal-close aria-label="Tutup">${icon('close', 18)}</button>`;

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof options.body === 'string') body.innerHTML = options.body;
  else body.appendChild(options.body);

  dialog.append(head, body);
  if (options.footer) {
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    if (typeof options.footer === 'string') footer.innerHTML = options.footer;
    else footer.appendChild(options.footer);
    dialog.appendChild(footer);
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
  openModals += 1;
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  const close = () => {
    const stackIndex = modalStack.indexOf(close);
    if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
    overlay.classList.remove('is-visible');
    openModals = Math.max(0, openModals - 1);
    if (openModals === 0) document.body.classList.remove('modal-open');
    window.setTimeout(() => overlay.remove(), 160);
    document.removeEventListener('keydown', onKeydown);
    options.onClose?.();
  };

  const onKeydown = (event: KeyboardEvent) => {
    // Hanya modal teratas yang menutup saat Escape ditekan.
    if (event.key !== 'Escape') return;
    if (modalStack[modalStack.length - 1] !== close) return;
    event.stopPropagation();
    close();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  head.querySelector('[data-modal-close]')?.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown);
  modalStack.push(close);

  // Fokuskan elemen pertama yang bisa diisi supaya langsung bisa mengetik.
  window.setTimeout(() => {
    const focusable = dialog.querySelector<HTMLElement>(
      'input:not([type=hidden]), textarea, select, button:not([data-modal-close])',
    );
    focusable?.focus();
  }, 60);

  return { element: dialog, close };
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Dialog konfirmasi. Dipakai untuk tindakan yang tidak bisa dibatalkan. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const footer = document.createElement('div');
    footer.className = 'modal-actions';
    footer.innerHTML = `
      <button type="button" class="btn btn-ghost" data-cancel>${esc(options.cancelLabel ?? 'Batal')}</button>
      <button type="button" class="btn ${options.danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(options.confirmLabel ?? 'Ya, lanjutkan')}</button>`;

    const handle = openModal({
      title: options.title,
      body: `<p class="modal-text">${esc(options.message)}</p>`,
      footer,
      size: 'sm',
    });

    let answered = false;
    footer.querySelector('[data-cancel]')?.addEventListener('click', () => {
      answered = true;
      handle.close();
      resolve(false);
    });
    footer.querySelector('[data-confirm]')?.addEventListener('click', () => {
      answered = true;
      handle.close();
      resolve(true);
    });
    handle.element.closest('.modal-overlay')?.addEventListener('click', (event) => {
      if (event.target === handle.element.closest('.modal-overlay') && !answered) resolve(false);
    });
  });
}

/* ------------------------------------------------------------ state blok */

export function emptyState(opts: {
  iconName?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  actionAttr?: string;
}): string {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(opts.iconName ?? 'file', 22)}</div>
      <h3 class="empty-title">${esc(opts.title)}</h3>
      ${opts.body ? `<p class="empty-body">${esc(opts.body)}</p>` : ''}
      ${opts.actionLabel && opts.actionAttr ? `<button type="button" class="btn btn-primary" ${opts.actionAttr}>${icon('plus', 16)}<span>${esc(opts.actionLabel)}</span></button>` : ''}
    </div>`;
}

export function loadingState(label = 'Memuat...'): string {
  return `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>${esc(label)}</span></div>`;
}

export function skeletonList(count = 4): string {
  return `<div class="skeleton-list">${Array.from({ length: count })
    .map(() => '<div class="skeleton-card"><div class="skeleton-line w-60"></div><div class="skeleton-line w-90"></div><div class="skeleton-line w-40"></div></div>')
    .join('')}</div>`;
}

/* --------------------------------------------------------------- markdown */

/**
 * Renderer Markdown ringan (tanpa dependency).
 * Teks di-escape lebih dulu, jadi HTML mentah dari pengguna tidak pernah
 * dieksekusi. Cukup untuk catatan pribadi: judul, tebal, miring, kode,
 * daftar, kutipan, dan tautan.
 */
export function renderMarkdown(source: string): string {
  if (!source.trim()) return '';
  const codeBlocks: string[] = [];

  let text = esc(source).replace(/\r\n/g, '\n');

  // Blok kode ``` diproteksi dulu agar isinya tidak diproses sebagai markdown.
  text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const index = codeBlocks.length;
    codeBlocks.push(
      `<pre class="md-code"><code data-lang="${esc(lang ?? '')}">${code.replace(/\n$/, '')}</code></pre>`,
    );
    return `\u0000CODE${index}\u0000`;
  });

  const inline = (value: string): string =>
    value
      .replace(/`([^`\n]+)`/g, '<code class="md-inline">$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const lines = text.split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushAll();
      continue;
    }
    if (/^\u0000CODE\d+\u0000$/.test(line.trim())) {
      flushAll();
      out.push(line.trim());
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = (heading[1] as string).length + 1; // # -> h2 di dalam kartu
      out.push(`<h${level} class="md-h">${inline(heading[2] as string)}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushAll();
      out.push('<hr class="md-hr" />');
      continue;
    }
    const quoteMatch = /^>\s?(.*)$/.exec(line);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1] as string);
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (listType !== 'ul') {
        flushList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inline(bullet[1] as string)}</li>`);
      continue;
    }
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (listType !== 'ol') {
        flushList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inline(ordered[1] as string)}</li>`);
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }
  flushAll();

  return out
    .join('\n')
    .replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => codeBlocks[Number(index)] ?? '');
}

/* --------------------------------------------------------------- format */

const DATE_FORMAT = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const DATETIME_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_FORMAT.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DATETIME_FORMAT.format(date);
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'baru saja';
  if (diff < hour) return `${Math.floor(diff / minute)} menit lalu`;
  if (diff < day) return `${Math.floor(diff / hour)} jam lalu`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} hari lalu`;
  return formatDate(value);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const size = bytes / 1024 ** index;
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

/** Sisa hari menuju tenggat: "Hari ini", "Besok", "Terlambat 2 hari". */
export function formatDue(value: string | null | undefined): { text: string; tone: string } {
  if (!value) return { text: '', tone: '' };
  const due = new Date(`${value}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { text: '', tone: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: `Terlambat ${Math.abs(days)} hari`, tone: 'danger' };
  if (days === 0) return { text: 'Hari ini', tone: 'warn' };
  if (days === 1) return { text: 'Besok', tone: 'warn' };
  if (days <= 7) return { text: `${days} hari lagi`, tone: 'warn' };
  return { text: formatDate(value), tone: '' };
}

/* --------------------------------------------------------------- lainnya */

export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 200): (...args: Parameters<T>) => void {
  let timer = 0;
  return (...args: Parameters<T>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* jatuh ke cara lama di bawah */
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'berkas';
}

/** Hanya tautan http/https yang boleh dipakai sebagai href. */
export function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Menandai elemen sebagai tidak boleh kehilangan fokus saat shortcut global. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export function parseTagsInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((part) => part.trim().replace(/^#+/, '').toLowerCase())
        .filter(Boolean),
    ),
  );
}

/**
 * Mengubah Markdown menjadi teks biasa untuk ringkasan satu baris.
 * Dipakai supaya kartu dan daftar aktivitas tidak menampilkan tanda `#` atau `**`.
 */
export function plainText(value: string, max = 180): string {
  const collapsed = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
