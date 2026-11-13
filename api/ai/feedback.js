// Jenis permintaan yang dipakai aplikasi web. Jenis lain DITOLAK, dan hanya field
// yang terdaftar di sini yang diteruskan ke LLM. Setiap field dicek tipe dan
// panjangnya supaya satu panggilan tidak bisa membengkak biayanya:
//   kind 'text'   -> string, maksimal `max` karakter.
//   kind 'number' -> angka (jumlah kata, durasi dalam detik).
//   required      -> true, atau pesan untuk user kalau field itu kosong.
//   metered       -> memakai 1 kuota AI bulanan (panggilan termahal: 3000 token).
const REQUEST_TYPES = {
  'writing-score': {
    metered: true,
    fields: {
      task: { kind: 'text', max: 20 },
      prompt: { kind: 'text', max: 3000 },
      essay: { kind: 'text', max: 8000, required: 'Esai masih kosong.' },
      wordCount: { kind: 'number' }
    }
  },
  'speaking-feedback': {
    metered: true,
    fields: {
      part: { kind: 'text', max: 60 },
      question: { kind: 'text', max: 2000 },
      transcript: { kind: 'text', max: 8000, required: 'Belum ada jawaban yang bisa dinilai.' },
      duration: { kind: 'number' }
    }
  },
  'reading-explain': {
    metered: false,
    contextMax: 4000, // paragraf passage yang relevan (field `context` di body)
    fields: {
      question: { kind: 'text', max: 2000, required: true },
      questionType: { kind: 'text', max: 120 },
      userAnswer: { kind: 'text', max: 600 },
      correctAnswer: { kind: 'text', max: 600, required: true }
    }
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  // 1) VALIDASI — jenis + isi request dicek dulu, sebelum menyentuh database
  //    atau LLM. Yang lolos hanya field terdaftar dengan tipe & panjang yang benar.
  const request = parseRequest(req.body);
  if (request.error) {
    res.status(request.status).json({ ok: false, error: request.error });
    return;
  }
  const { type, spec, content, context } = request;

  // 2) WAJIB LOGIN — verifikasi token Supabase. Tanpa user terverifikasi, tolak.
  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Silakan login dulu untuk memakai fitur AI.' });
    return;
  }

  // 3) WAJIB BERLISENSI — aktif secara default, lihat licenseRequired().
  if (licenseRequired()) {
    const paid = await hasLicense(user.id);
    if (!paid) {
      res.status(403).json({ ok: false, error: 'Penilaian AI adalah fitur berbayar. Upgrade dulu untuk membukanya.' });
      return;
    }
  }

  // 4) KUOTA BULANAN — hanya untuk scoring berat (Writing/Speaking).
  let quotaInfo = null;
  if (spec.metered) {
    const limit = parseInt(process.env.AI_MONTHLY_LIMIT || '60', 10);
    const quota = await consumeQuota(user.id, limit);
    if (!quota.ok) {
      // Fail-closed: kalau pengecekan kuota gagal/salah konfigurasi, jangan
      // teruskan ke LLM (lindungi dompet daripada jebol diam-diam).
      res.status(200).json({ ok: false, error: quota.error });
      return;
    }
    if (!quota.allowed) {
      res.status(200).json({
        ok: false,
        error: `Kuota scoring AI bulan ini sudah habis (${quota.used}/${quota.limit}). Kuota direset otomatis awal bulan depan.`
      });
      return;
    }
    quotaInfo = { used: quota.used, limit: quota.limit };
  }

  // 5) Panggil LLM.
  const provider = (process.env.AI_PROVIDER || 'claude').toLowerCase();
  const maxTokens = spec.metered ? 3000 : 1500;

  try {
    const systemPrompt = buildSystemPrompt(type);
    const userPrompt = buildUserPrompt(type, content, context);
    const result = provider === 'gemini'
      ? await callGemini({ systemPrompt, userPrompt, maxTokens })
      : await callClaude({ systemPrompt, userPrompt, maxTokens });
    if (quotaInfo) result.quota = quotaInfo;
    res.status(200).json(result);
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message || String(err) });
  }
};

// Dipakai ulang oleh api/ai/live-token.js (Ngobrol AI) supaya aturan login,
// lisensi, dan kuota tetap satu sumber.
module.exports.verifyUser = verifyUser;
module.exports.licenseRequired = licenseRequired;
module.exports.hasLicense = hasLicense;
module.exports.consumeQuota = consumeQuota;

// --- Keamanan & kontrol biaya -------------------------------------------------

