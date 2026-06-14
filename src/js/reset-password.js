/* =========================================================================
   reset-password.js — halaman tujuan link reset dari email.
   Supabase otomatis membaca token recovery dari URL (detectSessionInUrl),
   sehingga user berada dalam sesi sementara untuk mengganti password.
   ========================================================================= */
(function () {
  const configured = window.Auth && Auth.isConfigured();

  const els = {
    form: document.getElementById('rp-form'),
    pass: document.getElementById('rp-pass'),
    pass2: document.getElementById('rp-pass2'),
    submit: document.getElementById('rp-submit'),
    msg: document.getElementById('rp-msg')
  };

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = 'auth-msg show ' + (kind || 'info');
  }

  if (!configured) {
    els.form.classList.add('hidden');
    showMsg('Fitur reset password belum aktif (Supabase belum dikonfigurasi).', 'info');
    return;
  }

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = els.pass.value;
    const p2 = els.pass2.value;

    if (p1.length < 6) { showMsg('Password baru minimal 6 karakter.', 'error'); return; }
    if (p1 !== p2) { showMsg('Konfirmasi password tidak sama.', 'error'); return; }

    els.submit.disabled = true;
    els.submit.textContent = 'Menyimpan…';
    const res = await Auth.updatePassword(p1);
    els.submit.disabled = false;
    els.submit.textContent = 'Simpan Password Baru';

    if (!res.ok) {
      showMsg(res.error, 'error');
      return;
    }
    showMsg('Password berhasil diubah! Mengarahkan ke Home…', 'success');
    setTimeout(() => location.replace('index.html'), 1500);
  });
})();
