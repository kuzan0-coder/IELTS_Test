/* =========================================================================
   pw-toggle.js — tombol mata untuk lihat/sembunyikan password.
   Pasang di halaman mana pun: cukup beri tombol
     <button class="pw-toggle" data-target="ID_INPUT"></button>
   di samping input password (lihat .password-wrap di landing.css).
   ========================================================================= */
(function () {
  const SVG = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const EYE = `<svg ${SVG}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_OFF = `<svg ${SVG}><path d="m3 3 18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2"/><path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

  function wire() {
    document.querySelectorAll('.pw-toggle').forEach((btn) => {
      if (btn.dataset.wired) return;       // hindari pasang handler dobel
      btn.dataset.wired = '1';
      btn.innerHTML = EYE;
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = show ? EYE_OFF : EYE;
        btn.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
