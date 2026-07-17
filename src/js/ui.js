/* =========================================================================
   ui.js — komponen UI kecil yang dipakai lintas halaman.
   Menggantikan window.confirm()/alert() bawaan browser dengan modal yang
   konsisten dengan design system (light/dark aware).

   Pemakaian:
     const ok = await UI.confirm('Pesan…', { title, okText, cancelText, danger });
     await UI.alert('Pesan…', { title, okText });
   ========================================================================= */
(function () {
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function open(message, opts) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true"${opts.title ? ' aria-label="' + esc(opts.title) + '"' : ''}>
          ${opts.title ? `<h3>${esc(opts.title)}</h3>` : ''}
          <p>${esc(message)}</p>
          <div class="modal-actions">
            ${opts.cancelText ? `<button type="button" class="btn secondary" data-act="cancel">${esc(opts.cancelText)}</button>` : ''}
            <button type="button" class="btn${opts.danger ? ' danger' : ''}" data-act="ok">${esc(opts.okText)}</button>
          </div>
        </div>`;

      function close(val) {
        document.removeEventListener('keydown', onKey);
        ov.remove();
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter') close(true);
      }

      ov.addEventListener('click', (e) => { if (e.target === ov) close(false); });
      ov.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
      const cancel = ov.querySelector('[data-act="cancel"]');
      if (cancel) cancel.addEventListener('click', () => close(false));
      document.addEventListener('keydown', onKey);

      document.body.appendChild(ov);
      ov.querySelector('[data-act="ok"]').focus();
    });
  }

  window.UI = {
    /** Modal konfirmasi. Resolve true (OK) / false (batal). */
    confirm(message, opts) {
      opts = opts || {};
      return open(message, {
        title: opts.title,
        okText: opts.okText || 'Ya',
        cancelText: opts.cancelText || 'Batal',
        danger: !!opts.danger
      });
    },
    /** Modal informasi satu tombol. */
    alert(message, opts) {
      opts = opts || {};
      return open(message, { title: opts.title, okText: opts.okText || 'OK' });
    }
  };
})();
