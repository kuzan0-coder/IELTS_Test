const main = document.getElementById('main-content');
let passages = [];
let currentPassage = null;
let timerId = null;
let secondsLeft = 0;
let answers = {};
let isPaid = false; // diisi dari License.isPaid() saat init

init();

async function init() {
  try {
    const res = await fetch('data/reading-passages.json');
    passages = await res.json();
  } catch (err) {
    main.innerHTML = `<div class="card"><h3>Error</h3><p>Gagal memuat passages: ${err.message}</p></div>`;
    return;
  }

  try { isPaid = window.License ? await License.isPaid() : false; }
  catch (e) { isPaid = false; }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (id) {
    const idx = passages.findIndex((x) => x.id === id);
    const p = passages[idx];
    if (!p) {
      renderPassageList();
    } else if (idx > 0 && !isPaid) {
      renderLocked(p);                 // passage premium diakses langsung via ?id
    } else {
      currentPassage = p;
      renderPractice();
    }
  } else {
    renderPassageList();
  }
}

/** Layar terkunci untuk passage premium (free user). */
function renderLocked(p) {
  main.innerHTML = `
    <div class="page-header">
      <h2>🔒 ${p.title}</h2>
      <div class="meta">Passage premium</div>
    </div>
    <div class="card lock-card">
      <div class="lock-emoji">🔒</div>
      <h3>Passage ini bagian dari akses penuh</h3>
      <p>Versi gratis mencakup <strong>1 passage</strong>. Buka semua passage,
      Listening, dan penilaian AI dengan sekali bayar.</p>
      <div class="lock-actions">
        <a href="upgrade.html" class="btn">Buka Akses Penuh</a>
        <a href="reading.html" class="btn secondary">← Kembali ke daftar</a>
      </div>
    </div>
  `;
}

function renderPassageList() {
  main.innerHTML = `
    <div class="page-header">
      <h2>Pilih Passage</h2>
      <div class="meta">${passages.length} passage tersedia</div>
    </div>
    <div class="card">
      <h3>Cara latihan</h3>
      <ul class="tip-list">
        <li>Setiap passage berdurasi <strong>20 menit</strong>, 13 soal.</li>
        <li>Baca soal dulu sebelum cari di passage.</li>
        <li>Jawaban kosong = salah. Tebak kalau ragu.</li>
        <li>Setelah submit, AI bisa menjelaskan jawaban yang salah (fitur Akses Penuh).</li>
      </ul>
    </div>
    <div class="card">
      <h3>Passage tersedia</h3>
      ${isPaid ? '' : '<p class="free-note">Versi gratis: passage pertama. <a href="upgrade.html">Buka semua →</a></p>'}
      <div id="passage-list"></div>
    </div>
  `;

  const list = document.getElementById('passage-list');
  passages.forEach((p, idx) => {
    const locked = idx > 0 && !isPaid;
    const card = document.createElement('div');
    card.className = 'passage-card' + (locked ? ' locked' : '');
    card.innerHTML = `
      <div>
        <div class="title">${locked ? '🔒 ' : ''}${p.title}</div>
        <div class="desc">${p.difficulty} · ${p.estimatedMinutes} menit · ${p.questions.length} soal</div>
      </div>
      ${locked
        ? '<a href="upgrade.html" class="btn secondary lock-btn">🔒 Premium</a>'
        : `<a href="reading.html?id=${p.id}" class="btn">Mulai</a>`}
    `;
    list.appendChild(card);
  });
}

function renderPractice() {
  secondsLeft = currentPassage.estimatedMinutes * 60;
  answers = {};

  main.innerHTML = `
    <div class="page-header">
      <h2>${currentPassage.title}</h2>
      <div class="header-actions">
        <div class="timer" id="timer">⏱ 20:00</div>
        <button class="btn" id="submit-btn">Selesai & Nilai</button>
      </div>
    </div>
    <div class="reading-layout">
      <div class="passage" id="passage-text">
        ${currentPassage.paragraphs.map((para, i) => `<p><span class="para-num">${String.fromCharCode(65 + i)}</span>${para}</p>`).join('')}
      </div>
      <div class="questions" id="questions-list">
        ${currentPassage.questions.map(renderQuestion).join('')}
      </div>
    </div>
  `;

  document.getElementById('submit-btn').addEventListener('click', () => handleSubmit(false));
  attachAnswerListeners();
  startTimer();
}

