const AnthropicMod = require('@anthropic-ai/sdk');
const Anthropic = AnthropicMod.default || AnthropicMod;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-ant-your-key')) {
    res.status(200).json({
      ok: false,
      error: 'API key belum diset di server. Set environment variable ANTHROPIC_API_KEY di dashboard Vercel.'
    });
    return;
  }

  const { type, content, context } = req.body || {};
  if (!type || !content) {
    res.status(400).json({ ok: false, error: 'Request tidak valid: type dan content wajib diisi.' });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });

    const systemPrompt = buildSystemPrompt(type);
    const userPrompt = buildUserPrompt(type, content, context);

    const maxTokens = (type === 'writing-score' || type === 'speaking-feedback') ? 3000 : 1500;
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

    res.status(200).json({ ok: true, text });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message || String(err) });
  }
};

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
