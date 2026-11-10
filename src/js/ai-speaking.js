/* =========================================================================
   ai-speaking.js — Ngobrol AI: latihan bicara lewat percakapan suara
   realtime dengan Gemini Live. Dua jenis sesi:
     • partner : teman ngobrol berkepribadian (Maya, Leo, Victor, Jess),
                 obrolan bebas maks. 10 menit, penilaian opsional di akhir.
     • exam    : Sarah, examiner — simulasi IELTS Speaking Part 1–3,
                 dinilai otomatis di akhir.

   1. /api/ai/live-token (wajib login, memakai 1 kuota AI) memberi token
      sementara. Browser lalu tersambung LANGSUNG ke Google.
   2. Mikrofon -> mic-worklet.js -> PCM 16 kHz -> WebSocket. Suara AI datang
      sebagai PCM 24 kHz dan diputar berurutan.
   3. Mikrofon tidak dikirim selama AI bicara (half-duplex), supaya suara AI
      dari speaker HP tidak dianggap ucapan pengguna.
   4. Examiner: pindah Part ditandai lewat function call (begin_part_two,
      begin_part_three, end_test) atau kalimat bakunya. Waktu persiapan dan
      2 menit Part 2 diatur aplikasi lewat catatan [..] ke examiner.
   5. Koneksi diganti Google (~10 menit) atau putus -> token baru lewat
      tiket, riwayat percakapan dikirim ulang sebagai teks, sesi lanjut.
   6. Penilaian lewat speaking-feedback (kuota ke-2).
   ========================================================================= */
