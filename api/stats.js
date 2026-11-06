// =============================================================================
// GET /api/stats — angka komunitas untuk landing page (social proof).
//
// Mengembalikan jumlah akun terdaftar & sesi latihan tersimpan di cloud.
// Angka ini ASLI dari database — landing page hanya menampilkannya kalau
// sudah melewati ambang minimum (lihat src/js/landing.js), jadi tidak ada
// angka karangan. Respons di-cache di CDN 1 jam supaya database tidak
// tersentuh setiap kali ada pengunjung.
// =============================================================================
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ ok: false });
    return;
  }

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    const [usersRes, sessionsRes] = await Promise.all([
      // GoTrue admin API mengirim total akun di header X-Total-Count.
      fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers }),
      // PostgREST: Prefer count=exact -> Content-Range "0-0/<total>".
      fetch(`${url}/rest/v1/practice_sessions?select=id&limit=1`, {
        headers: { ...headers, Prefer: 'count=exact' }
      })
    ]);

    const learners = Number(usersRes.headers.get('x-total-count')) || null;
    const range = sessionsRes.headers.get('content-range') || '';
    const sessions = Number(range.split('/')[1]) || null;

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ ok: true, learners, sessions });
  } catch (e) {
    res.status(502).json({ ok: false });
  }
};
