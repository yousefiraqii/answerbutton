require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs-extra');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const path = require('path');

const app = express();
app.set('trust proxy', 1);

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || __dirname;
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();
const REQUIRE_TOKEN_FOR_SOLVE = (process.env.REQUIRE_TOKEN_FOR_SOLVE || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(UPLOAD_DIR);

// ---- CORS ----
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes('*')) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  }
}));
app.use(express.json({ limit: '2mb' }));

// ---- Basic security headers (no extra dep) ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ---- Simple in-memory rate limit ----
const hits = new Map();
function rateLimit(maxPerMin) {
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
    arr.push(now);
    hits.set(ip, arr);
    if (arr.length > maxPerMin) {
      return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    }
    next();
  };
}

// ---- Settings ----
function defaultSettings() {
  return {
    providerBaseUrl: process.env.PROVIDER_BASE_URL || 'https://api.groq.com/openai/v1',
    apiKey: '',
    model: process.env.MODEL || 'openai/gpt-oss-20b',
    language: 'en',
    answerLength: 'medium',
    instructions: '',
    knowledgeBase: ''
  };
}

function loadSettings() {
  try {
    const file = fs.readJsonSync(SETTINGS_FILE);
    return { ...defaultSettings(), ...file };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(settings) {
  // لا تحفظ مفتاح الـ env في الملف أبداً
  const toSave = { ...settings };
  if (process.env.GROQ_API_KEY || process.env.API_KEY) {
    const current = loadSettings();
    toSave.apiKey = current.apiKey || '';
  }
  fs.writeJsonSync(SETTINGS_FILE, toSave, { spaces: 2 });
}

function getEffectiveApiKey(settings) {
  return (process.env.GROQ_API_KEY || process.env.API_KEY || settings.apiKey || '').trim();
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  if (token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
}

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'));
    }
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- Health (لازم لمنصات الديبلوي) ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), version: '1.0.0' });
});

app.post('/api/upload-pdf', requireAdmin, rateLimit(20), upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    const extractedText = (pdfData.text || '').slice(0, 200000); // سقف حماية
    const settings = loadSettings();
    settings.knowledgeBase = extractedText;
    saveSettings(settings);
    fs.unlink(req.file.path, () => {});
    res.json({ success: true, textLength: extractedText.length });
  } catch (error) {
    console.error('PDF Error:', error.message);
    res.status(500).json({ error: 'Failed to read PDF. Make sure it is a valid PDF under 15MB.' });
  }
});

// مسح الـ KB يدوياً فقط (بدل المسح التلقائي اللي كان عيب)
app.delete('/api/knowledge', requireAdmin, (req, res) => {
  const settings = loadSettings();
  settings.knowledgeBase = '';
  saveSettings(settings);
  res.json({ success: true });
});

app.get('/api/settings', requireAdmin, (req, res) => {
  const settings = loadSettings();
  res.json({
    providerBaseUrl: settings.providerBaseUrl,
    model: settings.model,
    language: settings.language,
    answerLength: settings.answerLength,
    instructions: settings.instructions,
    knowledgeBaseLength: (settings.knowledgeBase || '').length,
    knowledgeBase: settings.knowledgeBase || '',
    apiKeyConfigured: !!getEffectiveApiKey(settings),
    adminProtected: !!ADMIN_TOKEN
  });
});

app.put('/api/settings', requireAdmin, rateLimit(60), (req, res) => {
  const settings = loadSettings();
  const { providerBaseUrl, model, language, answerLength, instructions, apiKey } = req.body || {};
  if (providerBaseUrl !== undefined && typeof providerBaseUrl === 'string') {
    const url = providerBaseUrl.trim().replace(/\/$/, '');
    if (url && !/^https?:\/\/.+/.test(url)) {
      return res.status(400).json({ error: 'Invalid provider URL' });
    }
    settings.providerBaseUrl = url || settings.providerBaseUrl;
  }
  if (model !== undefined && typeof model === 'string') settings.model = model.trim().slice(0, 200) || settings.model;
  if (language !== undefined && ['ar', 'en'].includes(language)) settings.language = language;
  if (answerLength !== undefined && ['short', 'medium', 'detailed'].includes(answerLength)) settings.answerLength = answerLength;
  if (instructions !== undefined && typeof instructions === 'string') settings.instructions = instructions.slice(0, 10000);
  if (apiKey !== undefined && typeof apiKey === 'string' && apiKey.trim() !== '') {
    settings.apiKey = apiKey.trim().slice(0, 500);
  }
  saveSettings(settings);
  res.json({ success: true, apiKeyConfigured: !!getEffectiveApiKey(settings) });
});

