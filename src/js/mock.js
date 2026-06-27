/* =========================================================================
   mock.js — Mini Mock Test (~90 menit): Listening + Reading + Writing
   beruntun dalam satu sesi, lalu skor gabungan.

   Loaded on: mock.html (renders intro/progress/results via #mock-root) and on
   the section pages reading/listening/writing (shows a progress banner + the
   modules call Mock.record()/Mock.advance() to chain sections).

   State lives in sessionStorage so it survives the page navigations between
   sections but clears when the tab closes. Mock is a PREMIUM feature.
   ========================================================================= */
(function () {
  const KEY = 'ielts-mock-state';

  // Urutan section. Memakai item pertama tiap modul (tidak terkunci) + Task 2.
  const PLAN = [
    { skill: 'listening', label: 'Listening', url: 'listening.html?id=lt1&mock=1' },
    { skill: 'reading', label: 'Reading', url: 'reading.html?id=p1-vertical-farming&mock=1' },
    { skill: 'writing', label: 'Writing Task 2', url: 'writing.html?task=task2&id=t2-tech-education&mock=1' }
  ];

  function read() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(s) { sessionStorage.setItem(KEY, JSON.stringify(s)); }

  const Mock = {
    PLAN,
    isActive() { const s = read(); return !!(s && !s.finished); },
    isFinished() { const s = read(); return !!(s && s.finished); },
    state: read,
    current() { const s = read(); return s && !s.finished ? PLAN[s.step] : null; },
    start() { write({ step: 0, scores: {}, startedAt: Date.now(), finished: false }); location.href = PLAN[0].url; },
    record(skill, band) {
      const s = read(); if (!s) return;
      s.scores[skill] = (typeof band === 'number') ? band : null;
      write(s);
    },
    advance() {
      const s = read(); if (!s) return;
      s.step += 1;
      if (s.step >= PLAN.length) { s.finished = true; write(s); location.href = 'mock.html'; }
      else { write(s); location.href = PLAN[s.step].url; }
    },
    abort() { sessionStorage.removeItem(KEY); }
  };
  window.Mock = Mock;

  function inMockUrl() { return new URLSearchParams(location.search).get('mock') === '1'; }

  // Estimasi band keseluruhan = rata-rata section yang dinilai, dibulatkan 0.5.
  function overall(scores) {
    const vals = Object.values(scores).filter((v) => typeof v === 'number');
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 2) / 2;
  }

  function injectBanner() {
    if (!inMockUrl() || !Mock.isActive()) return;
    const s = read();
    const cur = PLAN[s.step];
    const bar = document.createElement('div');
    bar.className = 'mock-banner';
    bar.innerHTML =
      `<span>📝 <strong>Mock Test</strong> — Section ${s.step + 1}/${PLAN.length}: ${cur ? cur.label : ''}</span>` +
      `<button type="button" id="mock-quit" class="link-btn">Keluar mock</button>`;
    document.body.appendChild(bar);
    const q = document.getElementById('mock-quit');
    if (q) q.addEventListener('click', () => {
      if (confirm('Keluar dari mock test? Progres mock akan dihapus.')) { Mock.abort(); location.href = 'mock.html'; }
    });
  }

  async function renderMockPage(root) {
    const paid = window.License ? await License.isPaid() : false;
    const s = read();

    if (!paid) {
      root.innerHTML =
        `<div class="card lock-card"><div class="lock-emoji">🔒</div>
          <h3>Mock Test adalah fitur premium</h3>
          <p>Simulasi ujian beruntun (Listening + Reading + Writing) dengan skor gabungan
          tersedia di akses penuh.</p>
          <div class="lock-actions"><a href="upgrade.html" class="btn">Buka Akses Penuh</a></div>
        </div>`;
      return;
    }

    if (s && s.finished) {
      const ov = overall(s.scores);
      const row = (skill, label) => {
        const v = s.scores[skill];
        return `<div class="mock-score-row"><span>${label}</span><strong>${typeof v === 'number' ? v.toFixed(1) : '—'}</strong></div>`;
      };
      root.innerHTML =
        `<div class="result-banner">
          <div><div style="font-size:14px;opacity:.9">Estimasi Band Keseluruhan</div>
            <div class="band">${ov !== null ? ov.toFixed(1) : '—'}</div>
            <div style="margin-top:6px">Rata-rata section yang dinilai (dibulatkan ke 0.5)</div></div>
        </div>
        <div class="card">
          <h3>Rincian skor mock</h3>
          ${row('listening', '🎧 Listening')}
          ${row('reading', '📖 Reading')}
          ${row('writing', '✍️ Writing Task 2')}
          <p style="color:var(--text-muted);margin-top:12px">Skor Writing berasal dari penilaian AI; bila AI dilewati/gagal, ditampilkan "—".</p>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button class="btn" id="mock-restart" type="button">Ulangi Mock Test</button>
            <a href="index.html" class="btn secondary">Home</a>
          </div>
        </div>`;
      document.getElementById('mock-restart').addEventListener('click', () => { Mock.abort(); Mock.start(); });
      return;
    }

    if (s && !s.finished) {
      const cur = PLAN[s.step];
      root.innerHTML =
        `<div class="card">
          <h3>Mock Test sedang berjalan</h3>
          <p>Kamu di Section ${s.step + 1}/${PLAN.length}: <strong>${cur.label}</strong>.</p>
          <div style="display:flex;gap:8px;margin-top:12px">
            <a href="${cur.url}" class="btn">Lanjutkan Section ${s.step + 1}</a>
            <button class="btn secondary" id="mock-abort" type="button">Batalkan</button>
          </div>
        </div>`;
      document.getElementById('mock-abort').addEventListener('click', () => {
        if (confirm('Batalkan mock test?')) { Mock.abort(); renderMockPage(root); }
      });
      return;
    }

    // Intro
    root.innerHTML =
      `<div class="card">
        <h3>🎯 Mini Mock Test (~90 menit)</h3>
        <p>Simulasi ujian beruntun dalam satu sesi, lalu skor gabungan:</p>
        <ol class="tip-list">
          <li><strong>Listening</strong> — 1 test (40 soal)</li>
          <li><strong>Reading</strong> — 1 passage (13 soal)</li>
          <li><strong>Writing</strong> — 1 esai Task 2 (dinilai AI)</li>
        </ol>
        <p style="color:var(--text-muted)">Kerjakan tanpa berhenti untuk hasil paling realistis.
        Progres disimpan sementara selama sesi ini.</p>
        <button class="btn block" id="mock-start" type="button" style="margin-top:8px">Mulai Mock Test →</button>
      </div>`;
    document.getElementById('mock-start').addEventListener('click', () => Mock.start());
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('mock-root');
    if (root) renderMockPage(root);
    else injectBanner();
  });
})();
