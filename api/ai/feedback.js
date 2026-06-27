// Tipe yang dihitung terhadap kuota bulanan (panggilan AI termahal: 3000 token).
// Reading explain/tip lebih murah & cuma butuh login + batas input.
const METERED_TYPES = new Set(['writing-score', 'speaking-feedback']);

// Batas panjang input (karakter) supaya satu panggilan tidak membengkak biayanya.
const INPUT_LIMITS = {
  essay: 8000,
  transcript: 8000,
  prompt: 3000,
  question: 2000,
  context: 4000,
  userAnswer: 600,
  correctAnswer: 600,
  questionType: 120
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { type, content, context } = req.body || {};
  if (!type || !content) {
    res.status(400).json({ ok: false, error: 'Request tidak valid: type dan content wajib diisi.' });
    return;
  }

  // 1) WAJIB LOGIN — verifikasi token Supabase. Tanpa user terverifikasi, tolak.
  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Silakan login dulu untuk memakai fitur AI.' });
    return;
  }

  // 1b) WAJIB BERBAYAR — fitur AI premium. Aktifkan dengan REQUIRE_PAID_LICENSE=true
  //     di Vercel setelah sistem pembayaran siap (default off agar testing lancar).
  if ((process.env.REQUIRE_PAID_LICENSE || '').toLowerCase() === 'true') {
    const paid = await hasLicense(user.id);
    if (!paid) {
      res.status(403).json({ ok: false, error: 'Penilaian AI adalah fitur berbayar. Upgrade dulu untuk membukanya.' });
      return;
    }
  }

  // 2) BATAS PANJANG INPUT — cegah payload raksasa yang mahal.
  const oversize = checkInputSize(content, context);
  if (oversize) {
    res.status(413).json({ ok: false, error: oversize });
    return;
  }

  // 3) KUOTA BULANAN — hanya untuk scoring berat (Writing/Speaking).
  let quotaInfo = null;
  if (METERED_TYPES.has(type)) {
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

  // 4) Panggil LLM.
  const provider = (process.env.AI_PROVIDER || 'claude').toLowerCase();
  const systemPrompt = buildSystemPrompt(type);
  const userPrompt = buildUserPrompt(type, content, context);
  const maxTokens = METERED_TYPES.has(type) ? 3000 : 1500;

  try {
    const result = provider === 'gemini'
      ? await callGemini({ systemPrompt, userPrompt, maxTokens })
      : await callClaude({ systemPrompt, userPrompt, maxTokens });
    if (quotaInfo) result.quota = quotaInfo;
    res.status(200).json(result);
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message || String(err) });
  }
};

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

/** Pastikan field teks tidak melebihi batas. Mengembalikan pesan error / null. */
function checkInputSize(content, context) {
  const fields = { ...(content || {}) };
  if (typeof context === 'string') fields.context = context;
  for (const [key, max] of Object.entries(INPUT_LIMITS)) {
    const val = fields[key];
    if (typeof val === 'string' && val.length > max) {
      return `Input "${key}" terlalu panjang (${val.length} karakter, maksimal ${max}).`;
    }
  }
  return null;
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
  if (type === 'reading-tip') {
    return 'You are an IELTS reading coach. Give one specific, actionable tip in Bahasa Indonesia based on the question type. Max 4 sentences.';
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
  return 'You are a helpful IELTS tutor. Reply in Bahasa Indonesia.';
}

function buildUserPrompt(type, content, context) {
  if (type === 'reading-explain') {
    return `Jelaskan jawaban yang benar untuk soal IELTS Reading berikut. Jawaban user: "${content.userAnswer}". Jawaban benar: "${content.correctAnswer}". Tipe soal: ${content.questionType}. Pertanyaan: "${content.question}". Kalimat relevan dari passage: "${context || '(tidak disediakan)'}". Jelaskan kenapa jawaban benar adalah "${content.correctAnswer}" dan strategi menemukannya.`;
  }
  if (type === 'reading-tip') {
    return `Saya kesulitan dengan tipe soal "${content.questionType}" di IELTS Reading. Kasih satu tip strategi yang spesifik.`;
  }
  if (type === 'writing-score') {
    return `Nilai esai IELTS ${content.task} berikut. Prompt: "${content.prompt}". Word count: ${content.wordCount}.

Esai:
"""
${content.essay}
"""

Berikan band score detail per kriteria sesuai format yang diminta di system prompt.`;
  }
  if (type === 'speaking-feedback') {
    return `Nilai transkrip IELTS Speaking ${content.part} berikut. Pertanyaan/cue card: "${content.question}".

Transkrip jawaban user:
"""
${content.transcript}
"""

Durasi: ${content.duration} detik. Berikan feedback band score sesuai format yang diminta.`;
  }
  return content;
}