function extractWordLimit(question) {
  const patterns = [
    /(\d+)\s*words?\s*(?:max|maximum|limit|not\s+exceed|don['']?t\s+exceed|under|below)/i,
    /(?:max|maximum|limit)\s*(?:of\s*)?(\d+)\s*words?/i,
    /under\s+(\d+)\s*words?/i,
    /less\s+than\s+(\d+)\s*words?/i,
    /(\d+)\s*word\s*limit/i
  ];
  for (const p of patterns) {
    const m = question.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function isConnectionsQuestion(question) {
  const keywords = ['connection', 'law', 'equation', 'formula', 'substitution', 'physics', 'force', 'energy', 'motion', 'newton', 'acceleration', 'velocity', 'mass', 'work', 'power', 'momentum', 'rotation', 'torque', 'resistance', 'current', 'voltage', 'capacitance', 'inductance', 'field', 'wave', 'frequency', 'wavelength', 'refraction', 'diffraction', 'interference', 'kinematics', 'dynamics', 'thermodynamics', 'entropy', 'enthalpy', 'pressure', 'volume', 'temperature', 'ohm', 'kirchhoff', 'coulomb', 'ampere', 'farad', 'henry', 'tesla', 'weber', 'joule', 'watt', 'pascal', 'newton', 'kinetic', 'potential'];
  const lowerQ = question.toLowerCase();
  return keywords.some(k => lowerQ.includes(k));
}

function buildSystemPrompt(settings, question) {
  const isConn = isConnectionsQuestion(question);
  const userWordLimit = extractWordLimit(question);

  let lengthInstruction = '';
  if (userWordLimit) {
    lengthInstruction = `HARD LIMIT: Maximum ${userWordLimit} words. Count every word. Do not exceed ${userWordLimit} words under any circumstance.`;
  } else {
    switch (settings.answerLength) {
      case 'short':
        lengthInstruction = 'Target: 50 words maximum. Short, punchy sentences.';
        break;
      case 'medium':
        lengthInstruction = 'Target: 150 words (±15). 3-4 short paragraphs.';
        break;
      case 'detailed':
        lengthInstruction = 'Target: 250 words (±15). 4-5 balanced paragraphs. Count words mentally. Do not exceed 270. Do not go below 230.';
        break;
      default:
        lengthInstruction = 'Target: 150 words (±15).';
    }
  }

  const knowledgeBase = settings.knowledgeBase || '';
  const hasKB = knowledgeBase.trim().length > 0;

  let kbInstruction = '';
  if (hasKB) {
    kbInstruction = `
KNOWLEDGE BASE (UPLOADED PDF) — PRIMARY AUTHORITY:
${knowledgeBase}

RULE: Every factual claim, law, equation, constant, or procedure MUST come from this knowledge base.
- If asked for a law/equation: quote it verbatim from the knowledge base.
- If knowledge base lacks the answer: say "Not covered in the provided material" — do NOT hallucinate.
- Do not supplement with outside knowledge. The knowledge base IS your universe.`;
  } else {
    kbInstruction = 'NO KNOWLEDGE BASE ATTACHED — Answer from your scientific expertise. Apply grader-expectation rules strictly.';
  }

  let connectionsInstruction = '';
  if (isConn) {
    connectionsInstruction = `
🔬 GRADER-EXPECTATION SCIENTIFIC MODE — ENFORCED:
Write exactly what a physics/engineering examiner awards full marks for:

STRUCTURE (non-negotiable):
1. STATE the governing law/principle by name
2. WRITE the equation in standard form with ALL variables defined
3. LIST given values with units (m = 5 kg, a = 2 m/s²)
4. SHOW substitution step: F = (5 kg)(2 m/s²)
5. CALCULATE with units carried through: F = 10 kg·m/s² = 10 N
6. STATE final answer clearly with units: "Force = 10 N"
7. LINK back to question: "This satisfies the requirement to calculate the net force..."

EQUATION RULES:
- Every symbol defined: F = force (N), m = mass (kg), a = acceleration (m/s²)
- SI units mandatory at each step
- No skipped algebra steps
- Constants from knowledge base if present; else CODATA values (g = 9.81 m/s², c = 3.00×10⁸ m/s, etc.)

GRAPH/DESCRIPTION QUESTIONS:
- Axes labels with units
- Key points: intercepts, maxima, minima, asymptotes
- Shape description: linear, parabolic, exponential, sinusoidal
- Physical meaning of slope/area under curve`;
  }

  const graderRules = `
GRADER-EXPECTATION WRITING STYLE (what earns full credit):

1. CLARITY OVER ELEGANCE:
   - Short declarative sentences. One idea per sentence.
   - Active voice: "The force accelerates the mass" not "The mass is accelerated by the force"
   - No hedging: "The result is 10 N" not "The result appears to be approximately 10 N"

2. MATHEMATICAL COMMUNICATION:
   - Equations on their own line conceptually (use line breaks in thought)
   - "Substituting the values:" then the equation with numbers
   - "Therefore" or "Hence" before final answer
   - Box or highlight the final answer conceptually

3. HUMAN TOUCH (anti-AI, pro-grader):
   - "We find..." "We get..." "This gives..." (collaborative voice)
   - One brief signpost: "Now substitute...", "Next, solve for...", "Finally..."
   - One analogy if it clarifies physics: "Like a bank account, energy deposits equal withdrawals"
   - Zero fluff transitions: no "furthermore", "moreover", "additionally"

4. WHAT GRADERS HATE (avoid entirely):
   - "In conclusion", "To sum up", "Overall"
   - "It is important to note that"
   - Vague words: "very", "really", "quite", "basically"
   - Passive filler: "The equation can be written as..."

5. WORD COUNT DISCIPLINE:
   - Every word earns its keep. If a sentence doesn't add physics/content, cut it.`;

  const customInstructions = (settings.instructions || '').trim();
  const customBlock = customInstructions ? `\n---\nCUSTOM USER INSTRUCTIONS (must follow unless conflicting with word limit):\n${customInstructions}\n` : '';

  return `You are a physics/engineering tutor writing model answers for examiners. Your output IS the mark scheme.

${kbInstruction}
${connectionsInstruction}

---
${graderRules}
${customBlock}

---
LENGTH COMMAND: ${lengthInstruction}
LANGUAGE: ${(settings.language === 'ar') ? 'Natural Arabic' : 'Natural, fluent English'} — precise, no fluff.

SELF-CHECK BEFORE OUTPUT:
□ Word count within target/limit?
□ Law stated by name? Equation written? Variables defined?
□ Given values listed with units?
□ Substitution shown step-by-step?
□ Units carried through to final answer?
□ Final answer clearly stated with units?
□ Linked back to what question asked?
□ Grader voice: "We find", "This gives", "Hence"?
□ Zero forbidden phrases?
□ One signpost phrase minimum?`;
}

app.post('/api/solve', rateLimit(30), async (req, res) => {
  if (REQUIRE_TOKEN_FOR_SOLVE && ADMIN_TOKEN) {
    const token = req.headers['x-admin-token'];
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { question } = req.body || {};
  if (!question || typeof question !== 'string' || question.trim().length < 2) {
    return res.status(400).json({ error: 'Question too short' });
  }
  if (question.length > 5000) {
    return res.status(400).json({ error: 'Question too long (max 5000 chars)' });
  }

  const settings = loadSettings();
  const apiKey = getEffectiveApiKey(settings);
  if (!apiKey) {
    return res.status(403).json({ error: 'API key not configured. Set GROQ_API_KEY env var or set it in settings.' });
  }

  const systemPrompt = buildSystemPrompt(settings, question);
  const hasKB = (settings.knowledgeBase || '').trim().length > 0;
  const isConn = isConnectionsQuestion(question);
  const wordLimit = extractWordLimit(question);

  const forceNote = `
FINAL ENFORCEMENT:
- ${wordLimit ? `HARD WORD LIMIT: ${wordLimit} words MAX` : `Length target: ${settings.answerLength === 'detailed' ? '250 words (±15)' : settings.answerLength === 'medium' ? '150 words (±15)' : '50 words max'}`}
- ${hasKB ? 'Knowledge base is LAW — no outside facts' : 'No knowledge base — use scientific expertise'}
- ${isConn ? 'Full grader-mode: Law → Equation → Given → Substitute → Calculate → Answer with units → Link to question' : 'Clear, direct, human scientific voice'}
- Output ONLY the answer. No intro. No outro. No meta-commentary.`;

  try {
    const groqUrl = `${settings.providerBaseUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await axios.post(
      groqUrl,
      {
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Question: ${question}${forceNote}` }
        ],
        temperature: 0.55,
        max_tokens: 2048,
        top_p: 0.8,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 60000
      }
    );

    const answer = response.data.choices?.[0]?.message?.content?.trim() || 'No answer generated.';
    res.json({ answer });

  } catch (error) {
    const status = error.response?.status;
    const providerMsg = error.response?.data?.error?.message || error.message;
    console.error('Provider Error:', status, providerMsg);
    if (status === 401) return res.status(500).json({ error: 'Generation failed: invalid API key' });
    if (status === 429) return res.status(500).json({ error: 'Generation failed: rate limited by provider, try again shortly' });
    res.status(500).json({ error: `Generation failed: ${providerMsg}`.slice(0, 500) });
  }
});

// Multer/file errors → JSON
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err) {
    console.error('Request error:', err.message);
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`📄 Settings: http://localhost:${PORT}/settings.html`);
  console.log(`🔑 API key: ${(process.env.GROQ_API_KEY || process.env.API_KEY) ? 'from ENV ✔' : 'from settings file (or missing)'}`);
  console.log(`🔒 Admin token: ${ADMIN_TOKEN ? 'enabled ✔' : 'disabled (set ADMIN_TOKEN to protect settings)'}`);
  console.log(`💾 Data dir: ${DATA_DIR}`);
});
