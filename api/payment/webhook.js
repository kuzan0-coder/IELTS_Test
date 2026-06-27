// =============================================================================
// POST /api/payment/webhook — notifikasi pembayaran dari Midtrans.
// Set URL ini di dashboard Midtrans: Settings > Configuration >
//   Payment Notification URL = https://<domain-kamu>/api/payment/webhook
//
// KEAMANAN: setiap notifikasi diverifikasi dengan signature SHA-512 memakai
// Server Key. Tanpa verifikasi ini, siapa pun bisa mengaku "sudah bayar".
// =============================================================================
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    res.status(500).json({ error: 'MIDTRANS_SERVER_KEY belum diset.' });
    return;
  }

  const body = req.body || {};
  const {
    order_id, status_code, gross_amount, signature_key,
    transaction_status, fraud_status
  } = body;

  if (!order_id || !signature_key) {
    res.status(400).json({ error: 'Notifikasi tidak valid.' });
    return;
  }

  // Verifikasi signature: sha512(order_id + status_code + gross_amount + serverKey).
  const expected = crypto
    .createHash('sha512')
    .update(String(order_id) + String(status_code) + String(gross_amount) + serverKey)
    .digest('hex');

  if (expected !== signature_key) {
    res.status(403).json({ error: 'Signature tidak cocok.' });
    return;
  }

  const isPaid =
    transaction_status === 'settlement' ||
    (transaction_status === 'capture' && fraud_status === 'accept');

  try {
    if (isPaid) {
      await markPaid(order_id, gross_amount);
    } else if (['deny', 'cancel', 'expire', 'failure'].includes(transaction_status)) {
      await patchOrder(order_id, { status: 'failed', updated_at: new Date().toISOString() });
    }
  } catch (e) {
    // Log saja; tetap balas 200 di bawah agar Midtrans tidak retry tanpa henti.
    console.error('[webhook] gagal memproses:', e.message || e);
  }

  // Selalu 200 supaya Midtrans menganggap notifikasi diterima.
  res.status(200).json({ ok: true });
};

// --- helpers -----------------------------------------------------------------

function svcHeaders(extra) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign(
    {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    },
    extra || {}
  );
}

async function markPaid(orderId, grossAmount) {
  const url = process.env.SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  // Ambil order untuk tahu user_id + cegah dobel proses.
  const r = await fetch(
    `${url}/rest/v1/payment_orders?order_id=eq.${encodeURIComponent(orderId)}&select=user_id,status`,
    { headers: svcHeaders() }
  );
  const rows = await r.json().catch(() => []);
  const order = Array.isArray(rows) ? rows[0] : null;
  if (!order || order.status === 'paid') return; // tidak ada / sudah diproses

  const amount = Math.round(parseFloat(grossAmount || '0'));

  await patchOrder(orderId, { status: 'paid', updated_at: new Date().toISOString() });

  // Upsert lisensi (user_id = primary key). merge-duplicates = update bila ada.
  await fetch(`${url}/rest/v1/licenses`, {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({
      user_id: order.user_id,
      status: 'active',
      plan: 'lifetime',
      order_id: orderId,
      amount,
      paid_at: new Date().toISOString()
    })
  });
}

async function patchOrder(orderId, fields) {
  const url = process.env.SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  await fetch(`${url}/rest/v1/payment_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(fields)
  });
}
