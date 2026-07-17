/* =========================================================================
   history.js — dedicated practice history page (cloud-aware via Store).
   ========================================================================= */
(function () {
  const SKILL_META = {
    reading: { icon: '📖', label: 'Reading' },
    listening: { icon: '🎧', label: 'Listening' },
    writing: { icon: '✍️', label: 'Writing' },
    speaking: { icon: '🗣️', label: 'Speaking' }
  };
  const SKILLS = Object.keys(SKILL_META);

  const el = {
    summary: document.getElementById('summary'),
    filters: document.getElementById('filters'),
    list: document.getElementById('history-list'),
    badge: document.getElementById('sync-badge'),
    resetAll: document.getElementById('reset-all')
  };

  let allSessions = [];
  let activeFilter = 'all';

  function subtitleOf(h) {
    return h.cardTitle || h.promptTitle || h.passageTitle || h.testTitle || h.task || '';
  }

  function metaOf(h) {
    const parts = [new Date(h.date).toLocaleString('id-ID')];
    if (h.correct !== undefined) parts.push(`${h.correct}/${h.total} benar`);
    if (h.wordCount) parts.push(`${h.wordCount} kata`);
    if (h.duration) parts.push(`${h.duration} detik`);
    return parts.join(' · ');
  }

  function renderSummary() {
    el.summary.innerHTML = '';
    SKILLS.forEach((skill) => {
      const sessions = allSessions.filter((s) => s.skill === skill);
      let val = '—';
      if (sessions.length) {
        const last3 = sessions.slice(-3);
        val = (last3.reduce((a, h) => a + h.band, 0) / last3.length).toFixed(1);
      }
      const card = document.createElement('div');
      card.className = 'card';
      card.style.margin = '0';
      card.innerHTML = `
        <div class="stat">
          <span class="stat-label">${SKILL_META[skill].icon} ${SKILL_META[skill].label}</span>
          <span class="stat-value">${val}</span>
          <span style="font-size:12px;color:var(--text-muted)">${sessions.length} sesi</span>
        </div>`;
      el.summary.appendChild(card);
    });
  }

  function renderFilters() {
    const counts = { all: allSessions.length };
    SKILLS.forEach((s) => (counts[s] = allSessions.filter((x) => x.skill === s).length));
    const chips = [{ key: 'all', label: 'Semua' }]
      .concat(SKILLS.map((s) => ({ key: s, label: SKILL_META[s].label })));

    el.filters.innerHTML = chips.map((c) =>
      `<button class="filter-chip ${c.key === activeFilter ? 'active' : ''}" data-key="${c.key}">${c.label} (${counts[c.key] || 0})</button>`
    ).join('');

    el.filters.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.key;
        renderFilters();
        renderList();
      });
    });
  }

  function renderList() {
    const rows = (activeFilter === 'all'
      ? allSessions
      : allSessions.filter((s) => s.skill === activeFilter)
    ).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!rows.length) {
      el.list.innerHTML = `
        <div class="empty-state">
          <div class="empty-ico">🗂️</div>
          <p>Belum ada sesi di kategori ini.<br>Mulai latihan, hasilnya akan muncul di sini.</p>
          <a href="index.html" class="btn" style="margin-top:8px">Mulai latihan</a>
        </div>`;
      return;
    }

    el.list.innerHTML = rows.map((h) => `
      <div class="history-row">
        <div class="h-ico">${SKILL_META[h.skill].icon}</div>
        <div>
          <div class="h-title">${SKILL_META[h.skill].label} — ${subtitleOf(h)}</div>
          <div class="h-meta">${metaOf(h)}</div>
        </div>
        <div class="h-band">${h.band.toFixed(1)}</div>
      </div>`).join('');
  }

  async function renderBadge() {
    let cloud = false;
    try { cloud = !!(window.Auth && Auth.isConfigured() && await Auth.getSessionUser()); }
    catch (e) { cloud = false; }
    if (cloud) {
      el.badge.className = 'sync-badge cloud';
      el.badge.textContent = 'Tersimpan di cloud';
    } else {
      el.badge.className = 'sync-badge local';
      el.badge.textContent = 'Data di perangkat ini';
    }
  }

  async function load() {
    el.list.innerHTML = '<p style="color:var(--text-muted)">Memuat…</p>';
    allSessions = await Store.getAllHistory();
    renderBadge();
    renderSummary();
    renderFilters();
    renderList();
  }

  el.resetAll.addEventListener('click', async () => {
    const ok = window.UI
      ? await UI.confirm('SEMUA riwayat latihan akan dihapus dan tidak bisa dikembalikan.', { title: 'Hapus semua riwayat?', okText: 'Hapus semua', danger: true })
      : confirm('Hapus SEMUA riwayat latihan?');
    if (!ok) return;
    await Store.clearAll();
    await load();
  });

  load();
})();
