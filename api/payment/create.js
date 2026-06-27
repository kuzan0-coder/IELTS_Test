// =============================================================================
// POST /api/payment/create — buat transaksi Midtrans Snap untuk user yang login.
// Mengembalikan { token, clientKey, snapUrl, orderId } untuk dipakai Snap di
// browser. Server menyimpan order 'pending'; status lunas ditetapkan oleh
// webhook (api/payment/webhook.js) setelah verifikasi signature.
// =============================================================================
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  const isSandbox = (process.env.MIDTRANS_IS_SANDBOX || 'true').toLowerCase() !== 'false';
  const price = parseInt(process.env.PRICE_IDR || '99000', 10);

  if (!serverKey || !clientKey) {
    res.status(500).json({ error: 'Pembayaran belum dikonfigurasi: set MIDTRANS_SERVER_KEY & MIDTRANS_CLIENT_KEY di Vercel.' });
    return;
  }

  // Wajib login.
  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ error: 'Silakan login dulu untuk membeli.' });
    return;
  }

  // Kalau sudah berbayar, tidak perlu bayar lagi.
  if (await hasLicense(user.id)) {
    res.status(200).json({ alreadyPaid: true });
    return;
  }

  const orderId = `IELTS-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  const saved = await insertOrder(orderId, user.id, price);
  if (!saved) {
    res.status(500).json({ error: 'Gagal menyimpan order. Pastikan tabel payment_orders sudah dibuat (supabase-payment.sql).' });
    return;
  }

  const snapApi = isSandbox
    ? 'https://app.sandbox.midtrans.com/snap/v1/transactions'
    : 'https://app.midtrans.com/snap/v1/transactions';

  try {
    const r = await fetch(snapApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Basic ' + Buffer.from(serverKey + ':').toString('base64')
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: price },
        item_details: [{ id: 'fullaccess', price, quantity: 1, name: 'IELTS Prep - Akses Penuh' }],
        customer_details: { email: user.email }
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.token) {
      const msg = (data.error_messages && data.error_messages.join(', ')) || `Midtrans error ${r.status}`;
      res.status(502).json({ error: msg });
      return;
    }

    const snapUrl = isSandbox
      ? 'https://app.sandbox.midtrans.com/snap/snap.js'
      : 'https://app.midtrans.com/snap/snap.js';

    res.status(200).json({ token: data.token, clientKey, snapUrl, orderId });
  } catch (e) {
    res.status(502).json({ error: 'Gagal menghubungi Midtrans: ' + (e.message || String(e)) });
  }
};

// --- helpers -----------------------------------------------------------------

async function verifyUser(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

async function hasLicense(userId) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return false;
  try {
    const r = await fetch(
      `${url}/rest/v1/licenses?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=user_id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function insertOrder(orderId, userId, amount) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return false;
  try {
    const r = await fetch(`${url}/rest/v1/payment_orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ order_id: orderId, user_id: userId, amount, status: 'pending' })
    });
    return r.ok;
  } catch {
    return false;
  }
}
