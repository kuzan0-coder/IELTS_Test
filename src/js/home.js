/* =========================================================================
   home.js — dashboard. Reads history through Store (cloud when logged in,
   local otherwise).
   ========================================================================= */
(function () {
  const today = new Date();
  document.getElementById('today-date').textContent = today.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Sapaan dinamis: ambil nama dari email user yang login (bagian sebelum "@").
  // Kalau mode lokal / belum login, biarkan teks default "Halo".
  (async function renderGreeting() {
    const el = document.getElementById('greeting');
    if (!el) return;
    try {
      const user = window.Auth ? await Auth.getSessionUser() : null;
      if (user) {
        const meta = user.user_metadata || {};
        let name = meta.full_name;               // nama dari form Daftar
        if (!name && user.email) {               // fallback: bagian sebelum "@"
          const local = user.email.split('@')[0];
          name = local.charAt(0).toUpperCase() + local.slice(1);
        }
        if (name) el.textContent = `Halo, ${name}!`;
      }
    } catch (e) { /* biarkan sapaan default */ }
  })();

  const SKILLS = ['reading', 'listening', 'writing', 'speaking'];

  const skillStatsEl = document.getElementById('skill-stats');
  const overallEl = document.getElementById('overall-avg');
  const historyEl = document.getElementById('history-list');

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  async function render() {
    const allSessions = await Store.getAllHistory();
    const bySkill = {};
    SKILLS.forEach((s) => (bySkill[s] = allSessions.filter((x) => x.skill === s)));

    // --- Per-skill stat cards ---
    skillStatsEl.innerHTML = '';
    SKILLS.forEach((skill) => {
      const history = bySkill[skill];
      let display = '—';
      let trend = '';
      if (history.length > 0) {
        const last3 = history.slice(-3);
        const avg = last3.reduce((sum, h) => sum + h.band, 0) / last3.length;
        display = avg.toFixed(1);
        // Tren dibandingkan skor PERTAMA user sendiri (progres pribadi mereka).
        if (history.length > 1) {
          const delta = avg - history[0].band;
          if (delta > 0) trend = ` <span style="color:var(--success);font-size:13px">↑ +${delta.toFixed(1)}</span>`;
          else if (delta < 0) trend = ` <span style="color:var(--error);font-size:13px">↓ ${delta.toFixed(1)}</span>`;
        }
      }

      const card = document.createElement('div');
      card.className = 'card stat-card-wrap';
      card.style.margin = '0';
      card.innerHTML = `
        <div class="stat">
          <span class="stat-label">${cap(skill)}</span>
          <span class="stat-value">${display}${trend}</span>
          <span class="small-note">${history.length} sesi</span>
        </div>
        ${history.length > 0 ? `<button class="reset-skill-btn" data-skill="${skill}" title="Reset skor ${skill}">🗑️</button>` : ''}
      `;
      skillStatsEl.appendChild(card);
    });

    // Reset-per-skill handlers
    skillStatsEl.querySelectorAll('.reset-skill-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const skill = btn.dataset.skill;
        const ok = window.UI
          ? await UI.confirm(`Semua skor & riwayat ${cap(skill)} akan dihapus dan tidak bisa dikembalikan.`, { title: `Reset riwayat ${cap(skill)}?`, okText: 'Hapus', danger: true })
          : confirm(`Reset semua skor & riwayat ${skill}?`);
        if (ok) {
          await Store.clearSkill(skill);
          render();
        }
      });
    });

    // --- Overall average (uses latest band of each skill) ---
    const latestPerSkill = {};
    SKILLS.forEach((skill) => {
      const h = bySkill[skill];
      if (h.length > 0) latestPerSkill[skill] = h[h.length - 1].band;
    });
    const skillsWithData = Object.keys(latestPerSkill);

    overallEl.innerHTML = '';
    if (skillsWithData.length === 4) {
      const avg = Object.values(latestPerSkill).reduce((a, b) => a + b, 0) / 4;
      const target = avg >= 6.5 ? 'sudah mencapai target!' : `kurang ${(6.5 - avg).toFixed(1)} band dari target`;
      overallEl.innerHTML = `Skor rata-rata sekarang: <strong>${avg.toFixed(1)}</strong> — ${target}`;
    } else {
      const missing = SKILLS.filter((s) => !latestPerSkill[s]);
      overallEl.textContent = `Belum bisa hitung — coba dulu: ${missing.join(', ')}`;
    }

    if (allSessions.length > 0) {
      const resetAll = document.createElement('button');
      resetAll.className = 'reset-all-btn';
      resetAll.textContent = 'Reset semua data';
      resetAll.addEventListener('click', async () => {
        const ok = window.UI
          ? await UI.confirm('SEMUA skor dan riwayat dari ke-4 skill akan dihapus dan tidak bisa dikembalikan.', { title: 'Reset semua data?', okText: 'Hapus semua', danger: true })
          : confirm('Reset SEMUA skor dan riwayat dari ke-4 skill?');
        if (ok) {
          await Store.clearAll();
          render();
        }
      });
      overallEl.parentElement.appendChild(resetAll);
    }

    // --- Recent sessions (latest 8) ---
    const recent = allSessions.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
    if (recent.length > 0) {
      historyEl.innerHTML = '';
      recent.forEach((h) => {
        const item = document.createElement('div');
        item.className = 'passage-card';
        const subTitle = h.cardTitle || h.promptTitle || h.passageTitle || h.testTitle || '';
        const extra = `${h.correct !== undefined ? ' · ' + h.correct + '/' + h.total + ' benar' : ''}${h.wordCount ? ' · ' + h.wordCount + ' kata' : ''}${h.duration ? ' · ' + h.duration + ' detik' : ''}`;
        item.innerHTML = `
          <div>
            <div class="title">${cap(h.skill)} — ${subTitle}</div>
            <div class="desc">${new Date(h.date).toLocaleString('id-ID')}${extra}</div>
          </div>
          <div class="stat-value" style="font-size:24px">${h.band.toFixed(1)}</div>
        `;
        historyEl.appendChild(item);
      });
    } else {
      historyEl.innerHTML = '<p style="color: var(--text-muted)">Belum ada sesi. Mulai latihan pertamamu!</p>';
    }
  }

  render();
})();
