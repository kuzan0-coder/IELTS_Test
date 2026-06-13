/* =========================================================================
   app-shell.js — builds the sidebar on every page, enforces login (when
   Supabase is configured), shows the user box + theme toggle, and migrates
   old local history to the cloud on first login.

   It replaces the contents of the existing <aside>, so pages don't need to
   keep their nav markup in sync by hand.
   ========================================================================= */
(function () {
  const CONFIG = window.IELTS_CONFIG || { isConfigured: false };

  // Hide page content until the session check finishes (avoids a flash of
  // protected content for logged-out users). Only when login is active.
  if (CONFIG.isConfigured) {
    const gate = document.createElement('style');
    gate.id = 'auth-gate-style';
    gate.textContent = 'main{visibility:hidden}';
    (document.head || document.documentElement).appendChild(gate);
  }

  const NAV = [
    { href: 'index.html', label: 'Home', ico: '🏠', match: ['index', ''] },
    { href: 'reading.html', label: 'Reading', ico: '📖' },
    { href: 'listening.html', label: 'Listening', ico: '🎧' },
    { href: 'writing.html', label: 'Writing', ico: '✍️' },
    { href: 'speaking.html', label: 'Speaking', ico: '🗣️' },
    { href: 'vocabulary.html', label: 'Vocabulary', ico: '📚' },
    { href: 'tutorials.html', label: 'Tutorial', ico: '▶️' },
    { href: 'history.html', label: 'History', ico: '📊' },
    { href: 'plan.html', label: 'Study Plan', ico: '📅' },
    { href: 'tips.html', label: 'Tips & Tricks', ico: '💡' }
  ];

  function currentKey() {
    let p = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    return p === '' ? 'index' : p;
  }

  function buildNav() {
    const key = currentKey();
    return NAV.map((n) => {
      const nkey = n.href.replace('.html', '');
      const active = (n.match && n.match.includes(key)) || nkey === key;
      return `<a href="${n.href}" class="${active ? 'active' : ''}">` +
        `<span class="nav-ico">${n.ico}</span>${n.label}</a>`;
    }).join('');
  }

  function themeToggleHtml() {
    const dark = (window.IeltsTheme ? IeltsTheme.get() : 'light') === 'dark';
    return `<button class="theme-toggle" id="theme-toggle" type="button">
      <span><span class="ico">${dark ? '🌙' : '☀️'}</span> <span id="theme-label">${dark ? 'Mode Gelap' : 'Mode Terang'}</span></span>
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
          <div class="user-sub">☁️ Tersinkron</div>
        </div>
        <button class="logout-btn" id="logout-btn" type="button" title="Keluar">⎋</button>
      </div>`;
    }
    return `<div class="user-box">
      <div class="avatar">L</div>
      <div class="user-meta">
        <div class="user-name">Mode Lokal</div>
        <div class="user-sub">Data di perangkat ini</div>
      </div>
    </div>`;
  }

  function render(user) {
    const aside = document.querySelector('aside');
    if (!aside) return;
    aside.innerHTML =
      `<div class="brand"><img class="brand-logo" src="assets/logo.png" alt="IELTS Prep"><span class="brand-name">IELTS Prep</span></div>` +
      `<nav>${buildNav()}</nav>` +
      `<div class="sidebar-footer">${themeToggleHtml()}${userBoxHtml(user)}</div>`;

    const tt = document.getElementById('theme-toggle');
    if (tt) tt.addEventListener('click', () => {
      const next = IeltsTheme.toggle();
      const label = document.getElementById('theme-label');
      if (label) label.textContent = next === 'dark' ? 'Mode Gelap' : 'Mode Terang';
      const ico = tt.querySelector('.ico');
      if (ico) ico.textContent = next === 'dark' ? '🌙' : '☀️';
    });

    const lo = document.getElementById('logout-btn');
    if (lo) lo.addEventListener('click', async () => {
      lo.disabled = true;
      await Auth.signOut();
      location.href = 'login.html';
    });
  }

  function reveal() {
    const gate = document.getElementById('auth-gate-style');
    if (gate) gate.remove();
  }

  async function start() {
    if (!CONFIG.isConfigured) {
      render(null); // local mode — no login required
      return;
    }
    let user = null;
    try { user = await Auth.getSessionUser(); } catch (e) { /* treat as logged out */ }

    if (!user) {
      const next = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
      location.replace('login.html?next=' + next);
      return;
    }
    render(user);
    reveal();
    try { await Store.migrateLocalToCloud(); } catch (e) { /* non-fatal */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
