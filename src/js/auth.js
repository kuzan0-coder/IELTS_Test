/* =========================================================================
   auth.js — thin wrapper around Supabase Auth.
   When Supabase is not configured (local mode), everything resolves to
   "no user" and the app stays open without login.
   ========================================================================= */
(function () {
  const SB = window.SB;
  const configured = window.IELTS_CONFIG && window.IELTS_CONFIG.isConfigured;

  function mapAuthError(err) {
    const msg = (err && err.message) || String(err || 'Terjadi kesalahan');
    if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) return 'Tidak bisa terhubung ke server. Cek koneksi internetmu, lalu coba lagi beberapa saat lagi.';
    if (/Invalid login credentials/i.test(msg)) return 'Email atau password salah.';
    if (/already registered/i.test(msg)) return 'Email ini sudah terdaftar. Coba login.';
    if (/Password should be at least/i.test(msg)) return 'Password minimal 6 karakter.';
    if (/Unable to validate email address/i.test(msg)) return 'Format email tidak valid.';
    if (/Email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Cek inbox (termasuk folder Spam) untuk link konfirmasinya, lalu coba masuk lagi.';
    if (/For security purposes|rate ?limit|after \d+ seconds/i.test(msg)) return 'Terlalu sering mencoba. Tunggu sebentar (±60 detik) lalu coba lagi.';
    if (/Auth session missing|session.*not.*found|token.*expired|link.*expired|otp.*expired/i.test(msg)) return 'Sesi reset tidak valid atau sudah kedaluwarsa. Minta link reset baru dari halaman masuk.';
    if (/New password should be different/i.test(msg)) return 'Password baru harus berbeda dari password lama.';
    return msg;
  }

  window.Auth = {
    isConfigured: () => !!configured,

    /** Cepat: ambil user dari sesi lokal (tanpa request jaringan). */
    async getSessionUser() {
      if (!configured) return null;
      const { data } = await SB.auth.getSession();
      return data.session ? data.session.user : null;
    },

    async signUp(email, password, meta) {
      if (!configured) return { ok: false, error: 'Login sedang tidak tersedia. Coba lagi nanti.' };
      // Data profil tambahan (nama, no HP) disimpan di user_metadata.
      const profile = {};
      if (meta && meta.name) profile.full_name = meta.name;
      if (meta && meta.phone) profile.phone = meta.phone;
      const { data, error } = await SB.auth.signUp({
        email, password, options: { data: profile }
      });
      if (error) return { ok: false, error: mapAuthError(error) };
      // Kalau "Confirm email" aktif, session null sampai user klik link email.
      const needsConfirm = !data.session;
      return { ok: true, needsConfirm, user: data.user };
    },

    async signIn(email, password) {
      if (!configured) return { ok: false, error: 'Login sedang tidak tersedia. Coba lagi nanti.' };
      const { data, error } = await SB.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: mapAuthError(error) };
      return { ok: true, user: data.user };
    },

    async signOut() {
      if (!configured) return;
      await SB.auth.signOut();
    },

    /** Kirim email berisi link untuk membuat password baru. */
    async requestPasswordReset(email) {
      if (!configured) return { ok: false, error: 'Login sedang tidak tersedia. Coba lagi nanti.' };
      const redirectTo = location.origin + '/reset-password';
      const { error } = await SB.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return { ok: false, error: mapAuthError(error) };
      return { ok: true };
    },

    /** Set password baru untuk user yang sedang dalam sesi recovery. */
    async updatePassword(newPassword) {
      if (!configured) return { ok: false, error: 'Login sedang tidak tersedia. Coba lagi nanti.' };
      const { error } = await SB.auth.updateUser({ password: newPassword });
      if (error) return { ok: false, error: mapAuthError(error) };
      return { ok: true };
    }
  };
})();
