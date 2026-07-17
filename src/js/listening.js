const main = document.getElementById('main-content');
let tests = null;
let currentTest = null;
let currentSection = null;
let currentSectionIdx = 0;
let answers = {};
let isPlaying = false;
let currentUtterance = null;
let voicesReady = false;
let cachedVoices = { female: null, male: null };
let isPaid = false; // diisi dari License.isPaid() saat init

init();

async function init() {
  try {
    const res = await fetch('data/listening-tests.json');
    tests = await res.json();
  } catch (err) {
    main.innerHTML = `<div class="card"><h3>Error</h3><p>${err.message}</p></div>`;
    return;
  }

  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

  try { isPaid = window.License ? await License.isPaid() : false; }
  catch (e) { isPaid = false; }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) {
    const idx = tests.findIndex((t) => t.id === id);
    if (idx >= 0) {
      if (idx > 0 && !isPaid) { renderLocked(tests[idx]); return; }
      currentTest = tests[idx];
      renderTest();
      return;
    }
  }
  renderTestList();
}

/** Layar terkunci untuk test premium (free user). */
function renderLocked(t) {
  main.innerHTML = `
    <div class="page-header">
      <h2>🔒 ${t.title}</h2>
      <div class="meta">Test premium</div>
    </div>
    <div class="card lock-card">
      <div class="lock-emoji">🔒</div>
      <h3>Test ini bagian dari akses penuh</h3>
      <p>Versi gratis mencakup <strong>1 test listening</strong>. Buka semua test,
      Reading, dan penilaian AI dengan sekali bayar.</p>
      <div class="lock-actions">
        <a href="upgrade.html" class="btn">Buka Akses Penuh</a>
        <a href="listening.html" class="btn secondary">← Kembali ke daftar</a>
      </div>
    </div>
  `;
}

function loadVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;
  voicesReady = true;
  // Prefer English voices, prioritize natural-sounding ones
  const englishVoices = voices.filter((v) => v.lang.startsWith('en'));
  cachedVoices.female = englishVoices.find((v) => /female|aria|jenny|libby|sonia|emma|hazel/i.test(v.name)) ||
                       englishVoices.find((v) => /zira|hazel|susan|catherine/i.test(v.name)) ||
                       englishVoices[0];
  cachedVoices.male = englishVoices.find((v) => /male|guy|ryan|david|mark|alex/i.test(v.name)) ||
                     englishVoices.find((v) => /david|mark|james|brian/i.test(v.name)) ||
                     englishVoices[Math.min(1, englishVoices.length - 1)] ||
                     englishVoices[0];
}

function renderTestList() {
  main.innerHTML = `
    <div class="page-header">
      <h2>Listening Practice</h2>
      <div class="meta">${tests.length} test tersedia</div>
    </div>
    <div class="card">
      <h3>Cara latihan</h3>
      <ul class="tip-list">
        <li>4 section, total ~30 menit + 10 menit transfer time.</li>
        <li>Klik <strong>Play</strong> untuk mendengar audio.</li>
        <li><strong>Bisa di-pause</strong> kalau perlu, tapi di tes asli tidak ada pause.</li>
        <li>Baca soal saat audio mulai, tulis jawaban sambil dengar.</li>
        <li>Section 1-2 lebih mudah (booking, tour), Section 3-4 lebih sulit (akademik).</li>
      </ul>
    </div>
    <div class="card">
      <h3>Tes tersedia</h3>
      ${isPaid ? '' : '<p class="free-note">Versi gratis: test pertama. <a href="upgrade.html">Buka semua →</a></p>'}
      <div id="test-list"></div>
    </div>
  `;
  const list = document.getElementById('test-list');
  tests.forEach((t, idx) => {
    const locked = idx > 0 && !isPaid;
    const item = document.createElement('div');
    item.className = 'passage-card' + (locked ? ' locked' : '');
    const totalQ = t.sections.reduce((sum, s) => sum + s.questions.length, 0);
    item.innerHTML = `
      <div>
        <div class="title">${locked ? '🔒 ' : ''}${t.title}</div>
        <div class="desc">${t.sections.length} section · ${totalQ} soal · ~30 menit</div>
      </div>
      ${locked
        ? '<a href="upgrade.html" class="btn secondary lock-btn">🔒 Premium</a>'
        : `<a href="listening.html?id=${t.id}" class="btn">Mulai</a>`}
    `;
    list.appendChild(item);
  });
}

