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
    // Pembungkus field yang hanya muncul saat mode Daftar.
    signupFields: Array.from(document.querySelectorAll('.signup-only'))
  };

  let mode = 'login'; // or 'signup'

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = 'auth-msg show ' + (kind || 'info');
  }
  function clearMsg() { els.msg.className = 'auth-msg'; }

  function setMode(next) {
    mode = next;
    const login = mode === 'login';
    els.tabLogin.classList.toggle('active', login);
    els.tabSignup.classList.toggle('active', !login);
    els.submit.textContent = login ? 'Masuk' : 'Daftar';
    els.title.textContent = login ? 'Selamat datang 👋' : 'Buat akun baru';
    els.sub.textContent = login ? 'Masuk untuk lanjut latihan.' : 'Daftar gratis, mulai latihan dalam hitungan detik.';
    els.password.setAttribute('autocomplete', login ? 'current-password' : 'new-password');
    // Nama, No. HP, dan Konfirmasi Password hanya tampil saat mode Daftar.
    els.signupFields.forEach((f) => f.classList.toggle('hidden', login));
    clearMsg();
  }

  // --- Local mode: no Supabase configured ---------------------------------
  if (!configured) {
    els.forms.classList.add('hidden');
    els.localNotice.classList.remove('hidden');
    els.title.textContent = 'Mode Lokal';
    els.sub.textContent = 'Login cloud belum diaktifkan.';
    return;
  }

  // --- Already logged in? Skip the form. ----------------------------------
  Auth.getSessionUser().then((user) => {
    if (user) location.replace(safeNext());
  });

  els.tabLogin.addEventListener('click', () => setMode('login'));
  els.tabSignup.addEventListener('click', () => setMode('signup'));

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = els.email.value.trim();
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
