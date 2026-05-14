const main = document.getElementById('main-content');
let topics = [];
let currentTopic = null;
let currentMode = 'browse';

// Flashcard state
let fcIndex = 0;
let fcOrder = [];

// Quiz state
let quizQuestions = [];
let quizIndex = 0;
let quizScore = 0;

init();

async function init() {
  try {
    const res = await fetch('data/vocabulary.json');
    topics = await res.json();
  } catch (err) {
    main.innerHTML = `<div class="card"><h3>Error</h3><p>${err.message}</p></div>`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('topic');
  const mode = params.get('mode');

  if (id) {
    currentTopic = topics.find((t) => t.id === id);
    if (currentTopic) {
      currentMode = mode || 'browse';
      renderTopic();
      return;
    }
  }
  renderTopicList();
}

function getLearned() {
  return JSON.parse(localStorage.getItem('ielts-vocab-learned') || '{}');
}

function setLearned(state) {
  localStorage.setItem('ielts-vocab-learned', JSON.stringify(state));
}

function getQuizHistory() {
  return JSON.parse(localStorage.getItem('ielts-vocab-quiz-history') || '[]');
}

function renderTopicList() {
  const learned = getLearned();
  const totalWords = topics.reduce((sum, t) => sum + t.words.length, 0);
  const totalLearned = Object.values(learned).filter(Boolean).length;

  main.innerHTML = `
    <div class="page-header">
      <h2>📚 Vocabulary</h2>
      <div class="meta">${totalWords} kata · ${totalLearned} sudah dihafal</div>
    </div>

    <div class="card">
      <h3>Cara pakai</h3>
      <ul class="tip-list">
        <li><strong>Browse</strong> — baca daftar kata + arti + contoh kalimat IELTS.</li>
        <li><strong>Flashcards</strong> — uji ingatan dengan kartu balik. Cepat dan efektif.</li>
        <li><strong>Quiz</strong> — pilihan ganda, lihat skor di akhir.</li>
        <li>Tandai kata sebagai "Sudah hafal" untuk track progress.</li>
      </ul>
    </div>

    <div class="card">
      <h3>Pilih topik</h3>
      <div class="topic-grid" id="topic-grid"></div>
    </div>
  `;

  const grid = document.getElementById('topic-grid');
  topics.forEach((t) => {
    const learnedInTopic = t.words.filter((w) => learned[`${t.id}:${w.word}`]).length;
    const pct = Math.round((learnedInTopic / t.words.length) * 100);
    const tile = document.createElement('a');
    tile.href = `vocabulary.html?topic=${t.id}&mode=browse`;
    tile.className = 'topic-tile';
    tile.innerHTML = `
      <div class="topic-icon">${t.icon}</div>
      <div class="topic-name">${t.title}</div>
      <div class="topic-meta">${t.words.length} kata · ${learnedInTopic} dihafal (${pct}%)</div>
      <div style="height:6px;background:var(--surface-2);border-radius:3px;margin-top:8px;overflow:hidden">
        <div style="height:100%;background:var(--primary);width:${pct}%"></div>
      </div>
    `;
    grid.appendChild(tile);
  });
}

function renderTopic() {
  main.innerHTML = `
    <div class="page-header">
      <h2>${currentTopic.icon} ${currentTopic.title}</h2>
      <a href="vocabulary.html" class="btn secondary">← Pilih topik lain</a>
    </div>
    <div class="mode-tabs">
      <button class="mode-tab ${currentMode === 'browse' ? 'active' : ''}" data-mode="browse">📖 Browse</button>
      <button class="mode-tab ${currentMode === 'flashcard' ? 'active' : ''}" data-mode="flashcard">🎴 Flashcards</button>
      <button class="mode-tab ${currentMode === 'quiz' ? 'active' : ''}" data-mode="quiz">📝 Quiz</button>
    </div>
    <div id="mode-content"></div>
  `;

  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentMode = tab.dataset.mode;
      const url = new URL(window.location);
      url.searchParams.set('mode', currentMode);
      window.history.replaceState({}, '', url);
      renderTopic();
    });
  });

  if (currentMode === 'browse') renderBrowse();
  else if (currentMode === 'flashcard') renderFlashcard();
  else if (currentMode === 'quiz') renderQuiz();
}

