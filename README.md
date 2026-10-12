# PERSONAL OS

Meja kerja digital pribadi: satu tempat untuk menyimpan, mencari, mengelola, dan
menggunakan kembali semua data penting.

Dibangun dengan **Astro + TypeScript + Tailwind CSS + Supabase**, tanpa backend
Node terpisah, dan siap di-deploy ke **Vercel** sebagai situs statis.

> **Mau langsung online?** Baca **[DEPLOY.md](DEPLOY.md)** — panduan langkah demi
> langkah dari nol: Supabase → GitHub → Vercel, lengkap dengan daftar yang perlu
> disiapkan dan cara mengatasi error yang sering muncul.

---

## Dua mode penyimpanan

Aplikasi ini bisa berjalan dalam dua mode, dan mode dipilih otomatis dari
environment variable:

| Mode | Kapan aktif | Data disimpan di |
| --- | --- | --- |
| **Mode Lokal** | `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` kosong | Perangkat sendiri: `localStorage` (metadata) + `IndexedDB` (berkas) |
| **Supabase** | Kedua variable terisi | Supabase: PostgreSQL, Auth, dan Storage |

Mode Lokal ada supaya aplikasi **langsung bisa dipakai tanpa setup apa pun** —
berguna untuk mencoba lebih dulu. Mode Supabase adalah mode yang disarankan
untuk pemakaian sehari-hari: data tersinkron antar perangkat, ada password,
dan keamanan ditegakkan di database.

---

## Menjalankan secara lokal

Butuh Node.js 18+ (disarankan 20+).

```bash
npm install
npm run dev
```

Buka `http://localhost:4321`. Aplikasi akan berjalan di **Mode Lokal**.

1. Isi nama dan email, klik **Mulai**.
2. Buka **Pengaturan > Data Demo > Muat Data Demo** untuk mengisi contoh data.
3. Selesai. Semua fitur langsung berfungsi.

Perintah lain:

```bash
npm run build        # build produksi ke folder dist/
npm run preview      # pratinjau hasil build
npm run check:types  # pemeriksaan tipe cepat untuk seluruh isi src/lib
npm run check        # pemeriksaan tipe lengkap termasuk file .astro
```

> `npm run check` menjalankan TypeScript language server dan di beberapa mesin
> butuh lebih dari satu menit. Untuk iterasi sehari-hari, `npm run check:types`
> jauh lebih cepat karena hanya memeriksa `src/lib` — di situlah seluruh logika
> aplikasi berada.

---

## Menghubungkan Supabase

### 1. Buat project Supabase

