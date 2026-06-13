/* =========================================================================
   config.js — Supabase connection settings
   -------------------------------------------------------------------------
   CARA MENGISI (lihat juga supabase-setup.sql & README):
   1. Buat project gratis di https://supabase.com
   2. Buka Project Settings > API
   3. Salin "Project URL"  -> SUPABASE_URL
   4. Salin "anon public" key -> SUPABASE_ANON_KEY
   5. Jalankan isi file supabase-setup.sql di SQL Editor Supabase

   CATATAN KEAMANAN: anon key MEMANG boleh terlihat di browser. Itu kunci
   publik. Yang menjaga data tiap user adalah aturan Row Level Security (RLS)
   di database (sudah disiapkan di supabase-setup.sql). Jadi aman di-commit.

   Selama nilai di bawah masih placeholder, app jalan dalam MODE LOKAL:
   tanpa login, riwayat disimpan di perangkat (localStorage) seperti semula.
   ========================================================================= */

const SUPABASE_URL = 'https://tupznjdqcuoffaaeinfe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__ZhdUcqpbPiKHwIOr4ukHA_AnctP2ql';

(function initConfig() {
  const looksPlaceholder =
    SUPABASE_URL.includes('YOUR-PROJECT') ||
    SUPABASE_ANON_KEY.includes('YOUR-ANON') ||
    !SUPABASE_URL.startsWith('http');

  // The Supabase UMD bundle (loaded via CDN) exposes window.supabase.
  const lib = window.supabase;
  const libReady = lib && typeof lib.createClient === 'function';

  let client = null;
  if (!looksPlaceholder && libReady) {
    try {
      client = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    } catch (err) {
      console.error('[IELTS] Gagal membuat Supabase client:', err);
    }
  }

  window.SB = client; // null when running in local mode
  window.IELTS_CONFIG = {
    isConfigured: !!client,
    reason: looksPlaceholder
      ? 'placeholder'
      : (!libReady ? 'lib-missing' : 'ok'),
    url: SUPABASE_URL
  };
})();
