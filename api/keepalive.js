// =============================================================================
// GET /api/keepalive — dipanggil Vercel Cron (lihat vercel.json) setiap hari.
//
// Tujuan: menyentuh database Supabase secara ringan supaya project free-tier
// TIDAK di-pause otomatis karena dianggap tidak aktif (±7 hari idle).
// Insiden 2026-07-18: project paused -> DNS hilang -> seluruh login mati.
//
// Query-nya sengaja seringan mungkin (1 baris, kolom tunggal) dan respons
// tidak membocorkan data apa pun.
// =============================================================================
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ ok: false, error: 'SUPABASE_URL / SERVICE_ROLE_KEY belum diset.' });
    return;
  }

  try {
    const r = await fetch(`${url}/rest/v1/practice_sessions?select=id&limit=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    // Status apa pun dari PostgREST berarti database tersentuh; yang penting
    // bukan kegagalan jaringan/DNS (project paused).
    res.status(200).json({ ok: r.ok, dbStatus: r.status, at: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || String(e) });
  }
};
