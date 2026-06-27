/* =========================================================================
   license.js — status lisensi (sudah bayar / belum) untuk gating fitur.

   Model: BAYAR SEKALI. User dianggap "berbayar" jika ada baris status
   'active' di tabel `licenses` (lihat supabase-license.sql).

   Dipakai di UI untuk mengunci fitur premium. Penegakan SEBENARNYA tetap
   di server (endpoint AI mengecek lisensi sendiri) — gating UI hanya untuk
   pengalaman pengguna, bukan satu-satunya pengaman.

   Mode lokal / belum login -> isPaid() = false (semua premium terkunci).
   ========================================================================= */
(function () {
  let cache = null; // { paid: boolean }

  const License = {
    /** true jika user saat ini sudah membayar. Hasil di-cache per halaman. */
    async isPaid(force) {
      const configured = window.IELTS_CONFIG && window.IELTS_CONFIG.isConfigured;
      if (!configured || !window.SB) return false;
      if (cache && !force) return cache.paid;

      try {
        const { data: sess } = await window.SB.auth.getSession();
        const user = sess && sess.session && sess.session.user;
        if (!user) { cache = { paid: false }; return false; }

        const { data, error } = await window.SB
          .from('licenses')
          .select('status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (error) { console.warn('[License] gagal cek lisensi:', error.message); return false; }
        cache = { paid: !!data };
        return cache.paid;
      } catch (e) {
        console.warn('[License] error:', e.message || e);
        return false;
      }
    },

    /** Paksa baca ulang dari server di pemanggilan isPaid() berikutnya. */
    clearCache() { cache = null; }
  };

  window.License = License;
})();