function renderQuestion(q) {
  let inputHTML = '';
  if (q.type === 'TFNG') {
    inputHTML = `
      <div class="options">
        ${['TRUE', 'FALSE', 'NOT GIVEN'].map((opt) => `
          <label>
            <input type="radio" name="q${q.num}" value="${opt}">
            <span>${opt}</span>
          </label>
        `).join('')}
      </div>
    `;
  } else if (q.type === 'MCQ') {
    inputHTML = `
      <div class="options">
        ${q.options.map((opt, i) => `
          <label>
            <input type="radio" name="q${q.num}" value="${String.fromCharCode(65 + i)}">
            <span><strong>${String.fromCharCode(65 + i)}.</strong> ${opt}</span>
          </label>
        `).join('')}
      </div>
    `;
  } else if (q.type === 'GAP') {
    inputHTML = `
      <input type="text" class="gap-input" name="q${q.num}" placeholder="Tulis jawaban (max ${q.maxWords} kata)">
    `;
  }

  return `
    <div class="question" data-num="${q.num}">
      <div class="q-type">Q${q.num} · ${typeLabel(q.type)}</div>
      <div class="q-text"><span class="q-num">${q.num}</span>${q.text}</div>
      ${inputHTML}
    </div>
  `;
}

function typeLabel(type) {
  return { TFNG: 'True / False / Not Given', MCQ: 'Multiple Choice', GAP: 'Gap Fill' }[type] || type;
}

function attachAnswerListeners() {
  document.querySelectorAll('input[type="radio"], input[type="text"]').forEach((input) => {
    input.addEventListener('change', () => {
      const num = parseInt(input.name.replace('q', ''));
      answers[num] = input.value.trim();
    });
  });
}

function startTimer() {
  updateTimer();
  timerId = setInterval(() => {
    secondsLeft--;
    updateTimer();
    if (secondsLeft <= 0) {
      clearInterval(timerId);
      handleSubmit(true); // waktu habis: langsung nilai tanpa konfirmasi
    }
  }, 1000);
}