(function () {
  // Sama seperti penilaian AI lain: hanya untuk Akses Penuh. Ganti ke false
  // untuk membuka Ngobrol AI ke semua akun yang sudah login.
  const REQUIRES_PAID = true;

  const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
  const PREP_SECONDS = 60;
  const TALK_SECONDS = 120;
  const PART1_LIMIT_MS = 5.5 * 60 * 1000;
  const PART3_LIMIT_MS = 5.5 * 60 * 1000;
  const EXAM_LIMIT_MS = 18 * 60 * 1000;
  const CHAT_WRAP_MS = 9 * 60 * 1000;   // teman ngobrol mulai pamit
  const CHAT_LIMIT_MS = 10.5 * 60 * 1000;
  const ECHO_TAIL_S = 0.35;   // mikrofon tetap ditahan sebentar setelah AI diam
  const MAX_FAILURES = 5;     // koneksi putus (tak terencana) sebelum sesi dihentikan
  const MIN_WORDS_TO_SCORE = 25;

  // Teks tampilan teman ngobrol. Sifat & suaranya diatur di api/ai/live-token.js (id sama).
  const PARTNERS = [
    { id: 'maya', name: 'Maya', label: 'Ramah', tone: 'teal',
      desc: 'Sabar dan menyemangati. Cocok kalau kamu baru mulai berani bicara.',
      sample: 'Take your time, I’m listening. What did you do last weekend?' },
    { id: 'leo', name: 'Leo', label: 'Jenaka', tone: 'pen',
      desc: 'Lucu dan agak nyinyir. Salahmu dibalas candaan, lalu dibetulkan.',
      sample: '“Very very good”? Bold choice. Got a fancier word for me?' },
    { id: 'victor', name: 'Victor', label: 'Tegas', tone: 'navy',
      desc: 'Pelatih yang langsung mengoreksi dan minta jawaban lebih panjang.',
      sample: 'Correction: “I went”, not “I go”. Again, and give me a reason.' },
    { id: 'jess', name: 'Jess', label: 'Santai', tone: 'amber',
      desc: 'Teman sebaya. Ngobrol santai soal film, makanan, dan kampus.',
      sample: 'Wait, you’ve never tried durian? Okay, tell me everything.' }
  ];
  const EXAMINER = { name: 'Sarah', label: 'Examiner', tone: 'navy' };
  const MODES = {
    full: { label: 'Tes lengkap', short: '±13 menit', scorePart: 'Full test (Part 1-3)' },
    short: { label: 'Latihan singkat', short: '±4 menit', scorePart: 'Part 1' }
  };
  const PART_OF = { part1: 'part1', 'p2-intro': 'part2', prep: 'part2', 'p2-cue': 'part2', talk: 'part2', 'p2-after': 'part2', part3: 'part3' };
  const PART_LABEL = { part1: 'Part 1 · Introduction', part2: 'Part 2 · Long turn', part3: 'Part 3 · Discussion' };

  const main = document.getElementById('main-content');
  let S = null; // sesi yang sedang berjalan

  // Satu sesi per browser: dua tab yang sama-sama mendengar mikrofon membuat
  // dua AI menjawab bersamaan (suara dobel). Sesi baru menghentikan yang lama.
  const TAB_ID = Math.random().toString(36).slice(2);
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('ielts-ngobrol-ai') : null;
  if (channel) {
    channel.onmessage = (e) => {
      if (e.data && e.data.type === 'session-start' && e.data.tab !== TAB_ID && S && !S.ended) finish('other-tab');
    };
  }

  init();

  async function init() {
    renderIntro(await checkAccess());
  }

  async function checkAccess() {
    if (!window.ielts || !window.ielts.getLiveToken) return 'web-only';
    const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      window.AudioWorkletNode && window.WebSocket);
    if (!supported) return 'unsupported';
    const user = window.Auth && Auth.isConfigured() ? await Auth.getSessionUser() : null;
    if (!user) return 'login';
    if (REQUIRES_PAID && !(window.License ? await License.isPaid() : false)) return 'locked';
    return 'ok';
  }

  // --- Halaman pilih teman ngobrol -------------------------------------------------

  function renderIntro(gate, error) {
    const ok = gate === 'ok';
    const go = (kind, option, label, secondary) =>
      `<button class="btn${secondary ? ' secondary' : ''}" data-kind="${kind}" data-option="${option}" ${ok ? '' : 'disabled'}>${label}</button>`;

    main.innerHTML = `
      <div class="page-header">
        <h2>Ngobrol AI</h2>
        <a href="speaking.html" class="btn secondary">Kembali</a>
      </div>
      <div class="pt-wrap">
        <p class="pt-lead">Latihan bicara bahasa Inggris dengan suara. Pilih teman ngobrol yang
        cocok dengan gayamu, atau coba simulasi tes dengan examiner.</p>
        ${error ? `<p class="ex-error" role="alert">${esc(error)}</p>` : ''}
        ${ok ? '' : `<div class="pt-gate">${gateHtml(gate)}</div>`}
        <div class="pt-grid">
          ${PARTNERS.map((p) => `
            <article class="pt-card" data-tone="${p.tone}">
              ${personaHead(p)}
              <p class="pt-desc">${p.desc}</p>
              <p class="pt-sample">${p.sample}</p>
              <div class="pt-actions">${go('partner', p.id, `Ngobrol dengan ${p.name}`)}</div>
            </article>`).join('')}
          <article class="pt-card pt-exam" data-tone="${EXAMINER.tone}">
            ${personaHead({ name: EXAMINER.name, label: 'Examiner IELTS' })}
            <p class="pt-desc">Simulasi tes Speaking seperti ujian asli: Part 1, cue card Part 2
            dengan waktu persiapan, lalu diskusi Part 3. Di akhir kamu dapat band per kriteria.</p>
            <p class="pt-sample">Good morning. Can you tell me your full name, please?</p>
            <div class="pt-actions">
              ${go('exam', 'full', `Tes lengkap · ${MODES.full.short}`)}
              ${go('exam', 'short', `Latihan singkat · ${MODES.short.short}`, true)}
            </div>
          </article>
        </div>
        <ul class="tip-list pt-tips">
          <li>Pakai earphone kalau ada, supaya suara AI tidak ikut terekam. Cari tempat yang tenang.</li>
          <li>Tunggu AI selesai bicara, baru jawab. Lingkaran di samping namanya berubah hijau saat giliranmu.</li>
          <li>Ngobrol bebas maksimal 10 menit per sesi. Kuota internet sekitar 3–4 MB per menit.</li>
        </ul>
        <p class="small-note ex-privacy">Suaramu dikirim ke Google Gemini selama percakapan berlangsung.
        Satu sesi ngobrol memakai 1 kuota AI (+1 kalau kamu minta penilaian); tes examiner memakai 2
        (percakapan + penilaian). <a href="privacy.html">Kebijakan privasi</a></p>
      </div>`;

    main.querySelectorAll('button[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => start(btn.dataset.kind, btn.dataset.option, btn));
    });
  }

  function personaHead(p) {
    return `<div class="pt-head"><span class="pt-avatar" aria-hidden="true">${p.name[0]}</span>
      <div><strong>${p.name}</strong><span class="pt-label">${p.label}</span></div></div>`;
  }

  function gateHtml(gate) {
    if (gate === 'login') {
      return `<p>Masuk dulu untuk mulai ngobrol dengan AI.</p>
        <a class="btn" href="login.html?next=ai-speaking.html">Masuk / Daftar</a>`;
    }
    if (gate === 'locked') {
      return `<p>Ngobrol AI termasuk <strong>Akses Penuh</strong>. Kamu tetap bisa latihan rekam +
        transkrip di <a href="speaking.html">Speaking</a>.</p>
        <a class="btn" href="upgrade.html">Buka Akses Penuh</a>`;
    }
    if (gate === 'unsupported') return '<p>Browser ini belum mendukung percakapan suara. Coba Chrome, Edge, atau Safari versi terbaru.</p>';
    return '<p>Ngobrol AI hanya tersedia di versi web.</p>';
  }

  // --- Mulai sesi --------------------------------------------------------------------

  async function start(kind, option, btn) {
    main.querySelectorAll('button[data-kind]').forEach((b) => { b.disabled = true; });
    btn.textContent = 'Menyiapkan mikrofon…';
    if (channel) channel.postMessage({ type: 'session-start', tab: TAB_ID });
    S = newSession(kind, option);

    try {
      await setupAudio();
    } catch (err) {
      cleanup();
      S = null;
      renderIntro('ok', micErrorText(err));
      return;
    }

    btn.textContent = 'Menyambungkan…';
    const res = await window.ielts.getLiveToken(kind === 'partner' ? { kind, persona: option } : { mode: option });
    if (!res.ok) {
      cleanup();
      S = null;
      renderIntro('ok', res.error);
      return;
    }
    S.ticket = res.ticket;
    S.plan = res.plan;
    S.model = res.model;

    renderStage();
    try {
      await connect(res.token);
    } catch (err) {
      finish('connect');
      return;
    }
    S.startedAt = Date.now();
    S.partStartedAt = S.startedAt;
    sendNote(S.kind === 'exam'
      ? '[The candidate has joined. Begin the test now.]'
      : '[The learner has joined. Greet them in character and start the conversation.]');
    S.timer = setInterval(tick, 250);
  }

  function newSession(kind, option) {
    const partner = kind === 'partner' ? PARTNERS.find((p) => p.id === option) : null;
    return {
      kind, mode: kind === 'exam' ? option : null, partner,
      who: partner ? partner.name : EXAMINER.name,
      model: null, ticket: null, plan: null,
      ws: null, ready: false, ended: false,
      ctx: null, stream: null, node: null,
      playHead: 0, sources: new Set(), wasBusy: false, quietSince: 0,
      phase: kind === 'exam' ? 'part1' : 'chat', startedAt: 0, partStartedAt: 0, prepEndsAt: 0, talkEndsAt: 0,
      part1Nudged: false, part3Nudged: false, wrapNudged: false,
      after: null, afterFallback: 0, armedAt: 0, audioSinceArm: false,
      modelTurnDone: true, aiTextAt: 0, talkLogStart: 0,
      log: [], failures: 0, swapPending: false, swapping: false,
      level: 0, captions: true, timer: null
    };
  }

  async function setupAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    S.ctx = new AC();
    await S.ctx.resume();
    S.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    });
    await S.ctx.audioWorklet.addModule('js/mic-worklet.js');
    const src = S.ctx.createMediaStreamSource(S.stream);
    S.node = new AudioWorkletNode(S.ctx, 'mic-capture');
    S.node.port.onmessage = (e) => onMicChunk(e.data);
    // Worklet hanya diproses kalau tersambung ke output; volumenya dinolkan.
    const mute = S.ctx.createGain();
    mute.gain.value = 0;
    src.connect(S.node);
    S.node.connect(mute);
    mute.connect(S.ctx.destination);
  }

  function micErrorText(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Akses mikrofon ditolak. Izinkan mikrofon untuk situs ini di pengaturan browser, lalu coba lagi.';
    }
    if (name === 'NotFoundError') return 'Mikrofon tidak ditemukan. Sambungkan mikrofon atau earphone, lalu coba lagi.';
    if (name === 'NotReadableError') return 'Mikrofon sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.';
    return 'Mikrofon tidak bisa dipakai: ' + ((err && err.message) || err);
  }

  // --- Koneksi ke Gemini Live ----------------------------------------------------

  function connect(token, seed) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
      ws.binaryType = 'arraybuffer';
      S.ws = ws;
      S.ready = false;
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (S && S.ws === ws) S.ws = null; // supaya onclose tidak memicu sambung ulang kedua
        try { ws.close(); } catch (_) { /* abaikan */ }
        reject(new Error('timeout'));
      }, 15000);

      ws.onopen = () => ws.send(JSON.stringify({ setup: { model: `models/${S.model}` } }));
      ws.onmessage = (e) => {
        if (!S || ws !== S.ws) return;
        let m;
        try {
          m = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data));
        } catch (_) {
          return;
        }
        if (m.setupComplete) {
          S.ready = true;
          if (seed) send({ clientContent: { turns: [{ role: 'user', parts: [{ text: seed.text }] }], turnComplete: seed.complete } });
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
          return;
        }
        onServerMessage(m);
      };
      ws.onclose = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('closed'));
          return;
        }
        if (S && ws === S.ws) reconnect(false);
      };
    });
  }

  function send(obj) {
    if (S && S.ws && S.ws.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(obj));
  }

  /** Catatan dari aplikasi ke AI. complete=false: dibaca saat giliran berikutnya. */
  function sendNote(text, complete = true) {
    send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: complete } });
  }

  function onServerMessage(m) {
    if (m.toolCall) (m.toolCall.functionCalls || []).forEach(onToolCall);
    if (m.goAway) S.swapPending = true;
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interrupted) {
      stopPlayback();
      S.modelTurnDone = true;
    }
    if (sc.modelTurn) {
      S.modelTurnDone = false;
      for (const p of sc.modelTurn.parts || []) {
        if (p.inlineData && p.inlineData.data) {
          const rate = parseInt((/rate=(\d+)/.exec(p.inlineData.mimeType || '') || [])[1], 10) || 24000;
          playChunk(p.inlineData.data, rate);
          S.audioSinceArm = true;
        }
      }
    }
    if (sc.inputTranscription && sc.inputTranscription.text) addLine('user', sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) {
      S.aiTextAt = Date.now();
      addLine('ai', sc.outputTranscription.text);
      if (S.kind === 'exam') detectPhaseFromSpeech();
    }
    if (sc.turnComplete) S.modelTurnDone = true;
  }

  function onToolCall(f) {
    if (f.name === 'begin_part_two') enterPart2();
    else if (f.name === 'begin_part_three') enterPart3();
    else if (f.name === 'end_test') enterEnding();
    // end_test sengaja tidak dibalas: balasan membuat examiner bicara lagi.
    if (f.name !== 'end_test') {
      send({ toolResponse: { functionResponses: [{ id: f.id, name: f.name, response: { ok: true } }] } });
    }
  }

  /** Cadangan kalau examiner lupa memanggil function: kenali kalimat bakunya. */
  function detectPhaseFromSpeech() {
    const line = lastAiLine();
    const t = line ? line.text : '';
    if (S.phase === 'part1' && /your topic is|one minute to think/i.test(t)) enterPart2();
    else if ((S.phase === 'talk' || S.phase === 'p2-after') && /we've been talking about|more general questions/i.test(t)) enterPart3();
    if (/end of the speaking (test|practice)/i.test(t)) enterEnding();
  }

  // --- Alur Part (examiner) -------------------------------------------------------

  function enterPart2() {
    if (S.mode !== 'full' || S.phase !== 'part1') return;
    S.phase = 'p2-intro';
    showCueCard(true);
    whenAiDone(startPrep, 8000);
  }

  function startPrep() {
    S.phase = 'prep';
    S.prepEndsAt = Date.now() + PREP_SECONDS * 1000;
    send({ realtimeInput: { audioStreamEnd: true } });
  }

  function endPrep() {
    S.phase = 'p2-cue';
    sendNote('[Preparation time is over]');
    whenAiDone(() => {
      if (S.phase !== 'p2-cue') return;
      S.phase = 'talk';
      S.talkEndsAt = Date.now() + TALK_SECONDS * 1000;
      S.talkLogStart = S.log.length;
    }, 8000);
  }

  function enterPart3() {
    if (S.mode !== 'full' || S.phase === 'part3' || S.phase === 'ending') return;
    S.phase = 'part3';
    S.partStartedAt = Date.now();
    showCueCard(false);
  }

  function enterEnding() {
    if (S.phase === 'ending') return;
    S.phase = 'ending';
    whenAiDone(() => finish('done'), 2500);
  }

  /**
   * Jalankan fn setelah AI selesai bicara. Kalau sejak sekarang belum ada
   * suara baru, tunggu maksimal fallbackMs (mis. suara sudah keluar duluan).
   */
  function whenAiDone(fn, fallbackMs) {
    S.after = fn;
    S.afterFallback = fallbackMs;
    S.armedAt = Date.now();
    S.audioSinceArm = false;
  }

  function tick() {
    if (!S || S.ended) return;
    const now = Date.now();
    const busy = aiBusy();
    if (S.wasBusy && !busy) S.quietSince = now;
    S.wasBusy = busy;

    if (S.after && !busy && (S.audioSinceArm || now - S.armedAt > S.afterFallback)) {
      const fn = S.after;
      S.after = null;
      fn();
    }

    if (S.kind === 'exam') {
      if (S.phase === 'prep' && now >= S.prepEndsAt) endPrep();
      // Examiner menanggapi dengan kalimat utuh (bukan sekadar "Mm-hmm") saat
      // monolog Part 2: berarti kandidat sudah selesai lebih cepat.
      if (S.phase === 'talk' && S.log.slice(S.talkLogStart).some((l) => l.who === 'ai' && l.text.trim().length > 20)) {
        S.phase = 'p2-after';
      }
      if (S.phase === 'talk' && now >= S.talkEndsAt) {
        S.phase = 'p2-after';
        sendNote('[Two minutes are up]');
      }
      if (S.phase === 'part1' && !S.part1Nudged && now - S.partStartedAt > PART1_LIMIT_MS) {
        S.part1Nudged = true;
        sendNote('[Part 1 time is up]', false);
      }
      if (S.phase === 'part3' && !S.part3Nudged && now - S.partStartedAt > PART3_LIMIT_MS) {
        S.part3Nudged = true;
        sendNote('[Time is up. End the test now.]', false);
      }
    } else if (!S.wrapNudged && now - S.startedAt > CHAT_WRAP_MS) {
      S.wrapNudged = true;
      sendNote('[Time is almost up. Wrap up the chat in one or two short turns and say goodbye.]', false);
    }
    if (now - S.startedAt > (S.kind === 'exam' ? EXAM_LIMIT_MS : CHAT_LIMIT_MS)) {
      finish('timeout');
      return;
    }

    // Google mengganti koneksi tiap ~10 menit (goAway). Pindah di saat aman:
    // tepat setelah AI bertanya, atau selama waktu persiapan.
    if (S.swapPending && !S.swapping && S.ready && S.phase !== 'ending') {
      const last = S.log[S.log.length - 1];
      const justAsked = !busy && last && last.who === 'ai' && now - S.quietSince < 2000;
      if (justAsked || S.phase === 'prep') reconnect(true);
    }

    renderStatus();
  }

  // --- Sambung ulang -----------------------------------------------------------

  async function reconnect(planned) {
    if (!S || S.ended || S.swapping) return;
    S.swapping = true;
    S.swapPending = false;
    S.ready = false;
    S.modelTurnDone = true; // giliran yang terpotong tidak akan pernah "complete"
    const old = S.ws;
    S.ws = null;
    if (old) { try { old.close(); } catch (_) { /* abaikan */ } }
    if (!planned) S.failures++;
    if (S.failures > MAX_FAILURES) {
      finish('connection');
      return;
    }
    renderStatus();

    const res = await window.ielts.getLiveToken({ ticket: S.ticket });
    if (!S || S.ended) return;
    if (!res.ok) {
      finish(res.expired ? 'timeout' : 'connection');
      return;
    }
    try {
      S.model = res.model;
      await connect(res.token, buildSeed(planned));
      S.swapping = false;
    } catch (_) {
      S.swapping = false;
      if (S && !S.ended) setTimeout(() => reconnect(false), 2000);
    }
  }

  /** Riwayat percakapan untuk koneksi baru, supaya AI melanjutkan dari situ. */
  function buildSeed(planned) {
    let history = transcriptText();
    if (history.length > 6000) history = '…' + history.slice(-6000);
    const where = {
      chat: 'We are in the middle of a casual chat.',
      part1: 'We are in Part 1.',
      'p2-intro': 'We are starting Part 2 and the cue card is on screen.',
      prep: 'The candidate is preparing for Part 2.',
      'p2-cue': 'Preparation time for Part 2 is over.',
      talk: 'The candidate is giving their Part 2 talk.',
      'p2-after': 'Part 2 is finishing.',
      part3: 'We are in Part 3.'
    }[S.phase] || '';
    const last = S.log[S.log.length - 1];
    const justAsked = planned && last && last.who === 'ai';

    let tail = 'Continue from where it stopped, without greeting again. If your last question was not answered, briefly ask it again.';
    let complete = true;
    if (S.phase === 'prep') {
      tail = 'Stay silent until you receive [Preparation time is over].';
      complete = false;
    } else if (justAsked) {
      tail = 'Your last question has just been asked and the other person is about to answer. Do not say anything now. Wait for the answer, then continue without greeting again.';
      complete = false;
    } else if (S.phase === 'talk') {
      tail = 'Say only: "Sorry, we lost the connection for a moment. Please carry on."';
    }
    return { text: `[The connection was switched. Conversation so far:\n${history}\n${where} ${tail}]`, complete };
  }

  // --- Audio ---------------------------------------------------------------------

  function onMicChunk(data) {
    if (!S || S.ended) return;
    const open = micOpen();
    S.level = open ? data.level : 0;
    if (open) send({ realtimeInput: { audio: { data: toBase64(data.pcm), mimeType: 'audio/pcm;rate=16000' } } });
  }

  function micOpen() {
    return S.ready && !S.swapping && S.phase !== 'prep' && S.phase !== 'ending' && !aiBusy();
  }

  /**
   * AI dianggap masih bicara sampai gilirannya selesai DAN suaranya habis
   * diputar. Audio datang per potongan; tanpa cek turnDone, jeda kecil antar
   * potongan sempat membuka mikrofon di tengah kalimat AI.
   */
  function aiBusy() {
    // Teks AI kadang tiba sebelum potongan suara pertamanya.
    return !S.modelTurnDone || aiAudible() || Date.now() - S.aiTextAt < 1200;
  }

  function aiAudible() {
    return !!S.ctx && S.ctx.currentTime < S.playHead + ECHO_TAIL_S;
  }

  function playChunk(b64, rate) {
    const bin = atob(b64);
    const n = bin.length >> 1;
    if (!n) return;
    const buf = S.ctx.createBuffer(1, n, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      ch[i] = v / 0x8000;
    }
    const src = S.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(S.ctx.destination);
    const at = Math.max(S.ctx.currentTime + 0.05, S.playHead);
    src.start(at);
    S.playHead = at + buf.duration;
    S.sources.add(src);
    src.onended = () => S && S.sources.delete(src);
  }

  function stopPlayback() {
    S.sources.forEach((s) => { try { s.stop(); } catch (_) { /* sudah berhenti */ } });
    S.sources.clear();
    S.playHead = S.ctx ? S.ctx.currentTime : 0;
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function cleanup() {
    if (!S) return;
    clearInterval(S.timer);
    if (S.ws) {
      const ws = S.ws;
      S.ws = null;
      try { ws.close(); } catch (_) { /* abaikan */ }
    }
    if (S.node) S.node.port.onmessage = null;
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    if (S.ctx && S.ctx.state !== 'closed') S.ctx.close().catch(() => {});
  }

  // --- Transkrip -----------------------------------------------------------------

  function addLine(who, text) {
    const last = S.log[S.log.length - 1];
    // Giliran AI berurutan digabung; beri spasi supaya kalimat tidak menempel.
    if (last && last.who === who) last.text += (/[.?!]$/.test(last.text) && /^\S/.test(text) ? ' ' : '') + text;
    else S.log.push({ who, text: text.replace(/^\s+/, '') });
    renderLive();
  }

  function speakerName(who) {
    if (who === 'user') return S.kind === 'exam' ? 'Candidate' : 'Learner';
    return S.kind === 'exam' ? 'Examiner' : S.who;
  }

  function transcriptText(log = S.log) {
    return log.map((l) => `${speakerName(l.who)}: ${l.text.trim()}`).join('\n');
  }

  function userWords() {
    return S.log.filter((l) => l.who === 'user')
      .reduce((n, l) => n + l.text.trim().split(/\s+/).filter(Boolean).length, 0);
  }

  // --- Tampilan sesi -------------------------------------------------------------

  function renderStage() {
    const exam = S.kind === 'exam';
    const p2 = exam ? S.plan.part2 : null;
    const tone = exam ? EXAMINER.tone : S.partner.tone;
    main.innerHTML = `
      <div class="page-header">
        <h2>${exam ? 'Tes dengan examiner' : `Ngobrol dengan ${S.who}`}</h2>
        <div class="meta">${exam ? MODES[S.mode].label : S.partner.label}</div>
      </div>
      <div class="ex-wrap">
        <section class="ex-stage" aria-label="Sesi percakapan">
          <div class="ex-top">
            <span class="ex-part" id="ex-part">${exam ? PART_LABEL.part1 : 'Ngobrol bebas · maks. 10 menit'}</span>
            <span class="ex-clock" id="ex-clock">00:00</span>
          </div>
          <div class="ex-face">
            <div class="ex-orb" id="ex-orb" data-state="wait" data-tone="${tone}" aria-hidden="true">${S.who[0]}</div>
            <div>
              <div class="ex-name">${S.who}, ${exam ? 'examiner' : S.partner.label.toLowerCase()}</div>
              <div class="ex-status" id="ex-status">Menyambungkan…</div>
              <span class="ex-sr" id="ex-sr" aria-live="polite"></span>
            </div>
          </div>
          <p class="ex-caption" id="ex-caption"></p>
          <div class="ex-mic">
            <span>Mikrofon</span>
            <span class="ex-meter"><i id="ex-level"></i></span>
          </div>
          <p class="ex-heard" id="ex-heard"></p>
        </section>
        ${p2 ? `
        <div class="cue-card ex-cue" id="ex-cue" hidden>
          <div class="cue-title">${esc(p2.title)}</div>
          <div>You should say:</div>
          <ul>${p2.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
          <div class="ex-prep" id="ex-prep"></div>
          <textarea class="ex-notes" id="ex-notes" placeholder="Catatan singkat (opsional)…" aria-label="Catatan persiapan Part 2"></textarea>
        </div>` : ''}
        <div class="actions-row ex-actions">
          <button class="btn secondary" id="ex-end">${exam ? 'Akhiri tes' : 'Selesai ngobrol'}</button>
          <button class="btn secondary" id="ex-cc" aria-pressed="true">Sembunyikan teks ${S.who}</button>
        </div>
        <details class="card ex-log">
          <summary>Transkrip percakapan</summary>
          <div class="ex-lines" id="ex-log"></div>
        </details>
      </div>`;

    document.getElementById('ex-end').addEventListener('click', async () => {
      const [title, msg, okText, cancelText] = exam
        ? ['Akhiri tes sekarang?', 'Jawaban yang sudah terekam tetap bisa dinilai.', 'Akhiri', 'Lanjut tes']
        : ['Selesai ngobrol?', 'Transkrip obrolanmu tetap bisa kamu lihat dan nilai.', 'Selesai', 'Lanjut ngobrol'];
      const ok = window.UI ? await UI.confirm(msg, { title, okText, cancelText }) : confirm(title);
      if (ok) finish('user');
    });
    document.getElementById('ex-cc').addEventListener('click', (e) => {
      S.captions = !S.captions;
      e.currentTarget.setAttribute('aria-pressed', String(S.captions));
      e.currentTarget.textContent = `${S.captions ? 'Sembunyikan' : 'Tampilkan'} teks ${S.who}`;
      document.getElementById('ex-caption').hidden = !S.captions;
    });
  }

  function showCueCard(show) {
    const cue = document.getElementById('ex-cue');
    if (!cue) return;
    cue.hidden = !show;
    if (show) cue.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderStatus() {
    const $ = (id) => document.getElementById(id);
    if (!$('ex-status')) return;
    const [text, state] = statusOf();
    $('ex-status').textContent = text;
    $('ex-status').className = 'ex-status ' + state;
    // Pembaca layar hanya diberi tahu saat keadaan berganti, bukan tiap detik timer.
    if ($('ex-orb').dataset.state !== state) $('ex-sr').textContent = text.split(' · ')[0];
    $('ex-orb').dataset.state = state;
    const part = PART_OF[S.phase]; // saat penutupan, label Part terakhir dipertahankan
    if (part) $('ex-part').textContent = PART_LABEL[part];
    $('ex-clock').textContent = S.startedAt ? clock(Date.now() - S.startedAt) : '00:00';
    $('ex-level').style.width = Math.min(100, Math.round(S.level * 400)) + '%';
    const prep = $('ex-prep');
    if (prep) {
      prep.textContent = S.phase === 'prep' ? `Waktu persiapan: ${clock(S.prepEndsAt - Date.now())}`
        : S.phase === 'talk' ? `Sisa waktu bicara: ${clock(S.talkEndsAt - Date.now())}` : '';
    }
  }

  function statusOf() {
    if (S.swapping) return ['Koneksi tersendat, menyambung ulang…', 'wait'];
    if (!S.ready) return ['Menyambungkan…', 'wait'];
    if (aiBusy()) return [`${S.who} sedang bicara…`, 'speaking'];
    if (S.phase === 'ending') return ['Tes selesai.', 'wait'];
    if (S.phase === 'p2-intro') return ['Examiner menyiapkan topik Part 2…', 'wait'];
    if (S.phase === 'p2-cue') return ['Waktu persiapan habis. Tunggu aba-aba examiner…', 'wait'];
    if (S.phase === 'prep') return [`Waktu persiapan · ${clock(S.prepEndsAt - Date.now())}`, 'prep'];
    if (!S.log.some((l) => l.who === 'ai')) return [`${S.who} bersiap…`, 'wait'];
    if (S.phase === 'talk') return [`Giliranmu bicara · sisa ${clock(S.talkEndsAt - Date.now())}`, 'listening'];
    return [S.kind === 'exam' ? 'Giliranmu. Jawab dengan suara.' : 'Giliranmu. Ngobrol aja, pakai suara.', 'listening'];
  }

  function lastAiLine() {
    for (let i = S.log.length - 1; i >= 0; i--) if (S.log[i].who === 'ai') return S.log[i];
    return null;
  }

  function renderLive() {
    const caption = document.getElementById('ex-caption');
    if (!caption) return;
    const lastAi = lastAiLine();
    caption.textContent = lastAi ? tail(lastAi.text.trim(), 220) : '';
    const last = S.log[S.log.length - 1];
    document.getElementById('ex-heard').textContent =
      last && last.who === 'user' ? `Terdengar: “${tail(last.text.trim(), 140)}”` : '';
    const box = document.getElementById('ex-log');
    if (box && box.closest('details').open) box.innerHTML = linesHtml(S.log);
  }

  function linesHtml(log) {
    return log.map((l) => `<p class="${l.who}"><span class="who">${l.who === 'ai' ? S.who : 'Kamu'}</span>${esc(l.text.trim())}</p>`).join('');
  }

  // --- Selesai & penilaian -------------------------------------------------------

  async function finish(reason) {
    if (!S || S.ended) return;
    S.ended = true;
    const duration = S.startedAt ? Math.round((Date.now() - S.startedAt) / 1000) : 0;
    cleanup();

    const exam = S.kind === 'exam';
    const notes = {
      connection: 'Koneksi terputus beberapa kali, jadi sesi dihentikan. Yang sudah terekam tetap bisa dinilai.',
      timeout: exam ? 'Waktu tes sudah habis.' : 'Waktu ngobrol sudah habis (maks. 10 menit per sesi).',
      connect: 'Gagal tersambung. Periksa koneksi internetmu, lalu coba lagi.',
      'other-tab': 'Sesi ini dihentikan karena kamu memulai Ngobrol AI di tab lain. Hanya satu sesi yang bisa aktif supaya suaranya tidak dobel.'
    };
    main.innerHTML = `
      <div class="page-header">
        <h2>${exam ? 'Hasil tes examiner' : `Selesai ngobrol dengan ${S.who}`}</h2>
        <div class="meta">${exam ? MODES[S.mode].label : S.partner.label} · ${clock(duration * 1000)}</div>
      </div>
      <div class="ex-wrap">
        ${notes[reason] ? `<p class="free-note">${notes[reason]}</p>` : ''}
        <div id="ex-result"></div>
        <details class="card ex-log" ${S.log.length ? 'open' : ''}>
          <summary>Transkrip percakapan</summary>
          <div class="ex-lines">${linesHtml(S.log) || '<p class="muted">Belum ada percakapan.</p>'}</div>
        </details>
      </div>`;

    const box = document.getElementById('ex-result');
    const again = exam
      ? `<button class="btn" data-again>Tes lagi</button>`
      : `<button class="btn" data-again>Ngobrol lagi dengan ${S.who}</button>`;
    const actions = `<div class="actions-row">${again}<a href="ai-speaking.html" class="btn secondary">${exam ? 'Kembali ke Ngobrol AI' : 'Pilih teman lain'}</a></div>`;
    const wire = () => {
      const b = box.querySelector('[data-again]');
      if (b) b.addEventListener('click', () => start(S.kind, exam ? S.mode : S.partner.id, b));
    };
    const words = userWords();

    if (reason === 'connect' || reason === 'other-tab') {
      box.innerHTML = actions;
      wire();
      return;
    }
    if (words < MIN_WORDS_TO_SCORE) {
      box.innerHTML = `<div class="ai-result-box"><h3>Belum bisa dinilai</h3>
        <p>Kamu baru bicara ${words} kata. Penilaian butuh minimal ${MIN_WORDS_TO_SCORE} kata
        supaya hasilnya berarti, jadi kuota penilaian tidak dipakai.</p>${actions}</div>`;
      wire();
      return;
    }
    if (exam) {
      await score(box, actions, duration);
      wire();
      return;
    }
    // Ngobrol bebas: penilaian opsional (memakai 1 kuota lagi).
    box.innerHTML = `<div class="ai-result-box">
        <h3>Mau tahu perkiraan band-mu?</h3>
        <p>AI bisa menilai ucapanmu di obrolan ini (Fluency, Lexical, Grammar) dan memberi
        contoh kalimat yang lebih baik. Memakai 1 kuota AI.</p>
        <div class="actions-row"><button class="btn" id="ex-score">Nilai obrolanku</button></div>
        ${actions}
      </div>`;
    wire();
    document.getElementById('ex-score').addEventListener('click', async () => {
      await score(box, actions, duration);
      wire();
    });
  }

  async function score(box, actions, duration) {
    box.innerHTML = '<div class="ai-result-box loading"><p>AI sedang menilai… (10–20 detik)</p></div>';
    const res = await window.ielts.getAIFeedback({
      type: 'speaking-feedback',
      content: { part: scorePart(), question: scoringQuestion(), transcript: scoringTranscript(), duration }
    });
    if (!res.ok) {
      box.innerHTML = `<div class="ai-result-box error-text">${esc(res.error || 'Penilaian gagal.')}</div>${actions}`;
      return;
    }
    const band = extractBand(res.text);
    if (band !== null) saveSession(band, duration);
    const quotaNote = res.quota
      ? `<div class="quota-note">Sisa kuota AI bulan ini: <strong>${Math.max(0, res.quota.limit - res.quota.used)}</strong> dari ${res.quota.limit}. Kuota direset tiap awal bulan.</div>`
      : '';
    box.innerHTML = `
      <div class="ai-result-box">
        <div class="ai-rendered">${markdownToHtml(res.text)}</div>
        ${quotaNote}
        ${actions}
      </div>`;
  }

  function scorePart() {
    return S.kind === 'exam' ? MODES[S.mode].scorePart : 'Free conversation';
  }

  function scoringQuestion() {
    if (S.kind !== 'exam') {
      return `Obrolan bebas dengan teman ngobrol AI (${S.who}, gaya ${S.partner.label.toLowerCase()}). ` +
        'Transkrip berisi ucapan partner dan pelajar; nilai ucapan pelajar (Learner) saja.';
    }
    const p = S.plan;
    return `Simulasi tes dengan AI Examiner (${MODES[S.mode].scorePart}). Topik Part 1: ${p.part1.join(', ')}.` +
      (p.part2 ? ` Cue card Part 2: ${p.part2.title}.` : '') +
      ' Transkrip berisi pertanyaan examiner dan jawaban kandidat; nilai jawaban kandidat saja.';
  }

  /** Batas server 8000 karakter: kalau kepanjangan, ringkas dulu kalimat AI. */
  function scoringTranscript() {
    let text = transcriptText();
    if (text.length > 7900) {
      text = transcriptText(S.log.map((l) => (l.who === 'ai' ? { who: l.who, text: tail(l.text.trim(), 90, true) } : l)));
    }
    return text.slice(0, 7900);
  }

  function extractBand(text) {
    const m = text.match(/Band Score Overall:\s*([\d.]+)/i);
    return m ? parseFloat(m[1]) : null;
  }

  function saveSession(band, duration) {
    const exam = S.kind === 'exam';
    const session = {
      part: exam ? 'examiner' : 'partner',
      cardId: exam ? 'ai-examiner-' + S.mode : 'ai-partner-' + S.partner.id,
      cardTitle: exam ? 'AI Examiner · ' + MODES[S.mode].label : `Ngobrol AI · ${S.who} (${S.partner.label})`,
      date: new Date().toISOString(),
      band,
      duration
    };
    if (window.Store) Store.saveSession('speaking', session);
  }

  // --- Utilitas ------------------------------------------------------------------

  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Potong teks panjang. fromStart=true: ambil awalnya; default: ambil ujungnya. */
  function tail(s, max, fromStart) {
    if (s.length <= max) return s;
    return fromStart ? s.slice(0, max) + '…' : '…' + s.slice(-max);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function markdownToHtml(md) {
    const html = md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    const out = [];
    let inList = false;
    for (const line of html.split('\n')) {
      if (/^\s*-\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + line.replace(/^\s*-\s+/, '') + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(line.trim() && !/^<h[123]>/.test(line) ? '<p>' + line + '</p>' : line);
      }
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
  }

  window.addEventListener('beforeunload', (e) => {
    if (S && S.startedAt && !S.ended) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
