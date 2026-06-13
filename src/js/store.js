/* =========================================================================
   store.js — practice history data layer.

   Works in two modes, transparently:
     • CLOUD  (logged in + Supabase configured) -> read/write table
                'practice_sessions', also keep a localStorage cache.
     • LOCAL  (otherwise) -> read/write localStorage only (original behaviour).

   A "session" is whatever object a module already builds (see each module's
   saveSession). It always has at least { date, band }. We store the whole
   object in a jsonb column so we never have to map field-by-field.
   ========================================================================= */
(function () {
  // localStorage keys must match the original ones so old data still loads.
  const LOCAL_KEYS = {
    reading: 'ielts-history',
    listening: 'ielts-listening-history',
    writing: 'ielts-writing-history',
    speaking: 'ielts-speaking-history'
  };
  const SKILLS = Object.keys(LOCAL_KEYS);
  const TABLE = 'practice_sessions';

  function readLocal(skill) {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEYS[skill]) || '[]'); }
    catch { return []; }
  }
  function writeLocal(skill, arr) {
    localStorage.setItem(LOCAL_KEYS[skill], JSON.stringify(arr));
  }

  async function cloudUser() {
    if (!window.Auth || !Auth.isConfigured()) return null;
    return await Auth.getSessionUser();
  }

  const Store = {
    SKILLS,

    /** Simpan satu sesi latihan. */
    async saveSession(skill, session) {
      if (!LOCAL_KEYS[skill]) throw new Error('Skill tidak dikenal: ' + skill);

      // 1) Selalu tulis cache lokal dulu (cepat + jalan offline).
      const local = readLocal(skill);
      local.push(session);
      writeLocal(skill, local);

      // 2) Kalau login ke cloud, kirim juga ke database.
      const user = await cloudUser();
      if (user) {
        const { error } = await window.SB.from(TABLE).insert({
          user_id: user.id,
          skill,
          data: session
        });
        if (error) console.warn('[Store] gagal sync ke cloud:', error.message);
      }
    },

    /** Ambil riwayat satu skill (array of session objects, urut lama->baru). */
    async getHistory(skill) {
      const user = await cloudUser();
      if (user) {
        try {
          const { data, error } = await window.SB
            .from(TABLE)
            .select('data, created_at')
            .eq('user_id', user.id)
            .eq('skill', skill)
            .order('created_at', { ascending: true });
          if (error) throw error;
          const rows = (data || []).map((r) => r.data);
          writeLocal(skill, rows); // refresh cache
          return rows;
        } catch (err) {
          console.warn('[Store] baca cloud gagal, pakai cache lokal:', err.message);
          return readLocal(skill);
        }
      }
      return readLocal(skill);
    },

    /** Semua skill digabung jadi satu array, tiap item diberi field `skill`. */
    async getAllHistory() {
      const user = await cloudUser();
      if (user) {
        try {
          const { data, error } = await window.SB
            .from(TABLE)
            .select('skill, data, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
          if (error) throw error;
          // Refresh per-skill cache.
          const bySkill = {};
          SKILLS.forEach((s) => (bySkill[s] = []));
          (data || []).forEach((r) => {
            if (bySkill[r.skill]) bySkill[r.skill].push(r.data);
          });
          SKILLS.forEach((s) => writeLocal(s, bySkill[s]));
          return (data || []).map((r) => ({ skill: r.skill, ...r.data }));
        } catch (err) {
          console.warn('[Store] baca cloud gagal, pakai cache lokal:', err.message);
        }
      }
      // Local mode (atau fallback).
      const all = [];
      SKILLS.forEach((skill) => readLocal(skill).forEach((s) => all.push({ skill, ...s })));
      return all;
    },

    /** Hapus riwayat satu skill (lokal + cloud). */
    async clearSkill(skill) {
      localStorage.removeItem(LOCAL_KEYS[skill]);
      const user = await cloudUser();
      if (user) {
        await window.SB.from(TABLE).delete().eq('user_id', user.id).eq('skill', skill);
      }
    },

    /** Hapus seluruh riwayat (lokal + cloud). */
    async clearAll() {
      SKILLS.forEach((s) => localStorage.removeItem(LOCAL_KEYS[s]));
      const user = await cloudUser();
      if (user) {
        await window.SB.from(TABLE).delete().eq('user_id', user.id);
      }
    },

    /**
     * Pindahkan riwayat lokal lama ke cloud — HANYA kalau cloud masih kosong
     * untuk user ini. Jadi tidak pernah membuat duplikat saat login ulang.
     */
    async migrateLocalToCloud() {
      const user = await cloudUser();
      if (!user) return { migrated: 0 };

      // Cloud sudah ada isi? Lewati.
      const { count, error: cErr } = await window.SB
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (cErr) { console.warn('[Store] cek cloud gagal:', cErr.message); return { migrated: 0 }; }
      if ((count || 0) > 0) return { migrated: 0 };

      // Kumpulkan semua sesi lokal.
      const rows = [];
      SKILLS.forEach((skill) => {
        readLocal(skill).forEach((session) =>
          rows.push({ user_id: user.id, skill, data: session })
        );
      });
      if (rows.length === 0) return { migrated: 0 };

      const { error } = await window.SB.from(TABLE).insert(rows);
      if (error) { console.warn('[Store] migrasi gagal:', error.message); return { migrated: 0 }; }
      return { migrated: rows.length };
    }
  };

  window.Store = Store;
})();
