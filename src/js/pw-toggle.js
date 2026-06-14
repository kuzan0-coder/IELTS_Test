/* =========================================================================
   pw-toggle.js — tombol mata 👁️ untuk lihat/sembunyikan password.
   Pasang di halaman mana pun: cukup beri tombol
     <button class="pw-toggle" data-target="ID_INPUT"></button>
   di samping input password (lihat .password-wrap di styles.css).
   ========================================================================= */
(function () {
  function wire() {
    document.querySelectorAll('.pw-toggle').forEach((btn) => {
      if (btn.dataset.wired) return;       // hindari pasang handler dobel
      btn.dataset.wired = '1';
      btn.textContent = '👁️';
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁️';
        btn.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
