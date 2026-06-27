const main = document.getElementById('main-content');
let cards = null;
let currentCard = null;
let currentPart = null;
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let recognition = null;
let liveTranscript = '';
let recordingStartTime = 0;
let recordingTimerId = null;
let prepTimerId = null;
let prepLeft = 0;

init();

async function init() {
  try {
    const res = await fetch('data/speaking-cards.json');
    cards = await res.json();
  } catch (err) {
    main.innerHTML = `<div class="card"><h3>Error</h3><p>${err.message}</p></div>`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const part = params.get('part');

  if (id && part && cards[part]) {
    currentCard = cards[part].find((c) => c.id === id);
    currentPart = part;
    if (currentCard) {
      renderPractice();
      return;
    }
  }
  renderCardList();
}

function renderCardList() {
  main.innerHTML = `
    <div class="page-header">
      <h2>🗣️ Speaking Practice</h2>
      <div class="meta">${cards.part1.length + cards.part2.length + cards.part3.length} topik tersedia</div>
    </div>
    <div class="card">
      <h3>Cara latihan</h3>
      <ul class="tip-list">
        <li>Klik mic untuk mulai rekam. Bicara natural.</li>
        <li><strong>Transkrip otomatis</strong> muncul saat kamu bicara (pakai browser Web Speech API — gratis).</li>
        <li>Setelah selesai, AI nilai transkrip per kriteria IELTS.</li>
        <li><strong>Catatan:</strong> AI tidak bisa nilai pronunciation dari teks. Untuk itu pakai native speaker (italki/Tandem).</li>
      </ul>
    </div>
    <div class="card">
      <h3>Part 1 — Introduction (4-5 menit)</h3>
      <p style="color:var(--text-muted)">Pertanyaan umum tentang dirimu. Jawab 2-3 kalimat.</p>
      <div id="part1-list"></div>
    </div>
    <div class="card">
      <h3>Part 2 — Long Turn (3-4 menit)</h3>
      <p style="color:var(--text-muted)">1 menit prep, lalu bicara 1.5-2 menit nonstop.</p>
      <div id="part2-list"></div>
    </div>
    <div class="card">
      <h3>Part 3 — Discussion (4-5 menit)</h3>
      <p style="color:var(--text-muted)">Diskusi abstrak follow-up dari Part 2. Opini + reasoning.</p>
      <div id="part3-list"></div>
    </div>
  `;

  ['part1', 'part2', 'part3'].forEach((part) => {
    const el = document.getElementById(`${part}-list`);
    cards[part].forEach((c) => {
      const card = document.createElement('div');
      card.className = 'passage-card';
      const title = c.title || c.topic;
      const desc = c.bullets ? c.bullets.slice(0, 2).join(' · ') : c.questions.slice(0, 2).join(' · ');
      card.innerHTML = `
        <div>
          <div class="title">${title}</div>
          <div class="desc">${desc.slice(0, 100)}...</div>
        </div>
        <a href="speaking.html?part=${part}&id=${c.id}" class="btn">Mulai</a>
      `;
      el.appendChild(card);
    });
  });
}

function renderPractice() {
  const partLabel = { part1: 'Part 1', part2: 'Part 2', part3: 'Part 3' }[currentPart];
  let promptHTML = '';

  if (currentPart === 'part2') {
    promptHTML = `
      <div class="cue-card">
        <div class="cue-title">📝 ${currentCard.title}</div>
        <div>You should say:</div>
        <ul>${currentCard.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
        <div style="margin-top:10px;font-size:13px"><strong>Persiapan:</strong> 1 menit · <strong>Bicara:</strong> 1.5-2 menit</div>
      </div>
      <div class="card" id="prep-card" style="display:none">
        <h3>⏳ Waktu Persiapan</h3>
        <p>Catat ide singkat sebelum bicara.</p>
        <textarea id="prep-notes" style="width:100%;min-height:100px;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:inherit"></textarea>
        <div style="margin-top:10px;font-size:18px;font-weight:600" id="prep-timer">01:00</div>
      </div>
    `;
  } else {
    promptHTML = `
      <div class="card">
        <h3>${partLabel} — ${currentCard.topic}</h3>
        <ul class="tip-list" id="question-list">
          ${currentCard.questions.map((q, i) => `<li><strong>Q${i + 1}.</strong> ${q}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  main.innerHTML = `
    <div class="page-header">
      <h2>🗣️ ${partLabel}: ${currentCard.title || currentCard.topic}</h2>
      <a href="speaking.html" class="btn secondary">Kembali</a>
    </div>
    <div class="speaking-layout">
      ${promptHTML}
      <div class="record-controls">
        ${currentPart === 'part2' ? `<button class="btn" id="start-prep-btn">Mulai 1 menit Persiapan</button>` : ''}
        <button class="record-btn" id="record-btn" ${currentPart === 'part2' ? 'disabled' : ''}>🎤</button>
        <div class="record-status" id="record-status">${currentPart === 'part2' ? 'Mulai persiapan dulu' : 'Klik mic untuk mulai rekam'}</div>
        <div class="recording-time" id="record-time"></div>
        <audio id="audio-playback" controls style="display:none;width:100%"></audio>
      </div>
      <div class="card">
        <h3>📝 Live Transkrip</h3>
        <div class="transcript-box empty" id="transcript">Transkrip akan muncul di sini saat kamu bicara...</div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn" id="submit-btn" disabled>Submit untuk AI Feedback</button>
          <button class="btn secondary" id="reset-btn">Reset & Rekam Ulang</button>
        </div>
      </div>
      <div id="ai-result"></div>
    </div>
  `;

  setupRecording();
  if (currentPart === 'part2') {
    document.getElementById('start-prep-btn').addEventListener('click', startPrep);
  }
  document.getElementById('submit-btn').addEventListener('click', handleSubmit);
  document.getElementById('reset-btn').addEventListener('click', () => location.reload());
}

function startPrep() {
  document.getElementById('start-prep-btn').disabled = true;
  document.getElementById('prep-card').style.display = 'block';
  prepLeft = 60;
  const updatePrep = () => {
    const m = Math.floor(prepLeft / 60);
    const s = prepLeft % 60;
    document.getElementById('prep-timer').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  updatePrep();
  prepTimerId = setInterval(() => {
    prepLeft--;
    updatePrep();
    if (prepLeft <= 0) {
      clearInterval(prepTimerId);
      document.getElementById('record-btn').disabled = false;
      document.getElementById('record-status').textContent = 'Mulai bicara sekarang!';
    }
  }, 1000);
}

async function setupRecording() {
  const btn = document.getElementById('record-btn');
  const statusEl = document.getElementById('record-status');
  const timeEl = document.getElementById('record-time');
  const transcriptEl = document.getElementById('transcript');
  const audioEl = document.getElementById('audio-playback');
  const submitBtn = document.getElementById('submit-btn');

  let isRecording = false;

  btn.addEventListener('click', async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        liveTranscript = '';
        transcriptEl.textContent = '';
        transcriptEl.classList.remove('empty');

        mediaRecorder.addEventListener('dataavailable', (e) => audioChunks.push(e.data));
        mediaRecorder.addEventListener('stop', () => {
          audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          audioEl.src = URL.createObjectURL(audioBlob);
          audioEl.style.display = 'block';
          stream.getTracks().forEach((t) => t.stop());
          submitBtn.disabled = liveTranscript.trim().length < 20;
        });

        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        btn.classList.add('recording');
        btn.textContent = '⏹';
        statusEl.textContent = '🔴 Sedang merekam...';
        statusEl.classList.add('live');
        recordingTimerId = setInterval(() => {
          const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
          const m = Math.floor(elapsed / 60);
          const s = elapsed % 60;
          timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }, 250);

        startRecognition();
      } catch (err) {
        statusEl.textContent = '⚠️ Tidak bisa akses mic: ' + err.message;
      }
    } else {
      mediaRecorder.stop();
      isRecording = false;
      btn.classList.remove('recording');
      btn.textContent = '🎤';
      statusEl.textContent = '✅ Rekaman selesai. Cek transkrip & submit untuk feedback.';
      statusEl.classList.remove('live');
      clearInterval(recordingTimerId);
      stopRecognition();
    }
  });
}

function startRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('transcript').textContent = '⚠️ Browser tidak support speech recognition. Kamu bisa ketik transkrip manual setelah rekam selesai.';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let finalTranscript = '';
  recognition.addEventListener('result', (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript + ' ';
      else interim += transcript;
    }
    liveTranscript = finalTranscript;
    const el = document.getElementById('transcript');
    el.innerHTML = `<strong>${finalTranscript}</strong><span style="color:var(--text-muted)">${interim}</span>`;
  });

  recognition.addEventListener('error', (e) => {
    if (e.error !== 'no-speech') console.error('Recognition error:', e.error);
  });

  recognition.addEventListener('end', () => {
    // Auto-restart if still recording
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { recognition.start(); } catch (e) { /* ignore */ }
    }
  });

  try { recognition.start(); } catch (e) { console.error(e); }
}

function stopRecognition() {
  if (recognition) {
    try { recognition.stop(); } catch (e) { /* ignore */ }
  }
}

async function handleSubmit() {
  const transcript = liveTranscript.trim();
  if (transcript.length < 20) {
    alert('Transkrip terlalu pendek. Rekam lagi atau ketik manual di kolom transkrip.');
    return;
  }

  // Penilaian AI = fitur berbayar. Latihan rekam/transkrip tetap bisa dipakai.
  if (!(window.License ? await License.isPaid() : false)) {
    document.getElementById('ai-result').innerHTML = `
      <div class="ai-result-box lock-inline">
        <div class="lock-emoji">🔒</div>
        <h3>Penilaian AI adalah fitur berbayar</h3>
        <p>Buka feedback AI untuk Speaking (Fluency, Lexical, Grammar) plus contoh
        jawaban band 7 — sekali bayar, akses selamanya.</p>
        <a href="upgrade.html" class="btn">Buka Akses Penuh</a>
      </div>`;
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'AI sedang menilai... (10-20 detik)';

  const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
  const question = currentCard.title || currentCard.questions.join(' / ');

  const resultBox = document.getElementById('ai-result');
  resultBox.innerHTML = `<div class="ai-result-box loading"><p>🤖 Claude sedang menganalisis jawabanmu...</p></div>`;

  try {
    const res = await window.ielts.getAIFeedback({
      type: 'speaking-feedback',
      content: {
        part: { part1: 'Part 1', part2: 'Part 2', part3: 'Part 3' }[currentPart],
        question,
        transcript,
        duration
      }
    });

    if (res.ok) {
      const band = extractBand(res.text);
      if (band !== null) saveSession(currentPart, currentCard, band, duration);
      resultBox.innerHTML = `
        <div class="ai-result-box">
          <div class="ai-rendered">${markdownToHtml(res.text)}</div>
          <div style="margin-top:20px;display:flex;gap:8px">
            <a href="speaking.html" class="btn secondary">Topik lain</a>
            <a href="index.html" class="btn secondary">Home</a>
          </div>
        </div>
      `;
    } else {
      resultBox.innerHTML = `<div class="ai-result-box" style="color:var(--error)">⚠️ ${res.error}</div>`;
    }
  } catch (err) {
    resultBox.innerHTML = `<div class="ai-result-box" style="color:var(--error)">⚠️ ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit lagi';
  }
}

function extractBand(text) {
  const m = text.match(/Band Score Overall:\s*([\d.]+)/i);
  return m ? parseFloat(m[1]) : null;
}

function saveSession(part, card, band, duration) {
  const session = {
    part,
    cardId: card.id,
    cardTitle: card.title || card.topic,
    date: new Date().toISOString(),
    band,
    duration
  };
  if (window.Store) {
    Store.saveSession('speaking', session);
  } else {
    const history = JSON.parse(localStorage.getItem('ielts-speaking-history') || '[]');
    history.push(session);
    localStorage.setItem('ielts-speaking-history', JSON.stringify(history));
  }
}

function markdownToHtml(md) {
  let html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  const lines = html.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + line.replace(/^\s*-\s+/, '') + '</li>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (line.trim() && !/^<h[123]>/.test(line)) {
        out.push('<p>' + line + '</p>');
      } else {
        out.push(line);
      }
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}
