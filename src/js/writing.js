const main = document.getElementById('main-content');
let prompts = null;
let currentPrompt = null;
let currentTask = null;
let timerId = null;
let secondsLeft = 0;

init();

async function init() {
  try {
    const res = await fetch('data/writing-prompts.json');
    prompts = await res.json();
  } catch (err) {
    main.innerHTML = `<div class="card"><h3>Error</h3><p>${err.message}</p></div>`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const task = params.get('task');

  if (id && task) {
    const pool = task === 'task1' ? prompts.task1 : prompts.task2;
    currentPrompt = pool.find((p) => p.id === id);
    currentTask = task;
    if (currentPrompt) {
      renderEditor();
      return;
    }
  }
  renderPromptList();
}

function renderPromptList() {
  main.innerHTML = `
    <div class="page-header">
      <h2>✍️ Writing Practice</h2>
      <div class="meta">${prompts.task1.length + prompts.task2.length} prompt tersedia</div>
    </div>
    <div class="card">
      <h3>Cara latihan</h3>
      <ul class="tip-list">
        <li><strong>Task 1</strong> (20 menit, min 150 kata): deskripsi grafik/tabel.</li>
        <li><strong>Task 2</strong> (40 menit, min 250 kata): esai argumentatif. Bobot 2× lipat.</li>
        <li>AI akan nilai per kriteria IELTS (TR, CC, LR, GRA) dan kasih band score.</li>
        <li>Tulis dulu dalam waktu, baru minta feedback.</li>
      </ul>
    </div>

    <div class="card">
      <h3>📊 Task 1 — Academic (20 menit)</h3>
      <div id="task1-list"></div>
    </div>
    <div class="card">
      <h3>📝 Task 2 — Essay (40 menit)</h3>
      <div id="task2-list"></div>
    </div>
  `;

  const t1 = document.getElementById('task1-list');
  prompts.task1.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'passage-card';
    card.innerHTML = `
      <div>
        <div class="title">${p.title}</div>
        <div class="desc">${p.chartType === 'bar' ? 'Bar chart' : 'Table'} · min 150 kata</div>
      </div>
      <a href="writing.html?task=task1&id=${p.id}" class="btn">Mulai</a>
    `;
    t1.appendChild(card);
  });

  const t2 = document.getElementById('task2-list');
  prompts.task2.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'passage-card';
    card.innerHTML = `
      <div>
        <div class="title">${p.type}</div>
        <div class="desc">${p.prompt.slice(0, 120)}...</div>
      </div>
      <a href="writing.html?task=task2&id=${p.id}" class="btn">Mulai</a>
    `;
    t2.appendChild(card);
  });
}

function renderEditor() {
  const isTask1 = currentTask === 'task1';
  secondsLeft = isTask1 ? 20 * 60 : 40 * 60;
  const minWords = isTask1 ? 150 : 250;

  main.innerHTML = `
    <div class="page-header">
      <h2>${isTask1 ? currentPrompt.title : currentPrompt.type}</h2>
      <div style="display:flex;gap:12px;align-items:center">
        <div class="timer" id="timer"></div>
        <button class="btn" id="submit-btn">Submit & Get AI Feedback</button>
      </div>
    </div>
    <div class="writing-layout">
      <div class="prompt-card">
        <h3>Prompt</h3>
        <div class="prompt-text">${isTask1 ? currentPrompt.instructions : currentPrompt.prompt}</div>
        ${isTask1 ? renderChart(currentPrompt) : ''}
      </div>
      <div class="essay-editor">
        <h3 style="margin-top:0">Tulis jawabanmu</h3>
        <textarea class="essay-textarea" id="essay" placeholder="Mulai menulis di sini..."></textarea>
        <div class="editor-footer">
          <span class="word-count under" id="word-count">0 / ${minWords} kata</span>
          <span>Target: <strong>${minWords}+ kata</strong></span>
        </div>
      </div>
    </div>
    <div id="ai-result"></div>
  `;

  const essay = document.getElementById('essay');
  const wcEl = document.getElementById('word-count');
  essay.addEventListener('input', () => {
    const words = essay.value.trim().split(/\s+/).filter(Boolean).length;
    wcEl.textContent = `${words} / ${minWords} kata`;
    wcEl.className = 'word-count ' + (words >= minWords ? 'ok' : 'under');
  });

  document.getElementById('submit-btn').addEventListener('click', handleSubmit);
  startTimer();
}