function renderTest() {
  currentSectionIdx = 0;
  answers = {};
  renderSection();
}

function renderSection() {
  currentSection = currentTest.sections[currentSectionIdx];
  const isLast = currentSectionIdx === currentTest.sections.length - 1;

  main.innerHTML = `
    <div class="page-header">
      <h2>${currentTest.title} — Section ${currentSection.section}</h2>
      <div class="header-actions">
        <button class="btn secondary" id="prev-btn" ${currentSectionIdx === 0 ? 'disabled' : ''}>← Section sebelumnya</button>
        <button class="btn" id="next-btn">${isLast ? 'Selesai & Nilai' : 'Section berikutnya →'}</button>
      </div>
    </div>

    <div class="listening-section-info">
      <strong>Context:</strong> ${currentSection.context}
    </div>

    <div class="audio-player">
      <div class="audio-info">Section ${currentSection.section} of ${currentTest.sections.length}</div>
      <button class="play-btn" id="play-btn">▶ Play Audio</button>
      <button class="play-btn" id="pause-btn" style="display:none;background:#fff;color:var(--primary)">⏸ Pause</button>
      <button class="play-btn" id="restart-btn" style="display:none;background:rgba(255,255,255,0.2);color:#fff">🔁 Restart</button>
      <div class="audio-progress"><div class="audio-progress-fill" id="audio-progress"></div></div>
      <div id="audio-status" style="margin-top:8px;font-size:13px;opacity:0.9">Klik Play untuk mulai</div>
    </div>

    <div class="questions">
      <h3 style="margin-top:0">Soal Section ${currentSection.section}</h3>
      ${currentSection.questions.map(renderQuestion).join('')}
    </div>
  `;

  document.getElementById('play-btn').addEventListener('click', playAudio);
  document.getElementById('pause-btn').addEventListener('click', pauseAudio);
  document.getElementById('restart-btn').addEventListener('click', () => {
    stopAudio();
    // Small delay so cancel() fully processes before new speak() calls
    setTimeout(playAudio, 150);
  });
  document.getElementById('next-btn').addEventListener('click', () => {
    stopAudio();
    if (isLast) {
      handleSubmit();
    } else {
      currentSectionIdx++;
      renderSection();
    }
  });
  document.getElementById('prev-btn').addEventListener('click', () => {
    stopAudio();
    if (currentSectionIdx > 0) {
      currentSectionIdx--;
      renderSection();
    }
  });

  // Restore previously typed answers
  currentSection.questions.forEach((q) => {
    if (answers[q.num] !== undefined) {
      const input = document.querySelector(`[name="q${q.num}"]`);
      if (input) {
        if (input.type === 'radio') {
          const target = document.querySelector(`[name="q${q.num}"][value="${answers[q.num]}"]`);
          if (target) target.checked = true;
        } else {
          input.value = answers[q.num];
        }
      }
    }
  });

  attachAnswerListeners();
}

function renderQuestion(q) {
  let inputHTML = '';
  if (q.type === 'MCQ') {
    inputHTML = `<div class="options">${q.options.map((opt, i) => `
      <label><input type="radio" name="q${q.num}" value="${String.fromCharCode(65 + i)}">
      <span><strong>${String.fromCharCode(65 + i)}.</strong> ${opt}</span></label>
    `).join('')}</div>`;
  } else if (q.type === 'GAP') {
    inputHTML = `<input type="text" class="gap-input" name="q${q.num}" placeholder="Tulis jawaban">`;
  } else if (q.type === 'TFNG') {
    inputHTML = `<div class="options">${['TRUE', 'FALSE', 'NOT GIVEN'].map((o) => `
      <label><input type="radio" name="q${q.num}" value="${o}"><span>${o}</span></label>
    `).join('')}</div>`;
  }

  return `
    <div class="question">
      <div class="q-text"><span class="q-num">${q.num}</span>${q.text}</div>
      ${inputHTML}
    </div>
  `;
}

