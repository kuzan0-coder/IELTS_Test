/* =========================================================================
   upgrade.js — halaman "Buka Akses Penuh".
   - Sudah berbayar  -> konfirmasi.
   - Belum           -> harga + manfaat + tombol bayar (Midtrans Snap).

   Alur bayar: POST /api/payment/create -> dapat { token, clientKey, snapUrl }
   -> load Snap -> snap.pay(token). Status lunas DITETAPKAN oleh webhook di
   server (aman), jadi setelah sukses kita poll License.isPaid() sebentar.
   ========================================================================= */
(function () {
  const PRICE_LABEL = 'Rp 99.000';
  const root = document.getElementById('upgrade-root');

  const BENEFITS = [
    'Semua passage Reading (bukan cuma 1)',
    'Semua test Listening lengkap',
    'Mock Test — simulasi ujian beruntun + skor gabungan',
    'Penilaian AI Writing per kriteria (TR, CC, LR, GRA)',
    'Feedback AI Speaking + contoh jawaban band 7',
    'Penjelasan AI untuk tiap jawaban Reading',
    'Kuota penilaian AI 60×/bulan — cukup untuk 2 latihan/hari',
    'Akses selamanya — sekali bayar, tanpa langganan'
  ];

  function paidView() {
    root.innerHTML = `
      <div class="upgrade-paid">
        <div class="lock-emoji">🎉</div>
        <h2>Kamu sudah punya Akses Penuh</h2>
        <p style="color:var(--text-muted);margin:8px 0 18px">Semua fitur sudah terbuka. Selamat belajar!</p>
        <a href="index.html" class="btn">Ke Dashboard</a>
      </div>`;
  }

  function offerView() {
    root.innerHTML = `
      <div class="upgrade-card">
        <div class="lock-emoji">✨</div>
        <h2>Buka Akses Penuh IELTS Prep</h2>
        <div class="upgrade-price">${PRICE_LABEL} <small>/ sekali bayar</small></div>
        <div class="upgrade-once">Sekali bayar — akses selamanya, tanpa langganan</div>
        <ul class="upgrade-benefits">
          ${BENEFITS.map((b) => `<li><span class="ok">✓</span><span>${b}</span></li>`).join('')}
        </ul>
        <button class="btn block" id="buy-btn" type="button">Beli Akses — ${PRICE_LABEL}</button>
        <div class="upgrade-note" id="buy-note">
          Pembayaran aman lewat Midtrans (QRIS, GoPay, OVO, transfer bank, kartu).
          Dengan membeli kamu menyetujui
          <a href="terms.html">Syarat &amp; Ketentuan</a> dan
          <a href="refund.html">Kebijakan Refund</a>.
        </div>
      </div>`;
    document.getElementById('buy-btn').addEventListener('click', startCheckout);
  }

  function loadSnap(snapUrl, clientKey) {
    return new Promise((resolve, reject) => {
      if (window.snap) return resolve();
      const s = document.createElement('script');
      s.src = snapUrl;
      s.setAttribute('data-client-key', clientKey);
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Gagal memuat Midtrans Snap.'));
      document.head.appendChild(s);
    });
  }

  async function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.SB && window.SB.auth) {
      const { data } = await window.SB.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  function setBtn(btn, disabled, text) {
    btn.disabled = disabled;
    btn.textContent = text;
  }

  // Setelah bayar, lisensi ditulis webhook (bisa telat beberapa detik). Poll.
  async function waitForLicense(note) {
    note.textContent = '✅ Pembayaran diterima — mengaktifkan akses…';
    for (let i = 0; i < 8; i++) {
      if (await License.isPaid(true)) { location.href = 'upgrade.html'; return; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    note.innerHTML = 'Pembayaran diterima. Akses biasanya aktif dalam semenit — '
      + '<a href="upgrade.html">refresh halaman ini</a> sebentar lagi.';
  }

  /** true jika ada sesi login aktif. */
  async function isLoggedIn() {
    try {
      if (!window.SB || !window.SB.auth) return false;
      const { data } = await window.SB.auth.getSession();
      return !!(data && data.session);
    } catch (e) { return false; }
  }

  async function startCheckout() {
    const btn = document.getElementById('buy-btn');
    const note = document.getElementById('buy-note');

    // Pembelian butuh akun (lisensi menempel ke akun). Arahkan login dulu.
    if (!(await isLoggedIn())) {
      note.textContent = 'Kamu perlu masuk / daftar dulu supaya akses menempel di akunmu. Mengarahkan…';
      setTimeout(() => { location.href = 'login.html?next=upgrade.html'; }, 900);
      return;
    }

    setBtn(btn, true, 'Memproses…');
    try {
      const res = await fetch('/api/payment/create', { method: 'POST', headers: await authHeaders() });
      const data = await res.json().catch(() => ({}));

      if (data.alreadyPaid) { License.clearCache(); location.href = 'upgrade.html'; return; }
      if (!res.ok || !data.token) {
        throw new Error(data.error || `Gagal memulai pembayaran (${res.status}).`);
      }

      // Server masih memakai Midtrans SANDBOX (mode uji coba) — pembayaran
      // sungguhan belum bisa diproses. Jangan tampilkan popup uji coba ke
      // calon pembeli; beri pesan jelas. (Bypass untuk tes internal: ?testpay=1)
      const isSandbox = (data.snapUrl || '').includes('sandbox');
      const allowTest = new URLSearchParams(location.search).get('testpay') === '1';
      if (isSandbox && !allowTest) {
        note.textContent = 'Pembayaran online sedang disiapkan dan akan dibuka dalam 1-2 hari. Coba lagi nanti, ya!';
        setBtn(btn, false, `Beli Akses — ${PRICE_LABEL}`);
        return;
      }

      await loadSnap(data.snapUrl, data.clientKey);
      window.snap.pay(data.token, {
        onSuccess: () => waitForLicense(note),
        onPending: () => { note.textContent = 'Menunggu pembayaranmu diselesaikan…'; setBtn(btn, false, `Beli Akses — ${PRICE_LABEL}`); },
        onError: () => { note.textContent = '⚠️ Pembayaran gagal. Coba lagi.'; setBtn(btn, false, `Beli Akses — ${PRICE_LABEL}`); },
        onClose: () => { setBtn(btn, false, `Beli Akses — ${PRICE_LABEL}`); }
      });
    } catch (err) {
      note.textContent = '⚠️ ' + (err.message || String(err));
      setBtn(btn, false, `Beli Akses — ${PRICE_LABEL}`);
    }
  }

  (async function start() {
    const paid = window.License ? await License.isPaid(true) : false;
    if (paid) paidView(); else offerView();
  })();
})();
