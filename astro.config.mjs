// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * True bila build berjalan untuk produksi (npm run build atau Vercel).
 *
 * Ini penting untuk satu hal: kalau aplikasi di-build tanpa
 * PUBLIC_SUPABASE_URL, aplikasi tetap jalan — tapi data akan tersimpan di
 * browser setiap pengunjung, bukan di server. Untuk aplikasi pribadi itu berarti
 * data tidak tersinkron dan hilang begitu pindah perangkat. Karena itu mode itu
 * ditandai keras, baik di log build maupun di banner aplikasi.
 */
const isProductionBuild = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const supabaseConfigured = Boolean(process.env.PUBLIC_SUPABASE_URL && process.env.PUBLIC_SUPABASE_ANON_KEY);

/**
 * Pemeriksaan akhir build. Tidak menghentikan build — hanya memberi peringatan
 * yang jelas supaya masalah konfigurasi ketahuan sebelum deploy, bukan setelah
 * pengguna kehilangan data.
 */
const deployConfigGuard = {
  name: 'personal-os-deploy-config-guard',
  hooks: {
    'astro:build:done': ({ logger }) => {
      if (isProductionBuild && !supabaseConfigured) {
        logger.warn(
          [
            '',
            '══════════════════════════════════════════════════════════════',
            '  MODE LOKAL DI BUILD PRODUKSI',
            '  Data akan disimpan di browser pengunjung, BUKAN di server.',
            '  Data tidak akan sinkron antar perangkat.',
            '',
            '  Agar data tersimpan di Supabase, tambahkan di environment hosting:',
            '    PUBLIC_SUPABASE_URL      (https://xxxxx.supabase.co)',
            '    PUBLIC_SUPABASE_ANON_KEY (anon public key)',
            '  lalu jalankan build ulang.',
            '══════════════════════════════════════════════════════════════',
            '',
          ].join('\n'),
        );
      } else if (isProductionBuild) {
        logger.info('Supabase terkonfigurasi. Data akan disimpan di server.');
      }
      logger.info('Siap deploy: unggah isi folder dist/ sebagai situs statis (halaman ini privat, noindex).');
    },
  },
};

// Output statis: seluruh halaman di-render saat build, data diambil di browser
// lewat Supabase (atau Mode Lokal). Tidak butuh Node server terpisah.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://personal-os.vercel.app',
  output: 'static',
  trailingSlash: 'ignore',
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    inlineStylesheets: 'auto',
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [deployConfigGuard],
});
