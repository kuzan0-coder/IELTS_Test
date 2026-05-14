const today = new Date();
document.getElementById('today-date').textContent = today.toLocaleDateString('id-ID', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const stores = {
  reading: 'ielts-history',
  listening: 'ielts-listening-history',
  writing: 'ielts-writing-history',
  speaking: 'ielts-speaking-history'
};

const baselineScores = { reading: 3.5, listening: 5.5, writing: 4.0, speaking: 3.5 };
const skillIcon = { reading: '📖', listening: '🎧', writing: '✍️', speaking: '🗣️' };

const skillStats = document.getElementById('skill-stats');
const allSessions = [];

['reading', 'listening', 'writing', 'speaking'].forEach((skill) => {
  const history = JSON.parse(localStorage.getItem(stores[skill]) || '[]');
  history.forEach((h) => allSessions.push({ skill, ...h }));

  let display = '—';
  let trend = '';
  if (history.length > 0) {
    const last3 = history.slice(-3);
    const avg = last3.reduce((sum, h) => sum + h.band, 0) / last3.length;
    display = avg.toFixed(1);
    const delta = avg - baselineScores[skill];
    if (delta > 0) trend = ` <span style="color:var(--success);font-size:13px">↑ +${delta.toFixed(1)}</span>`;
    else if (delta < 0) trend = ` <span style="color:var(--error);font-size:13px">↓ ${delta.toFixed(1)}</span>`;
  }

  const card = document.createElement('div');
  card.className = 'card stat-card-wrap';
  card.style.margin = '0';
  card.innerHTML = `
    <div class="stat">
      <span class="stat-label">${skillIcon[skill]} ${skill.charAt(0).toUpperCase() + skill.slice(1)}</span>
      <span class="stat-value">${display}${trend}</span>
      <span style="font-size:12px;color:var(--text-muted)">${history.length} sesi</span>
    </div>
    ${history.length > 0 ? `<button class="reset-skill-btn" data-skill="${skill}" title="Reset skor ${skill}">🗑️</button>` : ''}
  `;
  skillStats.appendChild(card);
});

// Reset handlers
document.querySelectorAll('.reset-skill-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const skill = btn.dataset.skill;
    if (confirm(`Reset semua skor & riwayat ${skill}? Tindakan ini tidak bisa dibatalkan.`)) {
      localStorage.removeItem(stores[skill]);
      window.location.reload();
    }
  });
});

// Overall average across all skills (use latest band of each)
const latestPerSkill = {};
['reading', 'listening', 'writing', 'speaking'].forEach((skill) => {
  const history = JSON.parse(localStorage.getItem(stores[skill]) || '[]');
  if (history.length > 0) latestPerSkill[skill] = history[history.length - 1].band;
});

const overallEl = document.getElementById('overall-avg');
const skillsWithData = Object.keys(latestPerSkill);
const hasAnyData = allSessions.length > 0;

if (skillsWithData.length === 4) {
  const avg = Object.values(latestPerSkill).reduce((a, b) => a + b, 0) / 4;
  const target = avg >= 6.5 ? '🎉 sudah mencapai target!' : `kurang ${(6.5 - avg).toFixed(1)} band dari target`;
  overallEl.innerHTML = `Skor rata-rata sekarang: <strong>${avg.toFixed(1)}</strong> — ${target}`;
} else {
  const missing = ['reading', 'listening', 'writing', 'speaking'].filter((s) => !latestPerSkill[s]);
  overallEl.textContent = `Belum bisa hitung — coba dulu: ${missing.join(', ')}`;
}

if (hasAnyData) {
  const resetAll = document.createElement('button');
  resetAll.className = 'reset-all-btn';
  resetAll.textContent = '🗑️ Reset semua data';
  resetAll.addEventListener('click', () => {
    if (confirm('Reset SEMUA skor dan riwayat dari ke-4 skill? Tindakan ini tidak bisa dibatalkan.')) {
      Object.values(stores).forEach((k) => localStorage.removeItem(k));
      window.location.reload();
    }
  });
  overallEl.parentElement.appendChild(resetAll);
}

// History list — most recent 8
allSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
const historyEl = document.getElementById('history-list');
if (allSessions.length > 0) {
  historyEl.innerHTML = '';
  allSessions.slice(0, 8).forEach((h) => {
    const item = document.createElement('div');
    item.className = 'passage-card';
    const subTitle = h.cardTitle || h.promptTitle || h.passageTitle || h.testTitle || '';
    item.innerHTML = `
      <div>
        <div class="title">${skillIcon[h.skill]} ${h.skill.charAt(0).toUpperCase() + h.skill.slice(1)} — ${subTitle}</div>
        <div class="desc">${new Date(h.date).toLocaleString('id-ID')}${h.correct !== undefined ? ' · ' + h.correct + '/' + h.total + ' benar' : ''}${h.wordCount ? ' · ' + h.wordCount + ' kata' : ''}${h.duration ? ' · ' + h.duration + ' detik' : ''}</div>
      </div>
      <div class="stat-value" style="font-size:24px">${h.band.toFixed(1)}</div>
    `;
    historyEl.appendChild(item);
  });
}
