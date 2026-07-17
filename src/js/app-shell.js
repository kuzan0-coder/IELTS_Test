/* =========================================================================
   app-shell.js — builds the sidebar on every page, shows the user box +
   theme toggle, and migrates old local history to the cloud on first login.

   Login TIDAK dipaksa: pengunjung boleh mencoba materi gratis dulu (mode
   tamu — data tersimpan di perangkat). Fitur cloud/AI/pembelian tetap
   meminta login pada saat dibutuhkan.

   It replaces the contents of the existing <aside>, so pages don't need to
   keep their nav markup in sync by hand.
   ========================================================================= */
(function () {
  const CONFIG = window.IELTS_CONFIG || { isConfigured: false };

  // Ikon SVG (stroke mengikuti warna teks) — tampilan lebih rapi dari emoji.
  const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    home: `<svg ${SVG_ATTRS}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>`,
    reading: `<svg ${SVG_ATTRS}><path d="M2 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-7a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h7z"/></svg>`,
    listening: `<svg ${SVG_ATTRS}><path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="7" rx="2"/><rect x="17" y="13" width="4" height="7" rx="2"/></svg>`,
    writing: `<svg ${SVG_ATTRS}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
    speaking: `<svg ${SVG_ATTRS}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/></svg>`,
    mock: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.5"/></svg>`,
    vocabulary: `<svg ${SVG_ATTRS}><path d="m12 2 10 6-10 6L2 8z"/><path d="m2 14 10 6 10-6"/></svg>`,
    tutorials: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/></svg>`,
    history: `<svg ${SVG_ATTRS}><path d="M6 20v-7"/><path d="M12 20V6"/><path d="M18 20v-10"/><path d="M3 20h18"/></svg>`,
    plan: `<svg ${SVG_ATTRS}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>`,
    tips: `<svg ${SVG_ATTRS}><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.6 1.2-.6 2.2h-6c0-1 0-1.7-.6-2.2A6 6 0 0 1 12 3z"/></svg>`,
    sparkle: `<svg ${SVG_ATTRS}><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`,
    login: `<svg ${SVG_ATTRS}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/></svg>`,
    logout: `<svg ${SVG_ATTRS}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>`,
    sun: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/></svg>`,
    moon: `<svg ${SVG_ATTRS}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`
  };

  // Navigasi dikelompokkan supaya sidebar mudah dipindai.
  const NAV_GROUPS = [
    {
      label: '',
      items: [{ href: 'index.html', label: 'Home', ico: 'home', match: ['index', ''] }]
    },
    {
      label: 'Latihan',
      items: [
        { href: 'reading.html', label: 'Reading', ico: 'reading' },
        { href: 'listening.html', label: 'Listening', ico: 'listening' },
        { href: 'writing.html', label: 'Writing', ico: 'writing' },
        { href: 'speaking.html', label: 'Speaking', ico: 'speaking' },
        { href: 'mock.html', label: 'Mock Test', ico: 'mock' },
        { href: 'vocabulary.html', label: 'Vocabulary', ico: 'vocabulary' }
      ]
    },
    {
      label: 'Belajar',
      items: [
        { href: 'plan.html', label: 'Study Plan', ico: 'plan' },
        { href: 'tips.html', label: 'Tips & Tricks', ico: 'tips' },
        { href: 'tutorials.html', label: 'Tutorial', ico: 'tutorials' }
      ]
    },
    {
      label: 'Progres',
      items: [{ href: 'history.html', label: 'History', ico: 'history' }]
    }
  ];

  function currentKey() {
    let p = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    return p === '' ? 'index' : p;
  }

  function buildNav() {
    const key = currentKey();
    return NAV_GROUPS.map((g) => {
      const label = g.label ? `<div class="nav-label">${g.label}</div>` : '';
      const links = g.items.map((n) => {
        const nkey = n.href.replace('.html', '');
        const active = (n.match && n.match.includes(key)) || nkey === key;
        return `<a href="${n.href}" class="${active ? 'active' : ''}">` +
          `<span class="nav-ico">${ICONS[n.ico] || ''}</span>${n.label}</a>`;
      }).join('');
      return label + links;
    }).join('');
  }

  function themeToggleHtml() {
    const dark = (window.IeltsTheme ? IeltsTheme.get() : 'light') === 'dark';
    return `<button class="theme-toggle" id="theme-toggle" type="button">
      <span><span class="ico">${dark ? ICONS.moon : ICONS.sun}</span> <span id="theme-label">${dark ? 'Mode Gelap' : 'Mode Terang'}</span></span>
      <span style="opacity:.55">⇄</span>
    </button>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function userBoxHtml(user) {
    if (user) {
      const email = user.email || 'User';
      const meta = user.user_metadata || {};
      const display = meta.full_name || email.split('@')[0];
      const initial = escapeHtml(display.charAt(0).toUpperCase());
      const name = escapeHtml(display);
      return `<div class="user-box">
        <div class="avatar">${initial}</div>
        <div class="user-meta">
          <div class="user-name">${name}</div>
          <div class="user-sub">Tersinkron ke cloud</div>
        </div>
        <button class="logout-btn" id="logout-btn" type="button" title="Keluar">${ICONS.logout}</button>
      </div>`;
    }
    if (CONFIG.isConfigured) {
      // Tamu: boleh berlatih, tapi tawarkan login untuk simpan progres di cloud.
      const next = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
      return `<a class="login-cta" href="login.html?next=${next}">${ICONS.login}<span>Masuk / Daftar</span></a>
        <div class="small-note" style="text-align:center">Progres tamu tersimpan di perangkat ini</div>`;
    }
    return `<div class="user-box">
      <div class="avatar">T</div>
      <div class="user-meta">
        <div class="user-name">Akun Tamu</div>
        <div class="user-sub">Data tersimpan di perangkat ini</div>
      </div>
    </div>`;
  }

  function render(user) {
    const aside = document.querySelector('aside');
    if (!aside) return;
    aside.innerHTML =
      `<div class="brand"><img class="brand-logo" src="assets/logo.png" alt="IELTS Prep"><span class="brand-name">IELTS Prep</span></div>` +
      `<nav>${buildNav()}</nav>` +
      `<div class="sidebar-footer">` +
        `<a class="upgrade-cta" id="upgrade-cta" href="upgrade.html">${ICONS.sparkle}<span>Buka Akses Penuh</span></a>` +
        themeToggleHtml() + userBoxHtml(user) +
      `</div>`;

    // Sembunyikan CTA upgrade untuk user yang sudah membayar.
    if (window.License) {
      License.isPaid().then((paid) => {
        const cta = document.getElementById('upgrade-cta');
        if (paid && cta) cta.remove();
      }).catch(() => { /* biarkan CTA tampil */ });
    }

    const tt = document.getElementById('theme-toggle');
    if (tt) tt.addEventListener('click', () => {
      const next = IeltsTheme.toggle();
      const label = document.getElementById('theme-label');
      if (label) label.textContent = next === 'dark' ? 'Mode Gelap' : 'Mode Terang';
      const ico = tt.querySelector('.ico');
      if (ico) ico.innerHTML = next === 'dark' ? ICONS.moon : ICONS.sun;
    });

    const lo = document.getElementById('logout-btn');
    if (lo) lo.addEventListener('click', async () => {
      lo.disabled = true;
      await Auth.signOut();
      location.href = 'login.html';
    });
  }

  async function start() {
    let user = null;
    if (CONFIG.isConfigured) {
      try { user = await Auth.getSessionUser(); } catch (e) { /* treat as guest */ }
    }
    render(user);
    if (user) {
      try { await Store.migrateLocalToCloud(); } catch (e) { /* non-fatal */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