function attachAnswerListeners() {
  document.querySelectorAll('input[type="radio"], input[type="text"]').forEach((input) => {
    input.addEventListener('change', () => {
      const num = parseInt(input.name.replace('q', ''));
      answers[num] = input.value.trim();
    });
    input.addEventListener('input', () => {
      const num = parseInt(input.name.replace('q', ''));
      answers[num] = input.value.trim();
    });
  });
}

let scriptIdx = 0;
let userInitiatedPause = false;
function playAudio() {
  if (!voicesReady) {
    loadVoices();
    if (!voicesReady) {
      document.getElementById('audio-status').textContent = 'Suara belum siap — coba klik Play lagi dalam beberapa detik.';
      return;
    }
  }

  if (userInitiatedPause && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    userInitiatedPause = false;
    isPlaying = true;
    toggleButtons(true);
    document.getElementById('audio-status').textContent = 'Audio dilanjutkan';
    return;
  }

  isPlaying = true;
  userInitiatedPause = false;
  scriptIdx = 0;
  document.getElementById('audio-progress').style.width = '0%';
  toggleButtons(true);
  speakNext();
}

function speakNext() {
  if (scriptIdx >= currentSection.script.length) {
    isPlaying = false;
    toggleButtons(false);
    document.getElementById('audio-status').textContent = 'Audio selesai. Lanjut isi soal, atau klik Restart untuk dengar lagi.';
    document.getElementById('audio-progress').style.width = '100%';
    return;
  }

  const line = currentSection.script[scriptIdx];
  const utterance = new SpeechSynthesisUtterance(line.text);
  utterance.voice = cachedVoices[line.voice] || cachedVoices.female;
  utterance.rate = 0.92;
  utterance.pitch = line.voice === 'male' ? 0.95 : 1.05;
  utterance.lang = 'en-US';

  utterance.onend = () => {
    scriptIdx++;
    const pct = (scriptIdx / currentSection.script.length) * 100;
    document.getElementById('audio-progress').style.width = pct + '%';
    document.getElementById('audio-status').textContent = `Memutar audio… (${scriptIdx} / ${currentSection.script.length})`;
    if (isPlaying) {
      // Small pause between lines for natural dialog flow
      setTimeout(speakNext, 350);
    }
  };

  utterance.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    document.getElementById('audio-status').textContent = 'Audio bermasalah: ' + e.error + '. Klik Restart untuk mencoba lagi.';
    isPlaying = false;
    toggleButtons(false);
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function pauseAudio() {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    userInitiatedPause = true;
    isPlaying = false;
    document.getElementById('audio-status').textContent = 'Audio dijeda';
    toggleButtons(false);
  }
}

function stopAudio() {
  isPlaying = false;
  userInitiatedPause = false;
  // Chromium quirk: must resume before cancel if currently paused, otherwise
  // speechSynthesis state gets stuck and subsequent speak() calls don't fire.
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
  window.speechSynthesis.cancel();
  scriptIdx = 0;
}

function toggleButtons(playing) {
  document.getElementById('play-btn').style.display = playing ? 'none' : 'inline-block';
  document.getElementById('pause-btn').style.display = playing ? 'inline-block' : 'none';
  document.getElementById('restart-btn').style.display = 'inline-block';
}

async function handleSubmit() {
  stopAudio();
  const ok = window.UI
    ? await UI.confirm('Semua jawaban dari 4 section akan dinilai.', { title: 'Submit & lihat hasil?', okText: 'Ya, nilai sekarang' })
    : confirm('Submit semua jawaban dan lihat hasil?');
  if (!ok) return;

  const allResults = [];
  currentTest.sections.forEach((sec) => {
    sec.questions.forEach((q) => {
      const userAns = (answers[q.num] || '').trim();
      const correct = checkAnswer(q, userAns);
      allResults.push({ section: sec.section, q, userAns, correct });
    });
  });

  const correctCount = allResults.filter((r) => r.correct).length;
  const band = bandFromScore(correctCount);
  saveSession(currentTest, correctCount, allResults.length, band);
  const inMock = new URLSearchParams(location.search).get('mock') === '1' && window.Mock;
  if (inMock) Mock.record('listening', band);
  renderResult(allResults, correctCount, band, inMock);
}