// === BROWSE MODE ===
function renderBrowse() {
  const learned = getLearned();
  const container = document.getElementById('mode-content');
  container.innerHTML = `<div id="word-list"></div>`;
  const list = document.getElementById('word-list');

  currentTopic.words.forEach((w) => {
    const key = `${currentTopic.id}:${w.word}`;
    const isLearned = !!learned[key];
    const card = document.createElement('div');
    card.className = 'word-card';
    card.innerHTML = `
      <div>
        <div class="word-header">
          <span class="word-main">${w.word}</span>
          <span class="pos-badge">${w.pos}</span>
          <span class="band-badge">Band ${w.band}+</span>
        </div>
        <div class="translation">${w.id}</div>
        <div class="definition">${w.en}</div>
        <div class="example"><em>"${w.example}"</em></div>
        <div class="tags-row">
          ${w.collocations.map((c) => `<span class="tag">📌 ${c}</span>`).join('')}
          ${w.synonyms.map((s) => `<span class="tag syn">↔ ${s}</span>`).join('')}
        </div>
      </div>
      <button class="learn-toggle ${isLearned ? 'learned' : ''}" data-key="${key}">
        ${isLearned ? '✓ Hafal' : 'Tandai hafal'}
      </button>
    `;
    list.appendChild(card);
  });

  document.querySelectorAll('.learn-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const state = getLearned();
      const key = btn.dataset.key;
      if (state[key]) delete state[key];
      else state[key] = true;
      setLearned(state);
      btn.classList.toggle('learned');
      btn.textContent = state[key] ? '✓ Hafal' : 'Tandai hafal';
    });
  });
}

// === FLASHCARD MODE ===
function renderFlashcard() {
  fcIndex = 0;
  fcOrder = shuffle([...currentTopic.words]);
  renderFlashcardCard();
}

function renderFlashcardCard() {
  const w = fcOrder[fcIndex];
  const container = document.getElementById('mode-content');
  const learned = getLearned();
  const key = `${currentTopic.id}:${w.word}`;
  const isLearned = !!learned[key];

  container.innerHTML = `
    <div class="flashcard-container">
      <div class="fc-progress">Kartu ${fcIndex + 1} dari ${fcOrder.length}</div>
      <div class="flashcard" id="flashcard">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <div class="fc-word">${w.word}</div>
            <div class="fc-pos">${w.pos} · Band ${w.band}+</div>
            <div class="fc-hint">Klik kartu untuk lihat arti</div>
          </div>
          <div class="flashcard-back">
            <div class="fc-trans">${w.id}</div>
            <div class="fc-def">${w.en}</div>
            <div class="fc-ex"><em>"${w.example}"</em></div>
          </div>
        </div>
      </div>
      <div class="fc-controls">
        <button class="btn secondary" id="fc-prev" ${fcIndex === 0 ? 'disabled' : ''}>← Sebelumnya</button>
        <button class="learn-toggle ${isLearned ? 'learned' : ''}" id="fc-learn">
          ${isLearned ? '✓ Sudah hafal' : 'Tandai hafal'}
        </button>
        <button class="btn" id="fc-next" ${fcIndex === fcOrder.length - 1 ? 'disabled' : ''}>Berikutnya →</button>
      </div>
      <div style="text-align:center;margin-top:20px">
        <button class="btn secondary" id="fc-shuffle">🔀 Acak ulang</button>
      </div>
    </div>
  `;

  document.getElementById('flashcard').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('flipped');
  });
  document.getElementById('fc-prev').addEventListener('click', () => {
    if (fcIndex > 0) { fcIndex--; renderFlashcardCard(); }
  });
  document.getElementById('fc-next').addEventListener('click', () => {
    if (fcIndex < fcOrder.length - 1) { fcIndex++; renderFlashcardCard(); }
  });
  document.getElementById('fc-shuffle').addEventListener('click', () => {
    fcOrder = shuffle([...currentTopic.words]);
    fcIndex = 0;
    renderFlashcardCard();
  });
  document.getElementById('fc-learn').addEventListener('click', (e) => {
    const state = getLearned();
    if (state[key]) delete state[key];
    else state[key] = true;
    setLearned(state);
    e.target.classList.toggle('learned');
    e.target.textContent = state[key] ? '✓ Sudah hafal' : 'Tandai hafal';
  });
}