function updTimerEl() { return document.getElementById('timer'); }
function updateTimer() {
  const el = updTimerEl();
  if (!el) return;
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  el.textContent = `⏱ ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  el.classList.remove('warning', 'danger');
  if (secondsLeft <= 60) el.classList.add('danger');
  else if (secondsLeft <= 300) el.classList.add('warning');
}

async function handleSubmit(auto) {
  if (timerId) clearInterval(timerId);
  if (!auto) {
    const ok = window.UI
      ? await UI.confirm('Jawaban tidak bisa diubah setelah dinilai.', { title: 'Selesai & nilai jawaban?', okText: 'Ya, nilai sekarang' })
      : confirm('Yakin selesai? Jawaban tidak bisa diubah setelah ini.');
    if (!ok) {
      if (secondsLeft > 0) startTimer();
      return;
    }
  }

  const results = currentPassage.questions.map((q) => {
    const userAns = (answers[q.num] || '').trim();
    const correct = checkAnswer(q, userAns);
    return { q, userAns, correct };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const band = bandFromScore(correctCount, results.length);
  saveSession(currentPassage, correctCount, results.length, band);
  const inMock = new URLSearchParams(location.search).get('mock') === '1' && window.Mock;
  if (inMock) Mock.record('reading', band);
  renderResult(results, correctCount, band, inMock);
}

function checkAnswer(q, userAns) {
  if (!userAns) return false;
  if (q.type === 'TFNG' || q.type === 'MCQ') {
    return userAns.toUpperCase() === q.answer.toUpperCase();
  }
  if (q.type === 'GAP') {
    const normalize = (s) => s.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
    const user = normalize(userAns);
    const candidates = [q.answer, ...(q.altAnswers || [])].map(normalize);
    return candidates.includes(user);
  }
  return false;
}

function bandFromScore(correct, total) {
  const ratio = correct / total;
  const score40 = Math.round((ratio * 40));
  if (score40 >= 39) return 9.0;
  if (score40 >= 37) return 8.5;
  if (score40 >= 35) return 8.0;
  if (score40 >= 33) return 7.5;
  if (score40 >= 30) return 7.0;
  if (score40 >= 27) return 6.5;
  if (score40 >= 23) return 6.0;
  if (score40 >= 19) return 5.5;
  if (score40 >= 15) return 5.0;
  if (score40 >= 13) return 4.5;
  if (score40 >= 10) return 4.0;
  if (score40 >= 8) return 3.5;
  return 3.0;
}

function saveSession(passage, correct, total, band) {
  const session = {
    passageId: passage.id,
    passageTitle: passage.title,
    date: new Date().toISOString(),
    correct,
    total,
    band
  };
  // Store handles both cloud (when logged in) and local cache.
  if (window.Store) {
    Store.saveSession('reading', session);
  } else {
    const history = JSON.parse(localStorage.getItem('ielts-history') || '[]');
    history.push(session);
    localStorage.setItem('ielts-history', JSON.stringify(history));
  }
}

function renderResult(results, correctCount, band, inMock) {
  const total = results.length;
  const targetBand = 6.5;
  const verdict = band >= targetBand ? 'Sudah mencapai target!' : `Masih ${(targetBand - band).toFixed(1)} band dari target ${targetBand}.`;

  main.innerHTML = `
    <div class="page-header">
      <h2>Hasil — ${currentPassage.title}</h2>
      <div>
        ${inMock
          ? `<button class="btn" onclick="Mock.advance()">Lanjut ke section berikutnya →</button>`
          : `<a href="reading.html" class="btn secondary">Latihan lagi</a>
             <a href="index.html" class="btn secondary">Kembali ke Home</a>`}
      </div>
    </div>
    <div class="result-banner">
      <div>
        <div class="label">Band Score</div>
        <div class="band">${band.toFixed(1)}</div>
        <div class="sub">${verdict}</div>
      </div>
      <div class="right">
        <div class="label">Skor</div>
        <div class="score-num">${correctCount} / ${total}</div>
      </div>
    </div>
    <div class="card">
      <h3>Review per Soal</h3>
      <p class="muted" style="font-size:13px">Klik "Jelaskan dengan AI" pada soal yang kamu salah untuk dapat penjelasan strategi.</p>
      <div id="review-list"></div>
    </div>
  `;

  const list = document.getElementById('review-list');
  results.forEach((r) => {
    const item = document.createElement('div');
    item.className = `review-item ${r.correct ? 'correct' : 'wrong'}`;
    const userAnsDisplay = r.userAns || '(kosong)';
    const correctDisplay = r.q.type === 'MCQ'
      ? `${r.q.answer}. ${r.q.options[r.q.answer.charCodeAt(0) - 65]}`
      : r.q.answer;

    item.innerHTML = `
      <div><strong>Q${r.q.num}.</strong> ${r.q.text}</div>
      <div class="answer-line">Jawabanmu: <strong>${userAnsDisplay}</strong> ${r.correct ? '✓' : '✗'}</div>
      ${!r.correct ? `<div class="answer-line">Jawaban benar: <strong>${correctDisplay}</strong></div>` : ''}
      <div class="answer-line"><em>${r.q.explanation}</em></div>
      ${!r.correct ? `
        <div style="margin-top:8px">
          <button class="btn secondary" data-num="${r.q.num}" data-action="ai-explain" style="font-size:12px;padding:6px 12px">Jelaskan dengan AI</button>
        </div>
        <div class="ai-box" id="ai-${r.q.num}" style="display:none"></div>
      ` : ''}
    `;
    list.appendChild(item);
  });

  document.querySelectorAll('[data-action="ai-explain"]').forEach((btn) => {
    btn.addEventListener('click', () => handleAIExplain(parseInt(btn.dataset.num), results, btn));
  });
}

async function handleAIExplain(num, results, btn) {
  const r = results.find((x) => x.q.num === num);
  if (!r) return;

  const box = document.getElementById(`ai-${num}`);
  box.style.display = 'block';
  box.className = 'ai-box loading';
  box.textContent = 'AI sedang menjelaskan...';
  btn.disabled = true;

  const relevantParaText = currentPassage.paragraphs[r.q.relevantPara] || '';

  try {
    const res = await window.ielts.getAIFeedback({
      type: 'reading-explain',
      content: {
        question: r.q.text,
        questionType: typeLabel(r.q.type),
        userAnswer: r.userAns || '(kosong)',
        correctAnswer: r.q.type === 'MCQ'
          ? `${r.q.answer} (${r.q.options[r.q.answer.charCodeAt(0) - 65]})`
          : r.q.answer
      },
      context: relevantParaText
    });

    if (res.ok) {
      box.className = 'ai-box';
      box.textContent = res.text;
    } else {
      box.className = 'ai-box error';
      box.textContent = '⚠️ ' + res.error;
      btn.disabled = false;
    }
  } catch (err) {
    box.className = 'ai-box error';
    box.textContent = '⚠️ ' + err.message;
    btn.disabled = false;
  }
}
