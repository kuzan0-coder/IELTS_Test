/* =========================================================================
   landing.js — perilaku halaman publik (landing page & kalkulator band).
   Sengaja TIDAK memuat Supabase supaya halaman depan tetap ringan.

   Angka komunitas: diambil dari /api/stats (data asli dari database) dan
   baru ditampilkan setelah melewati ambang minimum di bawah. Angka kecil
   ("12 pengguna") justru mengurangi kepercayaan, jadi sebelum itu yang
   tampil hanya fakta produk (jumlah skill, materi, dll.).
   ========================================================================= */
(function () {
  const MIN_LEARNERS = 100;
  const MIN_SESSIONS = 500;

  const SVG = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICON_SUN = `<svg ${SVG}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/></svg>`;
  const ICON_MOON = `<svg ${SVG}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Tema ---------------------------------------------------------------
  const themeBtn = document.getElementById('lp-theme');
  function paintTheme() {
    if (themeBtn && window.IeltsTheme) themeBtn.innerHTML = IeltsTheme.get() === 'dark' ? ICON_MOON : ICON_SUN;
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
      a.textContent = a.dataset.ctaAuthed;
      a.href = 'home.html';
    });
  }

  // ---- Animasi muncul saat di-scroll -------------------------------------
  const revealEls = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  }

  // ---- Angka komunitas (asli, dengan ambang) ------------------------------
  function niceCount(n) {
    const step = n >= 10000 ? 1000 : n >= 1000 ? 100 : 10;
    return (Math.floor(n / step) * step).toLocaleString('id-ID') + '+';
  }

  async function loadStats() {
    const wrap = document.getElementById('lp-stats');
    if (!wrap || !/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch('/api/stats');
      if (!r.ok) return;
      const d = await r.json();
      const live = [];
      if (d.learners >= MIN_LEARNERS) live.push([niceCount(d.learners), 'pelajar terdaftar']);
      if (d.sessions >= MIN_SESSIONS) live.push([niceCount(d.sessions), 'sesi latihan diselesaikan']);
      // Angka komunitas menggantikan fakta produk paling belakang, total tetap 4.
      live.reverse().forEach(([num, label]) => {
        const el = document.createElement('div');
        el.className = 'lp-stat';
        el.innerHTML = `<b>${num}</b><span>${label}</span>`;
        wrap.prepend(el);
        wrap.lastElementChild.remove();
      });
    } catch (e) { /* biarkan fakta produk saja */ }
  }

  // ---- Testimoni (dari data/testimonials.json) ----------------------------
  async function loadTestimonials() {
    const section = document.getElementById('testimoni');
    const grid = document.getElementById('lp-testis');
    if (!section || !grid) return;
    try {
      const r = await fetch('data/testimonials.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const list = (await r.json()).filter((t) => t && t.name && t.quote).slice(0, 6);
      if (!list.length) return;
      grid.innerHTML = list.map((t) => {
        const band = Number(t.band);
        return `<figure class="lp-testi">
          <blockquote>“${escapeHtml(t.quote)}”</blockquote>
          <figcaption class="lp-testi-foot">
            <span class="lp-avatar">${escapeHtml(t.name.trim().charAt(0).toUpperCase())}</span>
            <span>
              <span class="lp-testi-name">${escapeHtml(t.name)}</span>
              ${t.meta ? `<span class="lp-testi-meta">${escapeHtml(t.meta)}</span>` : ''}
            </span>
            ${band > 0 ? `<span class="lp-testi-band">Band ${band.toFixed(1)}</span>` : ''}
          </figcaption>
        </figure>`;
      }).join('');
      section.hidden = false;
    } catch (e) { /* tanpa testimoni, section tetap tersembunyi */ }
  }

  loadStats();
  loadTestimonials();
})();
