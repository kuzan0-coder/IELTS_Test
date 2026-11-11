/* =========================================================================
   materi.js — Materi Belajar (gratis untuk semua, tanpa login).

   • materi.html          -> daftar materi + progres
   • materi.html?id=...   -> satu materi: isi, contoh "dikoreksi pena merah",
                             contoh audio (suara browser), kuis mini, latihan

   Isi materi ada di data/lessons.json (lihat "_howto" di sana untuk tipe
   block). Progres kuis lewat lesson-progress.js (perangkat + akun).
   ========================================================================= */
(function () {
  const main = document.getElementById('main-content');
  const SKILL_LABEL = { dasar: 'Dasar', reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking', grammar: 'Grammar' };
  const ANSWER_TONE = { TRUE: 'teal', FALSE: 'pen', 'NOT GIVEN': 'navy', TEPAT: 'teal', PENGECOH: 'pen' };
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let lessons = [];

  init();

  async function init() {
    try {
      lessons = (await (await fetch('data/lessons.json')).json()).lessons;
    } catch (err) {
      main.innerHTML = `<div class="card"><h3>Materi gagal dimuat</h3><p class="muted">${esc(err.message)}</p></div>`;
      return;
    }
    const id = new URLSearchParams(location.search).get('id');
    const lesson = lessons.find((l) => l.id === id);
    if (lesson) renderLesson(lesson);
    else renderList();
  }

  // --- Daftar materi ---------------------------------------------------------------

  async function renderList() {
    const progress = await LessonProgress.load();
    const done = lessons.filter((l) => progress[l.id]).length;
    let lastSkill = null;
    main.innerHTML = `
      <div class="page-header">
        <h2>Materi Belajar</h2>
        <div class="meta">Gratis · ${lessons.length} materi</div>
      </div>
      <div class="ls-wrap">
        <p class="ls-lead">Materi singkat 5–7 menit dalam Bahasa Indonesia. Tiap materi ada contoh
        yang dikoreksi, kuis mini, dan latihan lanjutan.</p>
        <div class="ls-progress" aria-label="Progres materi">
          <div class="ls-progress-text"><strong>${done}</strong> dari ${lessons.length} materi selesai</div>
          <div class="ls-progress-bar"><i style="width:${Math.round((done / lessons.length) * 100)}%"></i></div>
        </div>
        <ol class="ls-list">
          ${lessons.map((l, i) => {
            const p = progress[l.id];
            // Judul grup tiap kali skill berganti, supaya daftar panjang mudah dipindai.
            const group = l.skill !== lastSkill ? `<li class="ls-group" aria-hidden="true">${SKILL_LABEL[l.skill] || l.skill}</li>` : '';
            lastSkill = l.skill;
            return `${group}<li>
              <a class="ls-item${p ? ' done' : ''}" href="materi.html?id=${encodeURIComponent(l.id)}">
                <span class="ls-num">${i + 1}</span>
                <span class="ls-item-body">
                  <span class="ls-skill">${SKILL_LABEL[l.skill] || l.skill}</span>
                  <span class="ls-item-title">${esc(l.title)}</span>
                  <span class="ls-item-sum">${esc(l.summary)}</span>
                </span>
                <span class="ls-item-status">${p ? `<span class="ls-check">✓ Selesai</span><small>Kuis ${p.score}/${p.total}</small>` : `<small>${l.minutes} menit</small>`}</span>
              </a>
            </li>`;
          }).join('')}
        </ol>
        <p class="small-note">Progres tersimpan di perangkat ini, dan ikut akunmu kalau kamu login. Materi baru akan terus ditambahkan.</p>
      </div>`;
  }

  // --- Satu materi -------------------------------------------------------------------

  function renderLesson(l) {
    const idx = lessons.indexOf(l);
    const prev = lessons[idx - 1];
    const next = lessons[idx + 1];
    document.title = `IELTS Prep — ${l.title}`;
    main.innerHTML = `
      <div class="ls-wrap">
        <a class="ls-back" href="materi.html">← Semua materi</a>
        <article class="ls-article">
          <header class="ls-head">
            <div class="ls-skill">${SKILL_LABEL[l.skill] || l.skill} · Materi ${idx + 1} dari ${lessons.length}</div>
            <h2>${esc(l.title)}</h2>
            <div class="ls-meta">${l.minutes} menit baca · kuis ${l.quiz.questions.length} soal</div>
          </header>
          ${l.blocks.map(renderBlock).join('')}
          <section class="ls-quiz" id="ls-quiz" aria-labelledby="ls-quiz-title">
            <h3 id="ls-quiz-title">Kuis mini</h3>
            ${l.quiz.intro ? `<p>${inline(l.quiz.intro)}</p>` : ''}
            ${l.quiz.passage ? passageHtml(l.quiz.passage) : ''}
            ${(l.quiz.blocks || []).map(renderBlock).join('')}
            ${l.quiz.questions.map(questionHtml).join('')}
            <div class="ls-quiz-actions">
              <button class="btn" id="ls-check">Periksa jawaban</button>
              <span class="ls-quiz-hint" id="ls-quiz-hint" role="status"></span>
            </div>
            <div id="ls-quiz-result"></div>
          </section>
          <section class="ls-practice">
            <h3>Latihan lanjutan</h3>
            <div class="actions-row">
              ${l.practice.map((p, i) => `<a class="btn${i ? ' secondary' : ''}" href="${esc(p.href)}">${esc(p.label)}</a>`).join('')}
            </div>
          </section>
          <nav class="ls-nav" aria-label="Materi lain">
            ${prev ? `<a href="materi.html?id=${encodeURIComponent(prev.id)}"><small>← Sebelumnya</small>${esc(prev.title)}</a>` : '<span></span>'}
            ${next ? `<a class="next" href="materi.html?id=${encodeURIComponent(next.id)}"><small>Berikutnya →</small>${esc(next.title)}</a>` : ''}
          </nav>
        </article>
      </div>`;

    wireListen();
    wireQuiz(l);
  }

  // --- Block isi ---------------------------------------------------------------------

  function renderBlock(b) {
    switch (b.type) {
      case 'p': return `<p>${inline(b.text)}</p>`;
      case 'h': return `<h3>${inline(b.text)}</h3>`;
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        return `<${tag} class="ls-ul">${b.items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`;
      }
      case 'table':
        return `<div class="ls-table-wrap"><table class="ls-table">
          <thead><tr>${b.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>
          <tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
      case 'note':
        // Bukan <aside>: styles.css memberi semua <aside> gaya sidebar aplikasi.
        return `<div class="ls-note" role="note"><div class="ls-note-title">${esc(b.title || 'Catatan')}</div><p>${inline(b.text)}</p></div>`;
      case 'compare':
        return `<div class="ls-compare">${b.items.map((it) => `
          <div class="ls-compare-item" data-tone="${esc(it.tone || 'navy')}"><div class="ls-compare-title">${esc(it.title)}</div><p>${inline(it.text)}</p></div>`).join('')}</div>`;
      case 'passage': return passageHtml(b);
      case 'worked':
        return `<ol class="ls-worked">${b.items.map((it) => `
          <li>
            <div class="ls-statement">${esc(it.statement)}</div>
            <span class="ls-answer" data-tone="${ANSWER_TONE[it.answer] || 'navy'}">${esc(it.answer)}</span>
            <p>${inline(it.why)}</p>
          </li>`).join('')}</ol>`;
      case 'marked': return markedHtml(b);
      case 'listen': return listenHtml(b);
      case 'plan': return planHtml(b);
      default: return '';
    }
  }

  /** Denah sederhana: sel berisi satu huruf = lokasi yang ditanyakan. */
  function planHtml(b) {
    const cols = Math.max(...b.cells.map((r) => r.length));
    const cells = b.cells.flat().map((c) => (/^[A-Z]$/.test(c)
      ? `<div class="ls-plan-cell spot"><span>${c}</span></div>`
      : `<div class="ls-plan-cell">${esc(c)}</div>`)).join('');
    return `<figure class="ls-plan">
      <figcaption>${esc(b.title || 'Denah')} <span class="ls-plan-north" aria-label="Utara di atas">N ↑</span></figcaption>
      <div class="ls-plan-grid" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div>
    </figure>`;
  }

  function passageHtml(p) {
    return `<figure class="ls-passage">
      ${p.title ? `<figcaption>${esc(p.title)}</figcaption>` : ''}
      ${p.text.split(/\n\n+/).map((para) => `<p>${esc(para)}</p>`).join('')}
    </figure>`;
  }

  /** Contoh yang "dikoreksi pena merah": coretan, perbaikan, centang, garis gelombang. */
  function markedHtml(b) {
    const parts = b.parts.map((part) => {
      if (typeof part === 'string') return esc(part);
      if (part.br) return '<br>';
      if ('s' in part) {
        return `<del class="ls-strike">${esc(part.s)}</del>${part.fix ? ` <ins class="ls-fix">${esc(part.fix)}</ins>` : ''}`;
      }
      if ('good' in part) {
        return `<span class="ls-good">${esc(part.good)}</span><span class="ls-tick" aria-hidden="true">✓</span>${part.ref ? `<sup class="ls-ref">${part.ref}</sup>` : ''}`;
      }
      if ('wave' in part) return `<span class="ls-wave">${esc(part.wave)}</span>${part.ref ? `<sup class="ls-ref">${part.ref}</sup>` : ''}`;
      if ('tag' in part) return `<span class="ls-tag">${esc(part.tag)}</span>${part.text ? esc(part.text) : ''}`;
      return '';
    }).join('');
    const notes = b.notes && b.notes.length
      ? `<ol class="ls-notes">${b.notes.map((n) => `<li>${inline(n)}</li>`).join('')}</ol>` : '';
    return `<figure class="ls-paper">
      ${b.label ? `<figcaption>${esc(b.label)}</figcaption>` : ''}
      ${b.prompt ? `<p class="ls-prompt">${esc(b.prompt)}</p>` : ''}
      <p class="ls-marked">${parts}</p>
      ${notes}
    </figure>`;
  }

  function listenHtml(b) {
    const lines = b.lines.map((ln) => `<p>${ln.who ? `<span class="ls-who">${esc(ln.who)}</span>` : ''}${esc(ln.text)}</p>`).join('');
    const payload = esc(JSON.stringify(b.lines.map((ln) => ln.text)));
    // hideText: untuk latihan mendengar, teks disembunyikan (kecuali browser tak bisa bersuara).
    const body = b.hideText && canSpeak
      ? `<details class="ls-transcript"><summary>Lihat teks</summary><div class="ls-lines">${lines}</div></details>`
      : `<div class="ls-lines">${lines}</div>`;
    return `<figure class="ls-listen">
      <div class="ls-listen-head">
        <figcaption>${esc(b.title || 'Dengarkan')}</figcaption>
        ${canSpeak ? `<button class="btn secondary ls-play" data-lines="${payload}" aria-pressed="false">▶ Dengarkan</button>` : ''}
      </div>
      ${body}
    </figure>`;
  }

  // --- Audio contoh (suara bawaan browser) ----------------------------------------

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => /en-GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  }

  function wireListen() {
    if (!canSpeak) return;
    main.querySelectorAll('.ls-play').forEach((btn) => {
      btn.addEventListener('click', () => {
        const playing = btn.getAttribute('aria-pressed') === 'true';
        window.speechSynthesis.cancel();
        main.querySelectorAll('.ls-play').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.textContent = '▶ Dengarkan'; });
        if (playing) return;
        const lines = JSON.parse(btn.dataset.lines);
        const voice = pickVoice();
        btn.setAttribute('aria-pressed', 'true');
        btn.textContent = '■ Berhenti';
        lines.forEach((text, i) => {
          const u = new SpeechSynthesisUtterance(text);
          if (voice) u.voice = voice;
          u.lang = voice ? voice.lang : 'en-GB';
          u.rate = 0.92;
          if (i === lines.length - 1) {
            u.onend = () => { btn.setAttribute('aria-pressed', 'false'); btn.textContent = '▶ Dengarkan'; };
          }
          window.speechSynthesis.speak(u);
        });
      });
    });
    window.addEventListener('pagehide', () => window.speechSynthesis.cancel());
  }

  // --- Kuis ---------------------------------------------------------------------------

  function questionHtml(q, i) {
    return `<fieldset class="ls-q" data-q="${i}">
      <legend><span class="ls-q-num">${i + 1}</span>${inline(q.q)}</legend>
      <div class="ls-options">
        ${q.options.map((o, j) => `<label class="ls-opt"><input type="radio" name="q${i}" value="${j}"><span>${inline(o)}</span></label>`).join('')}
      </div>
      <p class="ls-explain" hidden></p>
    </fieldset>`;
  }

  function wireQuiz(l) {
    const checkBtn = document.getElementById('ls-check');
    const hint = document.getElementById('ls-quiz-hint');
    checkBtn.addEventListener('click', () => {
      if (checkBtn.dataset.mode === 'retry') {
        resetQuiz();
        return;
      }
      const picks = l.quiz.questions.map((_, i) => {
        const el = main.querySelector(`input[name="q${i}"]:checked`);
        return el ? Number(el.value) : null;
      });
      const empty = picks.filter((p) => p === null).length;
      if (empty) {
        hint.textContent = `Masih ada ${empty} soal yang belum dijawab.`;
        const first = main.querySelector(`.ls-q[data-q="${picks.indexOf(null)}"]`);
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      hint.textContent = '';
      let score = 0;
      l.quiz.questions.forEach((q, i) => {
        const box = main.querySelector(`.ls-q[data-q="${i}"]`);
        const ok = picks[i] === q.answer;
        if (ok) score++;
        box.classList.add(ok ? 'right' : 'wrong');
        box.querySelectorAll('input').forEach((inp) => { inp.disabled = true; });
        box.querySelectorAll('.ls-opt')[q.answer].classList.add('is-answer');
        if (!ok) box.querySelectorAll('.ls-opt')[picks[i]].classList.add('is-wrong');
        const ex = box.querySelector('.ls-explain');
        ex.innerHTML = `<strong>${ok ? 'Benar.' : 'Belum tepat.'}</strong> ${inline(q.explain)}`;
        ex.hidden = false;
      });
      const total = l.quiz.questions.length;
      LessonProgress.save(l.id, score, total);
      const result = document.getElementById('ls-quiz-result');
      const msg = score === total ? 'Sempurna! Kamu sudah paham materi ini.'
        : score >= total - 1 ? 'Bagus! Baca lagi penjelasan soal yang terlewat.'
          : 'Coba baca ulang bagian materinya, lalu ulangi kuis.';
      result.innerHTML = `<div class="ls-score"><span class="ls-score-num">${score}/${total}</span><span>${msg}</span></div>`;
      checkBtn.textContent = 'Ulangi kuis';
      checkBtn.dataset.mode = 'retry';
      checkBtn.classList.add('secondary');
      result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    function resetQuiz() {
      main.querySelectorAll('.ls-q').forEach((box) => {
        box.classList.remove('right', 'wrong');
        box.querySelectorAll('input').forEach((inp) => { inp.disabled = false; inp.checked = false; });
        box.querySelectorAll('.ls-opt').forEach((o) => o.classList.remove('is-answer', 'is-wrong'));
        const ex = box.querySelector('.ls-explain');
        ex.hidden = true;
        ex.innerHTML = '';
      });
      document.getElementById('ls-quiz-result').innerHTML = '';
      checkBtn.textContent = 'Periksa jawaban';
      checkBtn.dataset.mode = '';
      checkBtn.classList.remove('secondary');
      document.getElementById('ls-quiz').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // --- Utilitas ------------------------------------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Teks aman + **tebal** dan *miring*. */
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
})();
