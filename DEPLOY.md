# Panduan Deploy PERSONAL OS

Panduan ini mengarahkan dari nol sampai aplikasi online: **Supabase** (database) →
**GitHub** (kode) → **Vercel** (hosting).

Total waktu ±20 menit. Semuanya bisa memakai paket gratis.

---

## Ringkasan: apa yang akan dibuat

```
GitHub  ──push──►  Vercel  ──build──►  situs online
   │                  │
   │                  └── membaca 2 environment variable ──┐
   │                                                       ▼
   └── berisi kode aplikasi                          Supabase
                                                    (database + auth
                                                     + penyimpanan berkas)
```

Aplikasi ini **situs statis**: Vercel hanya mengubah kode jadi HTML/CSS/JS.
Semua data hidup di Supabase, dan diakses langsung dari browser pengguna.

---

## Yang perlu disiapkan

Centang dulu sebelum mulai:

| # | Yang disiapkan | Keterangan |
| --- | --- | --- |
| 1 | Akun Supabase | Daftar gratis di [supabase.com](https://supabase.com) |
| 2 | Akun GitHub | Daftar gratis di [github.com](https://github.com) |
| 3 | Akun Vercel | Daftar gratis di [vercel.com](https://vercel.com) — **pilih "Continue with GitHub"** supaya otomatis tersambung |
| 4 | Node.js 18+ di komputer | Cek dengan `node -v`. Kalau belum ada: [nodejs.org](https://nodejs.org) |
| 5 | Git di komputer | Cek dengan `git --version` |
| 6 | Berkas `supabase/schema.sql` | Sudah ada di dalam project ini |
| 7 | **Master password vault** | Tulis di tempat aman. **Tidak bisa dipulihkan** kalau lupa |

> **Penting soal nomor 7.** Master password itu kunci untuk membuka password yang
> kamu simpan di halaman Accounts. Tidak ada tombol "lupa password" karena memang
> tidak ada cadangannya di server. Tulis sekarang sebelum mulai.

---

## Langkah 1 — Supabase (database)

### 1.1 Buat project

1. Masuk ke [supabase.com/dashboard](https://supabase.com/dashboard).
2. Klik **New project**.
3. Isi:
   - **Name**: `personal-os`
   - **Database Password**: klik *Generate a password*, lalu **simpan password ini**
     (ini password database, bukan password login aplikasi — jarang dipakai, tapi jangan hilang)
   - **Region**: pilih **Southeast Asia (Singapore)** supaya cepat diakses dari Indonesia
4. Klik **Create new project**, tunggu ±2 menit sampai selesai.

### 1.2 Jalankan skema database

Ini bagian terpenting. Tanpa langkah ini, aplikasi akan error saat menyimpan data.

1. Di sidebar kiri Supabase, klik **SQL Editor**.
2. Klik **+ New query**.
3. Buka berkas `supabase/schema.sql` di komputer (pakai Notepad, VS Code, apa saja).
4. **Salin seluruh isinya**, tempel ke SQL Editor.
5. Klik **Run** (atau `Ctrl + Enter`).
6. Harus muncul **Success. No rows returned**.

Skrip itu membuat sekaligus: 14 tabel, index, Row Level Security di semua tabel,
bucket penyimpanan berkas, fungsi pencarian, dan fungsi data demo.

> Kalau muncul error, **jangan lanjut**. Kirim pesan error-nya untuk diperiksa.
> Menjalankan ulang skrip ini aman (semuanya `if not exists`).

### 1.3 Aktifkan login lewat Email

1. Sidebar kiri → **Authentication** → **Sign In / Providers** (atau **Providers**).
2. Pastikan **Email** berstatus **Enabled**.
3. **Untuk mempermudah uji coba**, matikan **Confirm email** di bagian bawah
   halaman itu, lalu **Save**.
   - Kalau dibiarkan aktif, setiap pendaftaran harus dikonfirmasi lewat email dulu.
   - Untuk aplikasi pribadi, mematikannya lebih praktis.

### 1.4 Ambil kunci API

1. Sidebar kiri → **Project Settings** (ikon gerigi) → **API**.
2. Catat dua nilai ini — akan dipakai di Langkah 3:

| Nama di Supabase | Dipakai sebagai |
| --- | --- |
| **Project URL** — bentuknya `https://abcdefghijklmnop.supabase.co` | `PUBLIC_SUPABASE_URL` |
| **anon public** di bagian *Project API keys* — panjang, diawali `eyJ...` | `PUBLIC_SUPABASE_ANON_KEY` |

> **Jangan pernah** memakai **`service_role`** key. Kunci itu membuka seluruh
> database tanpa batas dan tidak boleh ada di frontend. Yang dipakai hanya
> **anon public**, yang memang dirancang untuk publik.

### 1.5 Aktifkan penyimpanan berkas (untuk fitur Dokumen)

Bucket sudah dibuat otomatis oleh `schema.sql`. Tidak ada yang perlu dilakukan.

---

## Langkah 2 — GitHub (kode) ✅ SUDAH SELESAI

Kode sudah dikirim ke **<https://github.com/projectalengka/TOOLS-OS>**
(branch `main`, 2 commit, 59 berkas). **Langkah ini tidak perlu diulang** —
langsung ke Langkah 3.

Yang ikut terkirim: kode aplikasi, `schema.sql`, `README.md`, `DEPLOY.md`.
Yang **tidak** ikut: `node_modules`, `dist`, `.env`, dan catatan kerja asisten.
Sudah diverifikasi dengan `git ls-tree -r origin/main`.

> ### ⚠️ Repo ini PUBLIK
>
> Siapa pun bisa membaca kode ini. Tidak ada kredensial yang bocor di dalamnya —
> sudah diperiksa, tidak ada `.env`, JWT, `service_role`, atau URL project
> Supabase. Jadi ini **bukan masalah keamanan**, hanya soal privasi kode.
>
> Kalau ingin dijadikan privat: buka
> `github.com/projectalengka/TOOLS-OS/settings` → gulir ke paling bawah →
> **Danger Zone** → **Change repository visibility** → **Make private**.
> Vercel tetap bisa deploy dari repo privat, jadi tidak ada yang perlu diubah
> setelahnya.

### Kalau nanti ada perubahan kode

```bash
git add -A
git commit -m "Perubahan saya"
git push
```

Vercel akan otomatis build dan menayangkan versi baru. Tidak perlu deploy manual.

---

## Langkah 2b — Kalau perlu membuat repo baru dari nol

*Bagian ini hanya untuk referensi. Repo kamu sudah ada, jadi tidak perlu dijalankan.*

1. Buka [github.com/new](https://github.com/new).
2. Isi **Repository name**: `TOOLS-OS`, pilih **Private**.
3. **JANGAN centang** "Add a README file", ".gitignore", atau "license" — repo ini
   sudah punya semuanya; mencentang salah satu justru membuat konflik saat push.
4. Klik **Create repository**, lalu di terminal folder project:

```bash
git remote add origin https://github.com/projectalengka/TOOLS-OS.git
git branch -M main
git push -u origin main
```

Saat `git push` dijalankan pertama kali, akan muncul jendela login GitHub.
Pilih **Sign in with your browser** dan izinkan. Sekali saja.

> Kalau yang muncul justru permintaan password di terminal: GitHub **tidak
> menerima password akun**. Buat **Personal Access Token** di
> *Settings → Developer settings → Personal access tokens → Tokens (classic)*,
> centang scope **repo**, lalu pakai token itu sebagai password.


---

## Langkah 3 — Vercel (hosting) ← **MULAI DARI SINI**

### 3.1 Import project

1. Buka [vercel.com/new](https://vercel.com/new).
2. Di bagian **Import Git Repository**, cari **`TOOLS-OS`**, klik **Import**.
   - Kalau repo tidak muncul, klik **Adjust GitHub App Permissions** dan beri izin
     akses ke repo tersebut.
3. Vercel akan mendeteksi **Framework Preset: Astro** secara otomatis.
   **Biarkan semua pengaturan build apa adanya** — jangan diubah.

### 3.2 Isi environment variable (JANGAN DILEWATI)

Sebelum klik Deploy, buka bagian **Environment Variables** dan tambahkan **dua** baris:

| Name | Value |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | Project URL dari Langkah 1.4 |
| `PUBLIC_SUPABASE_ANON_KEY` | anon public key dari Langkah 1.4 |

Pastikan **Environment** yang dicentang mencakup **Production**, **Preview**,
dan **Development**.

> **Kalau bagian ini dilewati**, aplikasi tetap jalan — tapi data akan tersimpan
> di browser pengunjung masing-masing, bukan di server. Data tidak akan sinkron
> antar perangkat, dan hilang kalau ganti HP atau menghapus riwayat browser.
> Aplikasi akan menampilkan peringatan kuning di bagian atas sebagai penanda.

### 3.3 Deploy

1. Klik **Deploy**.
2. Tunggu ±1–2 menit.
3. Setelah selesai, kamu akan mendapat alamat seperti
   `https://personal-os-xxxx.vercel.app`. **Catat alamat ini.**

---

## Langkah 4 — Sambungkan balik ke Supabase

Ini langkah yang paling sering terlupa. Tanpa ini, login dan reset password
tidak akan bekerja karena Supabase belum mengenali alamat situsmu.

1. Buka Supabase → **Authentication** → **URL Configuration**.
2. Isi:
   - **Site URL**: `https://personal-os-xxxx.vercel.app` (alamat dari Langkah 3.3)
   - **Redirect URLs**: klik *Add URL*, isi `https://personal-os-xxxx.vercel.app/masuk`
3. Klik **Save**.
4. Kembali ke situs Vercel-mu, **muat ulang halaman**, lalu klik **Daftar**.
   Isi email dan password (minimal 6 karakter).

### Setelah berhasil masuk

1. Badge di sidebar kiri harus berbunyi **SUPABASE**, bukan **LOKAL**.
2. Tidak ada banner kuning di bagian atas halaman.
3. Buka **Pengaturan → Data Demo → Muat Data Demo** untuk mengisi contoh data.
4. Buka **Accounts → Account Baru** untuk mulai menyimpan akun Gmail dan
   passwordnya. Kamu akan diminta membuat **master password vault** di sini.

---

## Kalau ada masalah

| Gejala | Penyebab | Solusi |
| --- | --- | --- |
| Ada banner kuning "Mode Lokal aktif di situs online" | Environment variable belum diisi | Vercel → Settings → Environment Variables → tambahkan 2 variabel → **Redeploy** |
| Badge sidebar berbunyi LOKAL padahal sudah isi env | Perlu build ulang | Vercel → Deployments → **⋯** → **Redeploy** |
| `relation "projects" does not exist` | Skema belum dijalankan | Ulangi Langkah 1.2 |
| `new row violates row-level security policy` | Skema dijalankan sebagian | Jalankan ulang `schema.sql` sampai selesai |
| Login gagal, "Email not confirmed" | Confirm email masih aktif | Supabase → Authentication → Providers → matikan *Confirm email*, atau konfirmasi lewat email |
| Login gagal, "Invalid login credentials" | Password salah, atau akun belum dibuat | Klik **Daftar**, bukan **Masuk** |
| Tautan reset password mengarah ke `localhost` | Site URL belum diisi | Ulangi Langkah 4 |
| Halaman putih kosong | Ada error di browser | Tekan `F12` → tab **Console** → kirim pesan error-nya |
| Tombol Salin password tidak bekerja | Browser memblokir clipboard di koneksi tidak aman | Pastikan alamatnya `https://` |
| Vault minta master password terus | `sessionStorage` dibersihkan browser | Normal. Isi sekali per tab |
| **Lupa master password vault** | Memang tidak bisa dipulihkan | Lihat bagian di bawah |

### Kalau lupa master password vault

Password yang tersimpan **tidak bisa dibuka lagi** — itu memang desainnya. Yang
bisa dilakukan adalah mengosongkan vault lalu menyimpan ulang password-nya:

**Mode Supabase** — jalankan di SQL Editor:

```sql
-- Ganti dengan id pengguna milikmu
-- (lihat di Authentication > Users)
update public.profiles
   set vault_salt = null, vault_check = null
 where id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

delete from public.secrets
 where user_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
```

**Mode Lokal** — buka aplikasi, tekan `F12` → Console → jalankan:

```js
localStorage.removeItem('personal-os:vault-meta');
```

Setelah itu vault bisa dibuat ulang dengan master password baru. Password lama
tidak bisa dikembalikan, jadi siapkan daftar akunmu untuk diisi ulang.

---

## Checklist akhir

Setelah semua selesai, pastikan ini tercentang:

- [x] ~~Kode sudah ada di GitHub~~ — **selesai**: `github.com/projectalengka/TOOLS-OS`
- [ ] `schema.sql` sudah dijalankan di Supabase sampai **Success**
- [ ] Provider **Email** aktif di Supabase
- [ ] **Site URL** dan **Redirect URL** sudah diisi alamat Vercel
- [ ] Dua environment variable ada di Vercel (Production + Preview + Development)
- [ ] Situs sudah **Redeploy** setelah env variable diisi
- [ ] Badge sidebar berbunyi **SUPABASE**
- [ ] Tidak ada banner kuning
- [ ] Bisa **Daftar** dan **Masuk**
- [ ] Data yang dibuat di HP muncul juga di komputer (bukti tersinkron)
- [ ] Master password vault sudah dicatat di tempat aman
- [ ] Repo GitHub dijadikan **Private** (kalau mau)

---

## Referensi: bekerja di komputer

```bash
npm install          # sekali saja
npm run dev          # jalankan di http://localhost:4321 (Mode Lokal)

npm run build        # build produksi ke folder dist/
npm run preview      # pratinjau hasil build
npm run check:types  # periksa tipe (cepat)
```

Setelah mengubah kode, kirim perubahannya ke GitHub — Vercel akan otomatis
build dan menayangkan versi baru:

```bash
git add -A
git commit -m "Perubahan saya"
git push
```

### Ukuran yang diunduh pengunjung

Angka di bawah ini **hasil pengukuran** dengan Chromium pada kunjungan pertama
(cache kosong), bukan perkiraan:

| Rute | Semua berkas | Mentah | Brotli (yang dipakai Vercel) |
| --- | --- | --- | --- |
| Dashboard | 10 | 131,0 KB | 34,4 KB |
| Cari | 10 | 127,6 KB | 33,6 KB |
| Prompt | 11 | 171,7 KB | 45,2 KB |
| Accounts | 11 | 172,4 KB | 45,4 KB |
| Pengaturan | 9 | 146,6 KB | 38,0 KB |
| Project | 11 | 171,4 KB | 45,1 KB |

**Rata-rata ±40 KB per halaman** setelah kompresi.

Di **Mode Supabase**, browser juga mengunduh library Supabase (224 KB mentah,
±58 KB brotli) — tetapi hanya **sekali**, lalu tersimpan di cache browser. Di
**Mode Lokal**, library itu tidak pernah diunduh sama sekali karena dimuat
secara dinamis.

Tidak ada framework UI, tidak ada library grafik, tidak ada WebGL, tidak ada
pelacak iklan. Animasi dibatasi 150–250 ms.

---

## Yang tidak boleh dilakukan

- ❌ **Jangan commit berkas `.env`.** `.gitignore` sudah mencegahnya — jangan diubah.
- ❌ **Jangan menaruh `service_role` key di Vercel.** Hanya `anon public`.
- ❌ **Jangan hapus baris `PUBLIC_`** dari nama environment variable. Awalan itu
  yang membuat Astro memasukkannya ke sisi browser.
- ❌ **Jangan menonaktifkan Row Level Security** di Supabase, walaupun sedang
  mencari kesalahan. Itu membuka data ke siapa pun yang punya anon key.

---

## Lampiran: hasil audit kesiapan deploy

Diperiksa sebelum panduan ini ditulis. Yang **diperbaiki**:

| Temuan | Risiko | Perbaikan |
| --- | --- | --- |
| Build produksi tanpa Supabase berjalan diam-diam di Mode Lokal | **Tinggi** — data tersimpan di browser pengunjung, tidak tersinkron, hilang saat ganti perangkat | Build sekarang menampilkan peringatan besar di log, dan aplikasi menampilkan banner kuning di setiap halaman |
| Vault terkunci otomatis (15 menit) saat modal password sedang terbuka | Sedang — muncul error "Vault sedang terkunci" padahal pengguna tidak mengunci apa pun | Vault otomatis dibuka ulang lewat gerbang, lalu operasi diulang sekali |
| Vault terkunci di tengah proses simpan | Sedang — data akun tersimpan tapi password tidak, tanpa pemberitahuan | Pengguna diberi tahu persis: "Data akun tersimpan, tetapi password belum" |
| Alamat situs tertulis tetap di konfigurasi | Rendah — salah kalau domain Vercel berbeda | Dibaca dari `PUBLIC_SITE_URL`, ada nilai cadangan |
| Akhir baris tidak konsisten antara Windows dan Linux | Rendah — setiap commit terlihat mengubah seluruh berkas | Ditambah `.gitattributes` dengan `text=auto eol=lf` |

Yang **diperiksa dan hasilnya bersih**:

- Tidak ada `.env`, tidak ada JWT, tidak ada `service_role`, dan tidak ada URL
  project Supabase yang tertanam di hasil build `dist/`.
- `.gitignore` benar: `node_modules/`, `dist/`, `.env`, `.vercel`, `.workbuddy-ai/`
  tidak ikut ke Git. Diverifikasi dengan `git ls-files`.
- Tidak ada `console.log` yang tertinggal, tidak ada TODO, tidak ada teks
  placeholder, dan tidak ada label antarmuka yang masih berbahasa Inggris.
- Skema database: 14 tabel, Row Level Security aktif di semuanya. `profiles`
  memakai policy `auth.uid() = id`; 13 tabel lain memakai `auth.uid() = user_id`.
- Fungsi penanganan error tidak pernah menampilkan pesan mentah dari server ke
  pengguna — semuanya diterjemahkan lebih dulu.

Yang **diverifikasi dengan menjalankan aplikasinya** (Chromium sungguhan):

- **114 pemeriksaan lulus**: 59 alur utama + 31 vault + 24 backup. 0 kegagalan.
- **0 console error** di seluruh halaman.
- **0 overflow horizontal** di 13 rute pada lebar 375 px dan 768 px.
- `tsc --noEmit` bersih (0 error) untuk 28 berkas.
- `astro build` menghasilkan 16 halaman tanpa peringatan.

**Yang belum terverifikasi:** seluruh pengujian di atas berjalan di Mode Lokal.
Jalur Supabase (tabel, RLS, Storage, Auth) sudah ditulis lengkap tetapi belum
pernah dieksekusi terhadap project Supabase sungguhan. Kalau muncul error saat
Langkah 1.2 atau saat login pertama, kirimkan pesan error-nya — itu bagian yang
belum terbukti, bukan bagian yang sudah diuji.