/** Verifikasi access token Supabase dari header Authorization. */
async function verifyUser(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null; // fail-closed: server belum dikonfigurasi.

  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

/** true kalau user punya lisensi 'active' (sudah bayar). Pakai service role. */
async function hasLicense(userId) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return false; // fail-closed: anggap belum bayar.
  try {
    const r = await fetch(
      `${url}/rest/v1/licenses?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=user_id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Fitur AI hanya untuk akun berlisensi. AKTIF secara default (fail-closed):
 * hanya REQUIRE_PAID_LICENSE=false yang mematikannya, dan itu khusus untuk
 * development lokal — jangan pernah di Vercel production.
 */
function licenseRequired() {
  return (process.env.REQUIRE_PAID_LICENSE || '').trim().toLowerCase() !== 'false';
}

/**
 * Cek jenis + isi request terhadap REQUEST_TYPES. Mengembalikan
 * { type, spec, content, context } yang HANYA berisi field terdaftar, atau
 * { status, error } kalau ditolak. Pesan error sengaja tidak mengulang isi
 * kiriman user.
 */
function parseRequest(body) {
  const { type, content, context } = body || {};
  const spec = typeof type === 'string' && Object.prototype.hasOwnProperty.call(REQUEST_TYPES, type)
    ? REQUEST_TYPES[type]
    : null;
  if (!spec) return { status: 400, error: 'Request tidak valid: jenis permintaan tidak dikenal.' };
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { status: 400, error: 'Request tidak valid: content harus berupa objek.' };
  }

  const clean = {};
  for (const [name, rule] of Object.entries(spec.fields)) {
    const val = content[name];
    if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
      if (rule.required) {
        const msg = typeof rule.required === 'string' ? rule.required : `Request tidak valid: "${name}" wajib diisi.`;
        return { status: 400, error: msg };
      }
      continue;
    }
    if (rule.kind === 'number') {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        return { status: 400, error: `Request tidak valid: "${name}" harus berupa angka.` };
      }
      clean[name] = Math.round(val);
      continue;
    }
    if (typeof val !== 'string') {
      return { status: 400, error: `Request tidak valid: "${name}" harus berupa teks.` };
    }
    if (val.length > rule.max) {
      return { status: 413, error: `Input "${name}" terlalu panjang (${val.length} karakter, maksimal ${rule.max}).` };
    }
    clean[name] = val;
  }

  let cleanContext = '';
  if (spec.contextMax && context !== undefined && context !== null) {
    if (typeof context !== 'string') {
      return { status: 400, error: 'Request tidak valid: "context" harus berupa teks.' };
    }
    if (context.length > spec.contextMax) {
      return { status: 413, error: `Input "context" terlalu panjang (${context.length} karakter, maksimal ${spec.contextMax}).` };
    }
    cleanContext = context;
  }

  return { type, spec, content: clean, context: cleanContext };
}

/**
 * Konsumsi 1 kuota secara atomik lewat Postgres function `consume_ai_quota`
 * (dipanggil dengan service role key — hanya ada di server, tidak pernah ke browser).
 * Lihat supabase-ai-quota.sql.
 */
async function consumeQuota(userId, limit) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, error: 'Server belum dikonfigurasi: set SUPABASE_SERVICE_ROLE_KEY di Vercel.' };
  }
  try {
    const r = await fetch(`${url}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ p_user: userId, p_limit: limit })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, error: `Gagal cek kuota (${r.status}). ${t.slice(0, 200)}` };
    }
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { ok: false, error: 'Gagal cek kuota: respons kosong.' };
    return { ok: true, allowed: row.allowed, used: row.used, limit: row.quota_limit };
  } catch (e) {
    return { ok: false, error: 'Gagal cek kuota: ' + (e.message || String(e)) };
  }
}

async function callClaude({ systemPrompt, userPrompt, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-ant-your-key')) {
    return {
      ok: false,
      error: 'ANTHROPIC_API_KEY belum diset di Vercel. Set di Project Settings > Environment Variables, atau ganti AI_PROVIDER=gemini.'
    };
  }

  const AnthropicMod = require('@anthropic-ai/sdk');
  const Anthropic = AnthropicMod.default || AnthropicMod;
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return { ok: true, text };
}

async function callGemini({ systemPrompt, userPrompt, maxTokens }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('your-gemini-key')) {
    return {
      ok: false,
      error: 'GEMINI_API_KEY belum diset di Vercel. Set di Project Settings > Environment Variables.'
    };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
    })
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false, error: `Gemini API error ${res.status}: ${errBody.slice(0, 300)}` };
  }

  const data = await res.json();
  const text = (data.candidates || [])
    .flatMap((c) => (c.content?.parts || []))
    .map((p) => p.text || '')
    .join('\n')
    .trim();

  if (!text) {
    const reason = data.candidates?.[0]?.finishReason || 'no content';
    return { ok: false, error: `Gemini tidak mengembalikan teks (${reason}).` };
  }

  return { ok: true, text };
}