Buat project baru di [supabase.com](https://supabase.com), lalu buka
**SQL Editor**.

### 2. Jalankan skema database

Buka file [`supabase/schema.sql`](supabase/schema.sql), salin seluruh isinya,
tempel ke SQL Editor, lalu **Run**.

File itu membuat semuanya sekaligus:

- 14 tabel: `profiles`, `projects`, `prompts`, `prompt_versions`, `documents`,
  `notes`, `links`, `accounts`, `tasks`, `snippets`, `tags`, `tag_relations`,
  `activity_logs`, dan `secrets` (password terenkripsi)
- Index untuk `user_id`, `project_id`, `created_at`, `updated_at`, `favorite`,
  `archived`, `status`, dan kolom pencarian
- **Row Level Security** di semua tabel (user hanya bisa melihat datanya sendiri)
- Bucket Storage `documents` (privat, maksimal 10 MB) beserta policy-nya
- Fungsi pencarian `search_all()` memakai PostgreSQL Full Text Search
- Fungsi `seed_demo_data()` dan `delete_demo_data()`
- Trigger `updated_at` otomatis dan pembuatan baris `profiles` saat user daftar

### 3. Aktifkan provider Email

Di dashboard Supabase: **Authentication > Providers > Email** → aktifkan.

Untuk mempermudah uji coba, **Authentication > Sign In / Providers** →
matikan sementara *Confirm email* supaya akun baru bisa langsung masuk.

### 4. Isi environment variable

```bash
cp .env.example .env
```

Ambil nilainya dari **Project Settings > API**, lalu isi:

```
PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Jalankan ulang `npm run dev`. Badge di sidebar akan berubah dari `LOKAL`
menjadi `SUPABASE`.

### 5. Daftar akun

Buka `/masuk`, klik **Daftar**, isi email dan password (minimal 6 karakter).
Akun pertama yang kamu buat adalah akunmu. Aplikasi ini privat — tidak ada
pendaftaran terbuka untuk umum kecuali kamu membagikan tautannya.

---

## Deploy ke Vercel

1. Push project ini ke repository GitHub atau GitLab.
2. Di Vercel: **Add New > Project**, import repository tersebut.
3. Vercel otomatis mengenali Astro. Pastikan:
   - Framework Preset: **Astro**
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Tambahkan environment variable di **Settings > Environment Variables**:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
5. Deploy.
6. Setelah dapat URL produksi, tambahkan URL itu di Supabase:
   **Authentication > URL Configuration** → *Site URL* dan *Redirect URLs*
   (`https://domain-kamu.com/masuk`).

---

## Struktur proyek

```
src/
  components/        Sidebar, TopBar, CommandPalette, ResourcePage
  layouts/           AppLayout (kerangka utama)
  lib/
    types.ts         Tipe data (nama tipe = nama tabel)
    resources.ts     Definisi kolom, kategori, dan label tiap resource
    supabase.ts      Klien Supabase (dynamic import)
    remote.ts        Adapter Supabase (CRUD, auth, storage, search)
    local.ts         Adapter Mode Lokal (localStorage + IndexedDB)
    store.ts         Facade data — satu pintu untuk semua halaman
    vault.ts         Enkripsi password (PBKDF2 + AES-GCM)
    vault-ui.ts      Gerbang buka-kunci & pengelola password
    cards.ts         Renderer kartu & baris
    forms.ts         Mesin form generik + validasi
    itemActions.ts   Aksi item bersama (form, unggah, versi, arsip, hapus)
    detail.ts        Modal detail
    search.ts        Pencarian global
    ui.ts            Ikon, toast, modal, markdown, format
    shell.ts         Skrip kerangka (drawer, tema, Command Palette)
    pages/           Pengontrol per halaman
  pages/             Rute Astro
  styles/global.css  Sistem visual (token warna, komponen, responsif)
supabase/schema.sql  Skema database lengkap
```

Karena semua resource memakai definisi kolom yang sama (`resources.ts`),
menambah kolom baru cukup dilakukan di satu tempat: ubah tabel di SQL, lalu
tambahkan entri di `resources.ts`.

---

## Fitur

- **Dashboard** — sapaan, pencarian, statistik, baru diperbarui, favorit, aksi cepat
- **Cari** — pencarian global di 8 jenis data, dikelompokkan per jenis
- **Command Palette** — `Ctrl + K` (atau `/`) untuk mencari dan menjalankan aksi
- **Project** — pusat organisasi + halaman detail berisi semua data terkait
- **Prompt** — perpustakaan prompt dengan tombol Salin dan **versioning**
- **Dokumen** — unggah PDF/DOCX/XLSX/CSV/TXT/MD, buka, unduh, hapus
- **Catatan** — catatan cepat dengan editor Markdown ringan
- **Link** — manajer tautan dengan validasi URL
- **Accounts** — informasi identitas akun **beserta password yang terenkripsi** (lihat bagian Vault di bawah)
- **Tugas** — tugas ringan dengan status, prioritas, dan tenggat
- **Snippet** — potongan kode/teks dengan tombol Salin
- **Tag** — satu sistem tag untuk semua jenis data, tanpa duplikat
- **Vault** — password akun tersimpan terenkripsi (AES-GCM 256) dengan master password
- **Favorit & Arsip** — arsip tidak menghapus apa pun dan tetap bisa dicari
- **Pengaturan** — profil, tema (Terang/Gelap/Sistem), vault, keamanan, backup JSON,
  data demo, ringkasan data, riwayat aktivitas

---

## Vault: menyimpan password dengan aman

Password akun (Gmail, hosting, dan lainnya) disimpan **terenkripsi**, bukan sebagai teks biasa.

### Cara kerjanya

1. Saat pertama kali menyimpan password, kamu diminta membuat **master password**.
2. Master password itu diturunkan menjadi kunci AES-256 memakai **PBKDF2, 250.000 iterasi,
   SHA-256**, dengan salt acak 16 byte.
3. Setiap password dienkripsi dengan **AES-GCM 256** dan IV acak 12 byte.
4. Yang tersimpan di database hanya **ciphertext + IV + salt**.

**Master password tidak pernah dikirim ke server dan tidak disimpan di mana pun.** Enkripsi
terjadi di browser. Bahkan kalau seluruh isi tabel `secrets` bocor, isinya tidak berguna tanpa
master password kamu.

### Yang perlu kamu tahu

- **Master password tidak bisa dipulihkan.** Tidak ada tombol "lupa password" karena memang
  tidak ada cadangannya — itu inti dari desainnya. Kalau lupa, password yang tersimpan tidak bisa
  dibuka siapa pun, termasuk server. Simpan master password di tempat yang aman.
- Demi kenyamanan, master password disimpan di `sessionStorage` selama tab terbuka, sehingga kamu
  tidak perlu mengetiknya ulang setiap pindah halaman. `sessionStorage` terhapus saat tab
  ditutup, dan **vault otomatis terkunci setelah 15 menit tanpa aktivitas**. Ada juga tombol
  **Kunci Vault** di Pengaturan.
- Kunci turunan (CryptoKey) tidak pernah diekspor dan tidak pernah ditulis ke penyimpanan.
- Saat keluar (logout), kunci vault langsung dihapus dari memori.
- Vault hanya berjalan di konteks aman: `https://` atau `http://localhost`. Kalau dibuka lewat
  `file://`, WebCrypto tidak tersedia dan aplikasi akan memberi tahu.

### Memakainya

- **Menambah password**: buka Accounts → tombol **Account Baru** → isi bagian **Password**. Ada
  tombol mata (tampilkan), tombol putar (buat password acak 20 karakter dan langsung salin), dan
  tombol salin. Kolom **Catatan Rahasia** juga tersedia untuk kode pemulihan.
- **Melihat password**: pada kartu account, klik tombol **Password**. Kalau vault masih terkunci,
  kamu diminta master password lebih dulu.
- **Kartu account** menampilkan badge "N password tersimpan" atau "Belum ada password".
- **Ganti master password**: Pengaturan → Vault Password → Ganti Master Password. Semua rahasia
  dibuka dengan kunci lama lalu dienkripsi ulang dengan kunci baru. Kalau ada satu yang gagal,
  seluruh proses dibatalkan supaya tidak ada data yang tertinggal separuh jalan.

### Password di dalam backup

Backup JSON **ikut memuat password terenkripsi** beserta salt vault, supaya bisa dipulihkan di
perangkat lain. Isinya tetap tidak berguna tanpa master password kamu. Jadi: **simpan berkas
backup dan master password secara terpisah.**


### Pintasan papan tik

| Pintasan | Fungsi |
| --- | --- |
| `Ctrl + K` / `Cmd + K` | Buka Command Palette |
| `/` | Buka pencarian (saat tidak sedang mengetik) |
| `Ctrl + S` | Simpan form yang sedang terbuka |
| `Esc` | Tutup modal / Command Palette |
| `↑` `↓` `Enter` | Navigasi hasil di Command Palette |

---

## Keamanan

- Row Level Security aktif di **semua** tabel. Setiap kebijakan memakai
  `auth.uid() = user_id`, jadi pemisahan data terjadi di database, bukan di
  frontend.
- Bucket Storage `documents` privat. Berkas disimpan dengan awalan
  `<user_id>/...` dan hanya bisa diakses lewat *signed URL* berumur 1 jam.
- Yang ada di browser hanya **anon key**. **Service Role Key tidak pernah
  dipakai di frontend.**
- **Password akun disimpan terenkripsi** (AES-GCM 256) di tabel `secrets`. Server
  hanya menerima ciphertext. Master password tidak pernah dikirim ke mana pun —
  lihat bagian Vault di atas.
- API key dan token rahasia lain tidak punya tempat khusus; kalau perlu disimpan,
  gunakan kolom **Catatan Rahasia** yang ikut terenkripsi.
- Validasi input dijalankan di form (wajib isi, format email, format URL) dan
  dibatasi lagi oleh tipe kolom serta policy di database.
- Unggahan dibatasi jenis berkas (PDF, DOCX, XLSX, CSV, TXT, MD) dan ukuran
  maksimal 10 MB — baik di sisi klien maupun di bucket Storage.
- Tidak ada pesan error teknis mentah yang ditampilkan ke pengguna; semua
  diterjemahkan ke Bahasa Indonesia.

---

## Backup & Export

Di **Pengaturan > Backup & Export**:

- **Unduh Backup (JSON)** menghasilkan `personal-os-backup-YYYY-MM-DD.json`
  berisi project, prompt, versi prompt, dokumen, catatan, link, accounts,
  tugas, snippet, tag, dan relasi tag. Tidak ada password di dalamnya karena
  memang tidak pernah disimpan.
- **Pulihkan dari Backup** menambahkan data dari berkas JSON. Data yang ID-nya
  sama akan dilewati, jadi tidak ada yang tertimpa.

Berkas dokumen sendiri tidak ikut ke dalam JSON — yang tersimpan hanyalah
metadatanya. Di mode Supabase, berkasnya tetap ada di Supabase Storage.

---

## Verifikasi yang sudah dilakukan

Diuji dengan Chromium sungguhan (Playwright) pada Mode Lokal:

- **59/59 pemeriksaan lulus** untuk alur utama: masuk, buat prompt, salin ke
  clipboard, versioning prompt, favorit, arsip → pulihkan, pencarian global,
  buka detail, Command Palette (`Ctrl + K`), unggah dokumen, ubah status tugas,
  halaman detail project, ganti tema, dan drawer mobile.
- **31/31 pemeriksaan lulus** untuk vault: pembuatan master password, penolakan
  password pendek dan konfirmasi yang tidak sama, enkripsi tersimpan, penolakan
  master password salah, buka/tampilkan/salin password, generator, ganti master
  password (kunci lama tidak berlaku lagi, isi tetap terbaca), dan hapus rahasia.
- **24/24 pemeriksaan lulus** untuk Backup & Export, termasuk siklus penuh:
  simpan password → export JSON → hapus account → import → password masih bisa
  dibuka dan isinya sama.
- **Bukti enkripsi**: plaintext password dan master password **tidak ditemukan**
  di `localStorage` maupun di berkas backup; yang ada hanya ciphertext, IV, dan salt.
- **0 console error** di seluruh halaman.
- **0 overflow horizontal** di 13 rute pada lebar 375 px dan 768 px.
- `npx tsc --noEmit` bersih (0 error) untuk 28 berkas di `src/lib`.
- `npx astro build` menghasilkan 16 halaman tanpa peringatan.
- Berat halaman terukur: **rata-rata 40 KB** setelah kompresi brotli
  (127–172 KB sebelum kompresi, 9–11 berkas per halaman).
- Audit kesiapan deploy: tidak ada `.env`, JWT, `service_role`, atau URL project
  Supabase yang tertanam di `dist/`. Rincian lengkap di [DEPLOY.md](DEPLOY.md).

**Yang belum terbukti:** jalur Supabase belum pernah dijalankan dengan project
Supabase sungguhan — skema SQL, RLS, Storage policy, dan adapter-nya sudah
ditulis tetapi belum dieksekusi terhadap server nyata. Semua yang terverifikasi
di atas berjalan di Mode Lokal.

---

## Catatan

- Istilah teknis (Prompt, Snippet, Command Palette, Supabase, Row Level
  Security, dan sejenisnya) sengaja tidak diterjemahkan karena itu istilah yang
  lazim dipakai. Seluruh teks lain berbahasa Indonesia.
- Pencarian teks memakai konfigurasi `simple` pada PostgreSQL, bukan `english`,
  karena PostgreSQL belum punya konfigurasi bahasa Indonesia. Dengan `simple`,
  kata Indonesia tidak dirusak oleh aturan stemming bahasa Inggris. Selain Full
  Text Search, pencarian juga mencocokkan substring supaya ketikan sebagian
  seperti "supa" tetap menemukan "Supabase".
- Animasi dibatasi 150–250 ms, tanpa WebGL, tanpa grafik, tanpa library besar.
  Library `@supabase/supabase-js` dimuat secara dinamis sehingga Mode Lokal
  tidak mengunduhnya sama sekali.
