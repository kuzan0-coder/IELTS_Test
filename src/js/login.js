/* =========================================================================
   login.js — drives the login / signup form.
   ========================================================================= */
(function () {
  const configured = window.Auth && Auth.isConfigured();

  // Where to go after a successful login (sanitised: same-folder .html only).
  function safeNext() {
    const raw = new URLSearchParams(location.search).get('next') || 'index.html';
    return /^[a-z0-9_-]+\.html$/i.test(raw) ? raw : 'index.html';
  }

  const els = {
    forms: document.getElementById('auth-forms'),
    localNotice: document.getElementById('local-notice'),
    tabLogin: document.getElementById('tab-login'),
    tabSignup: document.getElementById('tab-signup'),
    form: document.getElementById('auth-form'),
    name: document.getElementById('name'),
    email: document.getElementById('email'),
    phone: document.getElementById('phone'),
    password: document.getElementById('password'),
    password2: document.getElementById('password2'),
    submit: document.getElementById('submit-btn'),
    msg: document.getElementById('auth-msg'),
    title: document.getElementById('form-title'),
    sub: document.getElementById('form-sub'),
    tabs: document.querySelector('.auth-tabs'),
    fieldPassword: document.getElementById('field-password'),
    forgotRow: document.getElementById('forgot-row'),
    forgotLink: document.getElementById('forgot-link'),
    backLogin: document.getElementById('back-login'),
    // Pembungkus field yang hanya muncul saat mode Daftar.
    signupFields: Array.from(document.querySelectorAll('.signup-only'))
  };

  let mode = 'login'; // 'login' | 'signup' | 'reset'

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = 'auth-msg show ' + (kind || 'info');
  }
  function clearMsg() { els.msg.className = 'auth-msg'; }

  function setMode(next) {
    mode = next;
    const isLogin = mode === 'login';
    const isSignup = mode === 'signup';
    const isReset = mode === 'reset';

    // Tab Masuk/Daftar disembunyikan saat mode reset.
    els.tabs.classList.toggle('hidden', isReset);
    els.tabLogin.classList.toggle('active', isLogin);
    els.tabSignup.classList.toggle('active', isSignup);

    // Saat reset cukup email — sembunyikan & nonaktifkan field password
    // (input required yang tersembunyi bisa memblokir submit kalau tidak di-disable).
    els.fieldPassword.classList.toggle('hidden', isReset);
    els.password.disabled = isReset;
    els.password.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');

    // Nama, No. HP, Konfirmasi Password hanya saat Daftar.
    els.signupFields.forEach((f) => f.classList.toggle('hidden', !isSignup));

    // Link bantu: "Lupa password?" hanya di Masuk; "Kembali" hanya di reset.
    els.forgotRow.classList.toggle('hidden', !isLogin);
    els.backLogin.classList.toggle('hidden', !isReset);

    els.submit.textContent = isReset ? 'Kirim link reset' : (isLogin ? 'Masuk' : 'Daftar');
    els.title.textContent = isReset ? 'Reset password' : (isLogin ? 'Selamat datang' : 'Buat akun baru');
    els.sub.textContent = isReset
      ? 'Masukkan email akunmu, nanti kami kirim link untuk membuat password baru.'
      : (isLogin ? 'Masuk untuk lanjut latihan.' : 'Daftar gratis, mulai latihan dalam hitungan detik.');
    clearMsg();
  }

  // --- Layanan login tidak tersedia (konfigurasi belum aktif) --------------
  if (!configured) {
    els.forms.classList.add('hidden');
    els.localNotice.classList.remove('hidden');
    els.title.textContent = 'Mulai latihan';
    els.sub.textContent = 'Kamu bisa langsung berlatih tanpa akun.';
    return;
  }

  // --- Already logged in? Skip the form. ----------------------------------
  Auth.getSessionUser().then((user) => {
    if (user) location.replace(safeNext());
  });

  els.tabLogin.addEventListener('click', () => setMode('login'));
  els.tabSignup.addEventListener('click', () => setMode('signup'));
  els.forgotLink.addEventListener('click', () => setMode('reset'));
  els.backLogin.addEventListener('click', () => setMode('login'));

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = els.email.value.trim();

    // --- Mode reset password: cukup email, kirim link ke email ---
    if (mode === 'reset') {
      if (!email) { showMsg('Masukkan email akunmu dulu.', 'error'); return; }
      els.submit.disabled = true;
      els.submit.textContent = 'Mengirim…';
      const r = await Auth.requestPasswordReset(email);
      els.submit.disabled = false;
      els.submit.textContent = 'Kirim link reset';
      if (!r.ok) { showMsg(r.error, 'error'); return; }
      showMsg('Link reset dikirim ke ' + email + '. Cek email (termasuk folder Spam/Promosi), lalu klik link-nya untuk membuat password baru.', 'success');
      return;
    }

    const password = els.password.value;

    // --- Validasi dasar (berlaku untuk Masuk & Daftar) ---
    if (!email || password.length < 6) {
      showMsg('Isi email dan password (minimal 6 karakter).', 'error');
      return;
    }

    // --- Validasi khusus Daftar ---
    let name = '';
    let phone = '';
    if (mode === 'signup') {
      name = els.name.value.trim();
      phone = els.phone.value.trim();
      if (!name) {
        showMsg('Nama wajib diisi.', 'error');
        return;
      }
      if (password !== els.password2.value) {
        showMsg('Konfirmasi password tidak sama dengan password.', 'error');
        return;
      }
    }

    els.submit.disabled = true;
    els.submit.textContent = mode === 'login' ? 'Memproses…' : 'Mendaftarkan…';

    const res = mode === 'login'
      ? await Auth.signIn(email, password)
      : await Auth.signUp(email, password, { name, phone });

    els.submit.disabled = false;
    els.submit.textContent = mode === 'login' ? 'Masuk' : 'Daftar';

    if (!res.ok) {
      showMsg(res.error, 'error');
      return;
    }

    if (mode === 'signup' && res.needsConfirm) {
      showMsg('Akun dibuat! Cek email kamu untuk konfirmasi, lalu masuk.', 'success');
      setMode('login');
      return;
    }

    showMsg('Berhasil! Mengarahkan…', 'success');
    location.replace(safeNext());
  });

  setMode('login');
})();