// === QUIZ MODE ===
function renderQuiz() {
  // Pick up to 10 questions
  quizQuestions = shuffle([...currentTopic.words]).slice(0, Math.min(10, currentTopic.words.length));
  quizIndex = 0;
  quizScore = 0;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  if (quizIndex >= quizQuestions.length) {
    renderQuizResult();
    return;
  }

  const w = quizQuestions[quizIndex];
  const correctAnswer = w.id;
  // Generate 3 wrong options from other words in the topic
  const otherWords = currentTopic.words.filter((x) => x.word !== w.word);
  const wrongOptions = shuffle(otherWords).slice(0, 3).map((x) => x.id);
  const options = shuffle([correctAnswer, ...wrongOptions]);

  const pct = ((quizIndex) / quizQuestions.length) * 100;
  const container = document.getElementById('mode-content');
  container.innerHTML = `
    <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${pct}%"></div></div>
    <div style="text-align:center;color:var(--text-muted);margin-bottom:10px">
      Soal ${quizIndex + 1} dari ${quizQuestions.length} · Skor: ${quizScore}
    </div>
    <div class="quiz-question">
      <div class="q-prompt">Apa arti kata berikut?</div>
      <div class="q-word">${w.word}</div>
      <div style="text-align:center;color:var(--text-muted);font-size:13px;margin-bottom:16px">${w.pos}</div>
      <div class="quiz-options" id="quiz-options"></div>
      <div id="quiz-feedback" style="margin-top:16px;display:none"></div>
    </div>
  `;

  const optsEl = document.getElementById('quiz-options');
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => handleAnswer(btn, opt, correctAnswer, w));
    optsEl.appendChild(btn);
  });
}

function handleAnswer(btn, chosen, correct, word) {
  const allOpts = document.querySelectorAll('.quiz-option');
  allOpts.forEach((b) => { b.disabled = true; });
  if (chosen === correct) {
    btn.classList.add('correct');
    quizScore++;
  } else {
    btn.classList.add('wrong');
    allOpts.forEach((b) => {
      if (b.textContent === correct) b.classList.add('correct');
    });
  }

  const feedback = document.getElementById('quiz-feedback');
  feedback.style.display = 'block';
  feedback.innerHTML = `
    <div style="padding:12px;background:var(--surface-2);border-radius:8px;font-size:13px">
      <strong>${word.word}</strong> — ${word.en}<br>
      <em>"${word.example}"</em>
    </div>
    <div style="text-align:right;margin-top:12px">
      <button class="btn" id="quiz-next">${quizIndex + 1 === quizQuestions.length ? 'Lihat hasil' : 'Lanjut →'}</button>
    </div>
  `;
  document.getElementById('quiz-next').addEventListener('click', () => {
    quizIndex++;
    renderQuizQuestion();
  });
}

function renderQuizResult() {
  const total = quizQuestions.length;
  const pct = Math.round((quizScore / total) * 100);
  const verdict = pct >= 80 ? '🎉 Luar biasa!' : pct >= 60 ? '👍 Bagus, tinggal poles' : '💪 Pelajari lagi kata-katanya';

  // Save to history
  const history = getQuizHistory();
  history.push({
    topicId: currentTopic.id,
    topicTitle: currentTopic.title,
    date: new Date().toISOString(),
    score: quizScore,
    total,
    pct
  });
  localStorage.setItem('ielts-vocab-quiz-history', JSON.stringify(history));

  const container = document.getElementById('mode-content');
  container.innerHTML = `
    <div class="result-banner">
      <div>
        <div style="font-size:14px;opacity:0.9">Skor Quiz</div>
        <div class="band">${pct}%</div>
        <div style="margin-top:6px">${verdict}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;opacity:0.9">Benar</div>
        <div style="font-size:32px;font-weight:700">${quizScore} / ${total}</div>
      </div>
    </div>
    <div class="card">
      <div class="btn-row">
        <button class="btn" id="quiz-retry">🔁 Quiz lagi</button>
        <a href="vocabulary.html?topic=${currentTopic.id}&mode=browse" class="btn secondary">📖 Browse kata</a>
        <a href="vocabulary.html?topic=${currentTopic.id}&mode=flashcard" class="btn secondary">🎴 Flashcards</a>
        <a href="vocabulary.html" class="btn secondary">← Topik lain</a>
      </div>
    </div>
  `;
  document.getElementById('quiz-retry').addEventListener('click', renderQuiz);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