function buildSystemPrompt(type) {
  if (type === 'reading-explain') {
    return 'You are an experienced IELTS examiner and tutor. Explain answers clearly in Bahasa Indonesia, using simple language. Keep explanations short (max 3 sentences per question). Focus on the strategy: which keywords to look for, why distractors are wrong.';
  }
  if (type === 'writing-score') {
    return `You are an experienced IELTS Writing examiner. Score essays strictly using the official IELTS band descriptors. Reply in Bahasa Indonesia.

Output format (use this exact structure with markdown):

## Band Score Overall: X.X

### Task Response: X.X
[2 sentences in Bahasa Indonesia explaining the score]

### Coherence & Cohesion: X.X
[2 sentences]

### Lexical Resource: X.X
[2 sentences]

### Grammatical Range & Accuracy: X.X
[2 sentences]

### Perbaikan Spesifik
- [3-5 bullet points with concrete suggestions to raise the band, in Bahasa Indonesia]

### Contoh Kalimat Lebih Baik
- Original: "[quote from user essay]"
  Perbaikan: "[improved version]"
- [2-3 examples total]

Be strict but fair. A band 6.5 essay needs: clear position, well-developed ideas, range of cohesive devices, less common vocabulary, and complex sentences with few errors.`;
  }
  if (type === 'speaking-feedback') {
    return `You are an experienced IELTS Speaking examiner. Evaluate transcripts using official IELTS band descriptors. Reply in Bahasa Indonesia.

Output format (use this exact structure):

## Band Score Overall: X.X

### Fluency & Coherence: X.X
[2 sentences in Bahasa Indonesia]

### Lexical Resource: X.X
[2 sentences]

### Grammatical Range & Accuracy: X.X
[2 sentences]

### Pronunciation: (tidak bisa dinilai dari transkrip)
Catatan: Untuk feedback pronunciation, latihan dengan native speaker (italki/Tandem).

### Perbaikan Spesifik
- [3-5 bullet points]

### Contoh Jawaban Band 7
[Tulis ulang singkat versi band 7 dengan struktur yang sama]

Be honest. Indicators of low fluency: short answers, repetition, basic vocabulary, simple sentences. Band 6.5+ needs: extended answers, range of vocabulary including some less common, complex grammar with mostly accurate use.`;
  }
  // Tidak bisa terjadi: parseRequest() sudah menolak jenis lain.
  throw new Error('Jenis permintaan tidak dikenal.');
}

// `content` sudah dibersihkan parseRequest(). Field opsional bisa tidak ada, jadi
// beri nilai pengganti supaya prompt tidak berisi "undefined".
function buildUserPrompt(type, content, context) {
  if (type === 'reading-explain') {
    return `Jelaskan jawaban yang benar untuk soal IELTS Reading berikut. Jawaban user: "${content.userAnswer || '(kosong)'}". Jawaban benar: "${content.correctAnswer}". Tipe soal: ${content.questionType || '-'}. Pertanyaan: "${content.question}". Kalimat relevan dari passage: "${context || '(tidak disediakan)'}". Jelaskan kenapa jawaban benar adalah "${content.correctAnswer}" dan strategi menemukannya.`;
  }
  if (type === 'writing-score') {
    return `Nilai esai IELTS ${content.task || 'Writing'} berikut. Prompt: "${content.prompt || '(tidak disediakan)'}". Word count: ${content.wordCount ?? '(tidak diketahui)'}.

Esai:
"""
${content.essay}
"""

Berikan band score detail per kriteria sesuai format yang diminta di system prompt.`;
  }
  if (type === 'speaking-feedback') {
    const part = content.part ? ` ${content.part}` : '';
    const duration = content.duration !== undefined ? `${content.duration} detik` : 'tidak diketahui';
    return `Nilai transkrip IELTS Speaking${part} berikut. Pertanyaan/cue card: "${content.question || '(tidak disediakan)'}".

Transkrip jawaban user:
"""
${content.transcript}
"""

Durasi: ${duration}. Berikan feedback band score sesuai format yang diminta.`;
  }
  // Tidak bisa terjadi: parseRequest() sudah menolak jenis lain. Jangan pernah
  // meneruskan isi mentah dari user ke LLM.
  throw new Error('Jenis permintaan tidak dikenal.');
}
