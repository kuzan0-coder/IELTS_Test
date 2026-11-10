// Token sementara untuk "Ngobrol AI" — percakapan suara realtime (Gemini Live):
// teman ngobrol berkepribadian (mode bebas) atau examiner (simulasi IELTS Speaking).
//
// Browser tersambung LANGSUNG ke Google memakai token ini, jadi GEMINI_API_KEY
// tetap di server. Token dikunci ke model + instruksi di bawah (klien tidak bisa
// menggantinya) dan hanya bisa membuka 1 sesi.
//
// Sesi baru : body { kind: 'partner', persona } atau { mode: 'full' | 'short' }
//             (examiner) -> memakai 1 kuota AI bulanan.
// Sambung   : body { ticket } -> token baru untuk sesi yang sama, tanpa kuota.
//             Tiket ditandatangani server dan berlaku selama jendela sesinya.
const crypto = require('crypto');
const { verifyUser, hasLicense, consumeQuota } = require('./feedback');
const cards = require('../../src/data/speaking-cards.json');

const LIVE_MODEL = process.env.LIVE_MODEL || 'gemini-3.8-live';
const LIVE_VOICE = process.env.LIVE_VOICE || 'Kore';
const TEST_WINDOW_MS = 25 * 60 * 1000;
const PARTNER_WINDOW_MS = 15 * 60 * 1000;

// Teman ngobrol. Teks tampilannya (deskripsi, contoh kalimat) ada di
// src/js/ai-speaking.js — id harus sama.
const PARTNERS = {
  maya: {
    name: 'Maya',
    voice: 'Aoede',
    personality: 'Warm, patient, and encouraging, like a kind teacher. You speak a little slower than normal, celebrate small wins, and make nervous beginners feel safe.',
    corrections: "Only correct mistakes that make the meaning unclear. Do it gently by naturally repeating the correct version, for example: \"Oh, you went to Bandung last week? Nice!\""
  },
  leo: {
    name: 'Leo',
    voice: 'Puck',
    personality: 'Witty and playful, with dry, teasing humour, like a sarcastic friend who secretly wants the learner to win. Keep the jokes light and never mean.',
    corrections: 'Tease a clear mistake with a short, light joke, then give the correct version and ask them to try again. Invent a fresh joke every time; never reuse a joke or a punchline in the same chat.'
  },
  victor: {
    name: 'Victor',
    voice: 'Orus',
    personality: 'A strict but fair speaking coach: direct, focused, and demanding, because you want the learner to improve fast.',
    corrections: "Correct every clear grammar or vocabulary mistake right away and briefly, starting with \"Correction:\", then ask the learner to say the sentence again correctly. Push for longer answers with reasons and examples."
  },
  jess: {
    name: 'Jess',
    voice: 'Zephyr',
    personality: 'A relaxed, cheerful friend about the same age as the learner. You like chatting about everyday life, films, music, food, and campus life.',
    corrections: 'Mostly let mistakes go so the conversation keeps flowing. Now and then, teach a useful casual expression or idiom that fits what the learner just said.'
  }
};

// Part 3 yang temanya nyambung dengan cue card Part 2. Yang tidak ada di sini,
// pertanyaan Part 3 dibuat sendiri oleh examiner dari tema cue card.
const PART3_FOR = {
  'p2-skill': 'p3-skill',
  'p2-place': 'p3-travel',
  'p2-journey': 'p3-travel',
  'p2-decision': 'p3-decisions',
  'p2-gift': 'p3-traditions'
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('your-gemini-key')) {
    res.status(200).json({ ok: false, error: 'GEMINI_API_KEY belum diset di Vercel. Set di Project Settings > Environment Variables.' });
    return;
  }

  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Silakan login dulu untuk memakai Ngobrol AI.' });
    return;
  }

  if ((process.env.REQUIRE_PAID_LICENSE || '').toLowerCase() === 'true') {
    const paid = await hasLicense(user.id);
    if (!paid) {
      res.status(403).json({ ok: false, error: 'Ngobrol AI adalah fitur berbayar. Upgrade dulu untuk membukanya.' });
      return;
    }
  }

  const { mode, kind, persona, ticket } = req.body || {};
  let plan;
  if (ticket) {
    plan = readTicket(ticket, user.id, apiKey);
    if (!plan) {
      res.status(200).json({ ok: false, expired: true, error: 'Waktu sesi sudah habis. Mulai sesi baru.' });
      return;
    }
  } else if (kind === 'partner') {
    if (!Object.prototype.hasOwnProperty.call(PARTNERS, persona)) {
      res.status(400).json({ ok: false, error: 'Teman ngobrol tidak dikenal.' });
      return;
    }
    plan = { u: user.id, t: Date.now(), k: 'partner', p: persona };
  } else {
    plan = pickPlan(mode === 'short' ? 'short' : 'full', user.id);
  }

  // Buat token dulu (gratis) baru potong kuota, supaya kuota tidak hilang
  // kalau Google sedang error.
  let token;
  try {
    token = await mintToken(apiKey, plan);
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message || String(err) });
    return;
  }

  let quota = null;
  if (!ticket) {
    const limit = parseInt(process.env.AI_MONTHLY_LIMIT || '60', 10);
    const q = await consumeQuota(user.id, limit);
    if (!q.ok) {
      res.status(200).json({ ok: false, error: q.error });
      return;
    }
    if (!q.allowed) {
      res.status(200).json({
        ok: false,
        error: `Kuota AI bulan ini sudah habis (${q.used}/${q.limit}). Kuota direset otomatis awal bulan depan.`
      });
      return;
    }
    quota = { used: q.used, limit: q.limit };
  }

  res.status(200).json({
    ok: true,
    token,
    model: LIVE_MODEL,
    plan: publicPlan(plan),
    ticket: ticket || makeTicket(plan, apiKey),
    quota
  });
};

