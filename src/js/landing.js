/* =========================================================================
   landing.js — perilaku halaman publik (landing page & kalkulator band).
   Sengaja TIDAK memuat Supabase supaya halaman depan tetap ringan.

   Angka komunitas: diambil dari /api/stats (data asli dari database) dan
   baru ditampilkan setelah melewati ambang minimum di bawah. Angka kecil
   ("12 pengguna") justru mengurangi kepercayaan, jadi sebelum itu baris
   angka tidak muncul sama sekali.
   ========================================================================= */
(function () {
  const MIN_LEARNERS = 100;
  const MIN_SESSIONS = 500;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Tema (tombol di footer) --------------------------------------------
  const themeBtn = document.getElementById('lp-theme');
  function paintTheme() {
    themeBtn.textContent = IeltsTheme.get() === 'dark' ? 'Mode terang' : 'Mode gelap';
  }
  if (themeBtn && window.IeltsTheme) {
    themeBtn.addEventListener('click', () => { IeltsTheme.toggle(); paintTheme(); });
    paintTheme();
  }

  // ---- Garis bawah nav saat di-scroll ------------------------------------
  const nav = document.querySelector('.lp-nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- Pengunjung yang sudah login: arahkan CTA ke dashboard --------------
  // Cukup cek token sesi Supabase di localStorage (tanpa memuat library).
  function hasSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        if (/^sb-.+-auth-token$/.test(localStorage.key(i))) return true;
      }
    } catch (e) { /* storage diblokir -> anggap tamu */ }
    return false;
  }
  if (hasSession()) {
    const login = document.getElementById('nav-login');
    if (login) login.hidden = true;
    document.querySelectorAll('[data-cta-authed]').forEach((a) => {
      const arrow = a.querySelector('.arr');
      a.textContent = a.dataset.ctaAuthed + (arrow ? ' ' : '');
      if (arrow) a.appendChild(arrow);
      a.href = 'home.html';
    });
  }

  // ---- Angka komunitas (asli, dengan ambang) ------------------------------
  function niceCount(n) {
    const step = n >= 10000 ? 1000 : n >= 1000 ? 100 : 10;
    return (Math.floor(n / step) * step).toLocaleString('id-ID') + '+';
  }

  async function loadProof() {
    const el = document.getElementById('lp-proof');
    if (!el || !/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch('/api/stats');
      if (!r.ok) return;
      const d = await r.json();
      const parts = [];
      if (d.learners >= MIN_LEARNERS) parts.push(`<b>${niceCount(d.learners)}</b> pelajar terdaftar`);
      if (d.sessions >= MIN_SESSIONS) parts.push(`<b>${niceCount(d.sessions)}</b> sesi latihan diselesaikan`);
      if (!parts.length) return;
      el.innerHTML = parts.join(' · ');
      el.hidden = false;
    } catch (e) { /* tanpa angka, baris tetap tersembunyi */ }
  }

  // ---- Testimoni (dari data/testimonials.json) ----------------------------
  async function loadTestimonials() {
    const section = document.getElementById('testimoni');
    const grid = document.getElementById('lp-quotes');
    if (!section || !grid) return;
    try {
      const r = await fetch('data/testimonials.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const list = (await r.json()).filter((t) => t && t.name && t.quote).slice(0, 6);
      if (!list.length) return;
      grid.innerHTML = list.map((t) => {
        const band = Number(t.band);
        return `<figure class="lp-quote">
          <blockquote>“${escapeHtml(t.quote)}”</blockquote>
          <figcaption><b>${escapeHtml(t.name)}</b>${t.meta ? ' · ' + escapeHtml(t.meta) : ''}${band > 0 ? ` · <span class="band">band ${band.toFixed(1)}</span>` : ''}</figcaption>
        </figure>`;
      }).join('');
      section.hidden = false;
    } catch (e) { /* tanpa testimoni, section tetap tersembunyi */ }
  }

  loadProof();
  loadTestimonials();
})();
