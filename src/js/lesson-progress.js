/* =========================================================================
   lesson-progress.js — progres kuis Materi Belajar ({ id: { score, total, date } }).

   Selalu disimpan di perangkat (localStorage). Kalau user login dan tabel
   lesson_progress sudah dibuat (supabase-lessons.sql), progres juga
   disinkron ke akun: saat dimuat, lokal + cloud digabung (skor terbaik
   menang) dan yang belum ada di cloud ikut dikirim. Kalau tabel belum ada
   atau offline, diam-diam tetap memakai data lokal.
   ========================================================================= */
(function () {
  const KEY = 'ielts-lessons-progress';
  const TABLE = 'lesson_progress';

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function writeLocal(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* penyimpanan diblokir */ }
  }

  async function cloudUser() {
    try {
      if (!window.Auth || !Auth.isConfigured() || !window.SB) return null;
      return await Auth.getSessionUser();
    } catch (_) {
      return null;
    }
  }

  function better(a, b) {
    if (!a) return b;
    if (!b) return a;
    return b.score > a.score ? b : a;
  }

  async function upsert(user, rows) {
    if (!rows.length) return;
    const { error } = await window.SB.from(TABLE).upsert(
      rows.map(([id, p]) => ({ user_id: user.id, lesson_id: id, score: p.score, total: p.total, updated_at: p.date })),
      { onConflict: 'user_id,lesson_id' }
    );
    if (error) throw error;
  }

  window.LessonProgress = {
    /** Progres gabungan (lokal + akun kalau login). */
    async load() {
      const local = readLocal();
      const user = await cloudUser();
      if (!user) return local;
      try {
        const { data, error } = await window.SB.from(TABLE)
          .select('lesson_id, score, total, updated_at')
          .eq('user_id', user.id);
        if (error) throw error;
        const merged = { ...local };
        const cloud = {};
        (data || []).forEach((r) => {
          cloud[r.lesson_id] = { score: r.score, total: r.total, date: r.updated_at };
          merged[r.lesson_id] = better(merged[r.lesson_id], cloud[r.lesson_id]);
        });
        writeLocal(merged);
        // Yang lebih baik di perangkat ini (atau belum ada di akun) ikut dikirim.
        const push = Object.entries(merged).filter(([id, p]) => !cloud[id] || p.score > cloud[id].score);
        await upsert(user, push);
        return merged;
      } catch (err) {
        console.warn('[LessonProgress] sinkron akun gagal, pakai data perangkat:', err.message || err);
        return local;
      }
    },

    /** Simpan hasil kuis; skor terbaik yang disimpan. */
    async save(id, score, total) {
      const all = readLocal();
      const entry = better(all[id], { score, total, date: new Date().toISOString() });
      all[id] = entry;
      writeLocal(all);
      const user = await cloudUser();
      if (!user) return;
      try {
        await upsert(user, [[id, entry]]);
      } catch (err) {
        console.warn('[LessonProgress] gagal simpan ke akun:', err.message || err);
      }
    }
  };
})();
