/* =========================================================================
   theme.js — light/dark mode
   Loaded synchronously in <head> so the saved theme is applied BEFORE the
   page paints (prevents a flash of the wrong theme).
   ========================================================================= */
(function () {
  const KEY = 'ielts-theme';

  function systemPrefersDark() {
    return window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function current() {
    return localStorage.getItem(KEY) || (systemPrefersDark() ? 'dark' : 'light');
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // Apply immediately (documentElement exists even before <body>).
  apply(current());

  // Expose a toggle the sidebar button can call.
  window.IeltsTheme = {
    get: current,
    toggle() {
      const next = current() === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      apply(next);
      document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
      return next;
    }
  };
})();