// --- Rencana tes ---------------------------------------------------------------

function pickPlan(mode, userId) {
  const p1 = shuffle(cards.part1.map((c) => c.id)).slice(0, 2);
  const p2 = mode === 'full' ? shuffle(cards.part2.map((c) => c.id))[0] : null;
  return { u: userId, t: Date.now(), k: 'exam', m: mode, p1, p2 };
}

function isPartner(plan) {
  return plan.k === 'partner';
}

function windowFor(plan) {
  return isPartner(plan) ? PARTNER_WINDOW_MS : TEST_WINDOW_MS;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resolvePlan(plan) {
  const part1 = plan.p1.map((id) => cards.part1.find((c) => c.id === id)).filter(Boolean);
  const part2 = plan.p2 ? cards.part2.find((c) => c.id === plan.p2) : null;
  const part3 = part2 && PART3_FOR[part2.id] ? cards.part3.find((c) => c.id === PART3_FOR[part2.id]) : null;
  return { part1, part2, part3 };
}

/** Yang boleh dilihat browser: topik untuk ditampilkan (cue card Part 2). */
function publicPlan(plan) {
  if (isPartner(plan)) {
    return { kind: 'partner', persona: plan.p, name: PARTNERS[plan.p].name, startedAt: plan.t };
  }
  const { part1, part2 } = resolvePlan(plan);
  return {
    kind: 'exam',
    mode: plan.m,
    startedAt: plan.t,
    part1: part1.map((c) => c.topic),
    part2: part2 ? { title: part2.title, bullets: part2.bullets } : null
  };
}

// --- Tiket sambung ulang (HMAC, tanpa database) ---------------------------------

function ticketKey(apiKey) {
  return crypto.createHash('sha256').update('ielts-live-ticket:' + apiKey).digest();
}

function makeTicket(plan, apiKey) {
  const body = Buffer.from(JSON.stringify(plan)).toString('base64url');
  const sig = crypto.createHmac('sha256', ticketKey(apiKey)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readTicket(ticket, userId, apiKey) {
  if (typeof ticket !== 'string' || ticket.length > 2000) return null;
  const [body, sig] = ticket.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', ticketKey(apiKey)).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const plan = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (plan.u !== userId || Date.now() - plan.t > windowFor(plan)) return null;
    if (isPartner(plan) && !Object.prototype.hasOwnProperty.call(PARTNERS, plan.p)) return null;
    return plan;
  } catch {
    return null;
  }
}

// --- Token Gemini Live ------------------------------------------------------------

async function mintToken(apiKey, plan) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const partner = isPartner(plan) ? PARTNERS[plan.p] : null;
  const setup = {
    model: `models/${LIVE_MODEL}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: partner ? partner.voice : LIVE_VOICE } } }
    },
    systemInstruction: { parts: [{ text: partner ? buildPartnerInstruction(partner) : buildInstruction(plan) }] },
    // Pelajar sering jeda saat berpikir; beri waktu sebelum giliran dianggap selesai.
    realtimeInputConfig: {
      automaticActivityDetection: { endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', silenceDurationMs: 1200 }
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {}
  };
  if (!partner) setup.tools = [{ functionDeclarations: buildTools(plan.m) }];
  const body = {
    uses: 1,
    expireTime: iso(Math.max(plan.t + windowFor(plan), now + 60 * 1000)),
    newSessionExpireTime: iso(now + 90 * 1000),
    bidiGenerateContentSetup: setup
  };

  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Gemini Live error ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  if (!data.name) throw new Error('Gemini Live tidak mengembalikan token.');
  return data.name;
}

function buildTools(mode) {
  const tools = [{ name: 'end_test', description: 'Call right after you have said the closing line of the test.' }];
  if (mode === 'full') {
    tools.unshift(
      { name: 'begin_part_two', description: 'Call right before you introduce the Part 2 topic, so the app can show the cue card.' },
      { name: 'begin_part_three', description: 'Call right before you start Part 3.' }
    );
  }
  return tools;
}

function buildInstruction(plan) {
  const { part1, part2, part3 } = resolvePlan(plan);
  const topicBlock = part1
    .map((c) => `  Topic "${c.topic}":\n${c.questions.map((q) => `  - ${q}`).join('\n')}`)
    .join('\n');

  const lines = [
    'You are Sarah, an IELTS Speaking examiner. You are running a realistic mock IELTS Speaking test for a candidate from Indonesia on a practice website.',
    '',
    'How to behave',
    '- Speak only English, with a clear British accent, at a calm and slightly slow pace.',
    '- Be polite and neutral, like a real examiner. Never teach, correct, praise, or evaluate the answers, and never mention band scores. Short acknowledgements such as "Thank you" or "Right" are fine.',
    '- Ask one question per turn and keep your turns short. Never answer for the candidate.',
    '- Ask each question only once. If an answer is off-topic, unclear, or very short, do NOT repeat or rephrase the question: say "Thank you" or "Right" and ask the next question. Repeat a question only if the candidate asks you to.',
    '- Now and then, after a short answer, you may ask one brief follow-up such as "Why is that?".',
    '- Only if the candidate actually speaks Indonesian or asks for help, say kindly that the test continues in English, then rephrase the question once.',
    '- If you heard nothing at all, say "Sorry, could you say that again?" once, then move on.',
    '- Text in square brackets comes from the test software, not from the candidate. Follow it and never read it aloud.',
    '',
    'The test',
    'Part 1, about 4 minutes:',
    '- Greet the candidate, say your name, and ask for their full name. Then ask what you should call them.',
    '- Then ask 3 or 4 questions on each of these topics, in this order. You may adapt the wording to what the candidate says:',
    topicBlock
  ];

  if (plan.m === 'short') {
    lines.push(
      '- When you have finished the questions, say "Thank you. That is the end of the speaking practice." and call end_test.'
    );
  } else {
    const theme = part3 ? part3.topic.toLowerCase() : part2.title.replace(/^Describe /i, '').toLowerCase();
    const p3Guide = part3
      ? `Use these as a guide and adapt them to what the candidate says:\n${part3.questions.map((q) => `  - ${q}`).join('\n')}`
      : `Make up your own questions on the broader theme of "${theme}".`;
    lines.push(
      '- When you have finished the Part 1 questions, go straight on to Part 2.',
      '',
      'Part 2, 3 to 4 minutes:',
      `- Call begin_part_two. Then say: "Now I'm going to give you a topic, and I'd like you to talk about it for one to two minutes. Before you talk, you'll have one minute to think about what you're going to say. You can make some notes if you wish. Your topic is: ${part2.title}." Then stop talking and wait.`,
      `  (The cue card on the candidate's screen says: ${part2.title}. You should say: ${part2.bullets.join('; ')}.)`,
      '- When you receive [Preparation time is over], say: "All right? Remember, you have one to two minutes for this, so don\'t worry if I stop you. I\'ll tell you when the time is up. Can you start speaking now, please?"',
      '- While the candidate is giving their talk, do not interrupt and do not ask anything. If they pause, stay silent or at most say "Mm-hmm".',
      '- When you receive [Two minutes are up], or the candidate clearly says they have finished, say "Thank you." and ask one short rounding-off question about their talk.',
      '',
      'Part 3, about 4 to 5 minutes:',
      `- After their answer, call begin_part_three. Then say: "We've been talking about ${theme}, and I'd like to discuss with you one or two more general questions related to this." Then ask 4 or 5 discussion questions, one at a time, that become more abstract. Follow up naturally, for example "Why do you think that is?".`,
      `  ${p3Guide}`,
      '- Then say "Thank you. That is the end of the speaking test." and call end_test.'
    );
  }

  lines.push(
    '',
    'Messages from the test software:',
    plan.m === 'full'
      ? '- [Part 1 time is up]: as soon as the candidate finishes their current answer, go straight to Part 2.'
      : '- [Part 1 time is up]: as soon as the candidate finishes their current answer, say the closing line and call end_test.',
    '- [Time is up. End the test now.]: say the closing line straight away and call end_test.'
  );
  return lines.join('\n');
}

function buildPartnerInstruction(p) {
  return [
    `You are ${p.name}, an English conversation partner on an IELTS practice website. The person you are talking to is a learner from Indonesia who is practising spoken English by voice.`,
    '',
    `Your personality: ${p.personality}`,
    '',
    'How to talk',
    '- Speak natural English at a clear, moderate pace. Keep your turns short (one to three sentences) so the learner talks more than you, and usually end with a question that keeps the conversation going.',
    '- Begin by greeting the learner in character, saying your name, and asking what they would like to talk about. If they have no idea, suggest an everyday topic or a common IELTS Speaking topic such as hometown, studies, hobbies, travel, food, or technology.',
    `- Mistakes: ${p.corrections}`,
    '- If the learner is stuck or speaks Indonesian, help briefly: give the English words or sentence they could use (you may explain with a few Indonesian words), then invite them to say it in English.',
    '- Stay kind and respectful. Never insult or embarrass the learner. Avoid politics, religion, and adult topics; steer back to everyday subjects.',
    '- Do not give IELTS band scores during the chat.',
    '- Text in square brackets comes from the app, not from the learner. Follow it and never read it aloud.'
  ].join('\n');
}

// Untuk uji lokal (scratchpad), tidak dipakai Vercel.
module.exports._internal = { pickPlan, publicPlan, buildInstruction, buildPartnerInstruction, makeTicket, readTicket, mintToken, PARTNERS };