function renderChart(prompt) {
  if (prompt.chartType === 'bar') {
    const data = prompt.chartData;
    // group bars by country, multiple series
    const maxVal = Math.max(...data.series.flatMap((s) => s.values));
    let html = '<div class="chart-container">';
    html += '<div style="display:flex;gap:8px;font-size:12px;margin-bottom:10px;flex-wrap:wrap">';
    data.series.forEach((s) => {
      html += `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:${s.color};display:inline-block;border-radius:2px"></span>${s.name}</span>`;
    });
    html += '</div>';
    html += '<div class="bar-chart">';
    data.categories.forEach((cat, ci) => {
      html += `<div style="flex:1;display:flex;gap:2px;align-items:flex-end;position:relative;height:100%">`;
      data.series.forEach((s) => {
        const h = (s.values[ci] / maxVal) * 180;
        html += `<div class="bar" style="background:${s.color};height:${h}px" title="${s.name}: ${s.values[ci]}${data.unit}"><span class="bar-value">${s.values[ci]}</span></div>`;
      });
      html += `<div class="bar-label">${cat}</div></div>`;
    });
    html += '</div></div>';
    return html;
  } else if (prompt.chartType === 'table') {
    const data = prompt.chartData;
    let html = '<div class="chart-container"><table class="data-table"><thead><tr>';
    data.headers.forEach((h) => { html += `<th>${h}</th>`; });
    html += '</tr></thead><tbody>';
    data.rows.forEach((row) => {
      html += '<tr>';
      row.forEach((cell, i) => { html += `<t${i === 0 ? 'h' : 'd'}>${cell}</t${i === 0 ? 'h' : 'd'}>`; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }
  return '';
}

function startTimer() {
  updateTimer();
  timerId = setInterval(() => {
    secondsLeft--;
    updateTimer();
    if (secondsLeft <= 0) {
      clearInterval(timerId);
      alert('Waktu habis! Submit sekarang untuk dapat feedback.');
    }
  }, 1000);
}

function updateTimer() {
  const el = document.getElementById('timer');
  if (!el) return;
  const m = Math.floor(Math.abs(secondsLeft) / 60);
  const s = Math.abs(secondsLeft) % 60;
  const sign = secondsLeft < 0 ? '+' : '';
  el.textContent = `⏱ ${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  el.classList.remove('warning', 'danger');
  if (secondsLeft <= 60) el.classList.add('danger');
  else if (secondsLeft <= 300) el.classList.add('warning');
}

async function handleSubmit() {
  const essay = document.getElementById('essay').value.trim();
  if (essay.split(/\s+/).filter(Boolean).length < 50) {
    alert('Tulis minimal 50 kata sebelum minta feedback.');
    return;
  }

  // Penilaian AI = fitur berbayar. Esai tetap bisa ditulis & disimpan.
  if (!(window.License ? await License.isPaid() : false)) {
    document.getElementById('ai-result').innerHTML = `
      <div class="ai-result-box lock-inline">
        <div class="lock-emoji">🔒</div>
        <h3>Penilaian AI adalah fitur berbayar</h3>
        <p>Buka skor AI per kriteria IELTS (TR, CC, LR, GRA) plus contoh perbaikan
        kalimat — sekali bayar, akses selamanya.</p>
        <a href="upgrade.html" class="btn">Buka Akses Penuh</a>
      </div>`;
    return;
  }

  const inMock = new URLSearchParams(location.search).get('mock') === '1' && window.Mock;

  if (timerId) clearInterval(timerId);
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'AI sedang menilai... (15-30 detik)';

  const resultBox = document.getElementById('ai-result');
  resultBox.innerHTML = `<div class="ai-result-box loading"><p>🤖 Claude sedang menganalisis esaimu sesuai rubrik IELTS...</p></div>`;

  const wordCount = essay.split(/\s+/).filter(Boolean).length;
  const promptText = currentTask === 'task1' ? currentPrompt.instructions : currentPrompt.prompt;

  try {
    const res = await window.ielts.getAIFeedback({
      type: 'writing-score',
      content: {
        task: currentTask === 'task1' ? 'Task 1' : 'Task 2',
        prompt: promptText,
        essay,
        wordCount
      }
    });

    if (res.ok) {
      const band = extractBand(res.text);
      if (band !== null) saveSession(currentTask, currentPrompt, band, wordCount);
      if (inMock) Mock.record('writing', band);
      resultBox.innerHTML = `
        <div class="ai-result-box">
          <div class="ai-rendered">${markdownToHtml(res.text)}</div>
          <div style="margin-top:20px;display:flex;gap:8px">
            ${inMock
              ? `<button class="btn" onclick="Mock.advance()">Lihat hasil Mock Test →</button>`
              : `<a href="writing.html" class="btn secondary">Latihan lagi</a>
                 <a href="index.html" class="btn secondary">Home</a>`}
          </div>
        </div>
      `;
    } else {
      resultBox.innerHTML = `<div class="ai-result-box" style="color:var(--error)">⚠️ ${res.error}` +
        (inMock ? `<div style="margin-top:14px"><button class="btn" onclick="Mock.record('writing',null);Mock.advance()">Lewati & lihat hasil →</button></div>` : '') +
        `</div>`;
    }
  } catch (err) {
    resultBox.innerHTML = `<div class="ai-result-box" style="color:var(--error)">⚠️ ${err.message}` +
      (inMock ? `<div style="margin-top:14px"><button class="btn" onclick="Mock.record('writing',null);Mock.advance()">Lewati & lihat hasil →</button></div>` : '') +
      `</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit lagi';
  }
}

function extractBand(text) {
  const m = text.match(/Band Score Overall:\s*([\d.]+)/i);
  return m ? parseFloat(m[1]) : null;
}

function saveSession(task, prompt, band, wordCount) {
  const session = {
    task,
    promptId: prompt.id,
    promptTitle: prompt.title || prompt.type,
    date: new Date().toISOString(),
    band,
    wordCount
  };
  if (window.Store) {
    Store.saveSession('writing', session);
  } else {
    const history = JSON.parse(localStorage.getItem('ielts-writing-history') || '[]');
    history.push(session);
    localStorage.setItem('ielts-writing-history', JSON.stringify(history));
  }
}

function markdownToHtml(md) {
  // Minimal markdown renderer: headings, lists, bold, line breaks
  let html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Handle bullet lists
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