function checkAnswer(q, userAns) {
  if (!userAns) return false;
  if (q.type === 'MCQ' || q.type === 'TFNG') {
    return userAns.toUpperCase() === q.answer.toUpperCase();
  }
  if (q.type === 'GAP') {
    const normalize = (s) => s.toLowerCase().replace(/[.,!?'']/g, '').replace(/\s+/g, ' ').trim();
    const user = normalize(userAns);
    const candidates = [q.answer, ...(q.altAnswers || [])].map(normalize);
    return candidates.includes(user);
  }
  return false;
}

function bandFromScore(correct) {
  if (correct >= 39) return 9.0;
  if (correct >= 37) return 8.5;
  if (correct >= 35) return 8.0;
  if (correct >= 32) return 7.5;
  if (correct >= 30) return 7.0;
  if (correct >= 26) return 6.5;
  if (correct >= 23) return 6.0;
  if (correct >= 18) return 5.5;
  if (correct >= 16) return 5.0;
  if (correct >= 13) return 4.5;
  if (correct >= 11) return 4.0;
  if (correct >= 8) return 3.5;
  return 3.0;
}

function saveSession(test, correct, total, band) {
  const session = {
    testId: test.id,
    testTitle: test.title,
    date: new Date().toISOString(),
    correct,
    total,
    band
  };
  if (window.Store) {
    Store.saveSession('listening', session);
  } else {
    const history = JSON.parse(localStorage.getItem('ielts-listening-history') || '[]');
    history.push(session);
    localStorage.setItem('ielts-listening-history', JSON.stringify(history));
  }
}

function renderResult(results, correctCount, band, inMock) {
  const targetBand = 6.5;
  const verdict = band >= targetBand ? 'Sudah mencapai target!' : `Masih ${(targetBand - band).toFixed(1)} band dari target ${targetBand}.`;

  main.innerHTML = `
    <div class="page-header">
      <h2>Hasil — ${currentTest.title}</h2>
      <div>
        ${inMock
          ? `<button class="btn" onclick="Mock.advance()">Lanjut ke section berikutnya →</button>`
          : `<a href="listening.html" class="btn secondary">Latihan lagi</a>
             <a href="index.html" class="btn secondary">Home</a>`}
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
        <div class="score-num">${correctCount} / ${results.length}</div>
      </div>
    </div>
    <div class="card">
      <h3>Review per Section</h3>
      <div id="review-list"></div>
    </div>
  `;

  const list = document.getElementById('review-list');
  let lastSec = null;
  results.forEach((r) => {
    if (r.section !== lastSec) {
      const header = document.createElement('h4');
      header.style.marginTop = '20px';
      header.style.color = 'var(--primary)';
      header.textContent = `Section ${r.section}`;
      list.appendChild(header);
      lastSec = r.section;
    }
    const item = document.createElement('div');
    item.className = `review-item ${r.correct ? 'correct' : 'wrong'}`;
    const correctDisplay = r.q.type === 'MCQ'
      ? `${r.q.answer}. ${r.q.options[r.q.answer.charCodeAt(0) - 65]}`
      : r.q.answer;
    item.innerHTML = `
      <div><strong>Q${r.q.num}.</strong> ${r.q.text}</div>
      <div class="answer-line">Jawabanmu: <strong>${r.userAns || '(kosong)'}</strong> ${r.correct ? '✓' : '✗'}</div>
      ${!r.correct ? `<div class="answer-line">Jawaban benar: <strong>${correctDisplay}</strong></div>` : ''}
      <div class="answer-line"><em>${r.q.explanation}</em></div>
    `;
    list.appendChild(item);
  });
}
