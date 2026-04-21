/**
 * เรียก Ollama สร้างชุดโจทย์ TOEIC Reading — เฉพาะ Part 5 (Incomplete Sentences) แล้วบันทึกเป็น JSON
 *
 * ใช้งาน:
 *   node scripts/generate-set.mjs
 *   node scripts/generate-set.mjs --size=medium
 *   node scripts/generate-set.mjs --size=exam
 *   node scripts/generate-set.mjs --out=data/my-set.json
 *
 * --size=small | medium | exam
 *   small  = 5 ข้อ (ครั้งเดียว)
 *   medium = 15 ข้อ (ครั้งเดียว)
 *   exam   = 30 ข้อ (หลายรอบ — ค่าเริ่มต้น 1 ข้อ/รอบ + format=json ลด JSON พัง)
 *
 * --context-file=path   (ทางเลือก) ไฟล์ข้อความอ้างอิง
 *
 * ต้องมี Ollama รันที่ OLLAMA_HOST (ค่าเริ่มต้น http://127.0.0.1:11434)
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3:latest";

/** Part 5 ในข้อสอบจริง = 30 ข้อ */
const EXAM_PART5_TOTAL = 30;

/**
 * จำนวนข้อต่อ 1 ครั้งเรียก Ollama ในโหมด exam — ถ้ามากเกินไป JSON ยาวมาก
 * (analysisSteps × 5 ยาว) จะถูกตัดกลางคันจน parse ไม่ได้
 */
/**
 * ข้อต่อ 1 ครั้งในโหมด exam — ค่าเริ่มต้น 1 (JSON สั้น ลดโอกาสตัด/พัง)
 * ตั้งได้: $env:EXAM_ITEMS_PER_BATCH=2 (PowerShell) หรือ EXAM_ITEMS_PER_BATCH=2
 */
const EXAM_ITEMS_PER_BATCH = (() => {
  const e = Number(process.env.EXAM_ITEMS_PER_BATCH);
  if (Number.isFinite(e) && e >= 1 && e <= 10) return Math.floor(e);
  return 1;
})();

/** โทเค็นออกสูงสุดต่อ batch (Ollama options.num_predict) */
const EXAM_NUM_PREDICT = 32768;

/** context window — ให้พอสำหรับ prompt + JSON ยาว */
const EXAM_NUM_CTX = 32768;

/** ถ้า JSON parse ล้ม / จำนวนข้อไม่ครบ ให้ลองใหม่ก่อนยกเลิกทั้งรอบ */
const EXAM_BATCH_MAX_ATTEMPTS = 3;

function arg(name, fallback = null) {
  const p = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!p) return fallback;
  if (p.includes("=")) return p.split("=").slice(1).join("=");
  const i = process.argv.indexOf(p);
  return process.argv[i + 1] ?? fallback;
}

const model = arg("--model") || DEFAULT_MODEL;
const size = (arg("--size") || "small").toLowerCase();

let outPath = arg("--out");
if (!outPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  outPath = `data/generated-${stamp}.json`;
}
outPath = resolve(ROOT, outPath);

const CONTEXT_MAX_CHARS = 14_000;
const CONTEXT_PER_CHUNK_MAX = 4_000;

/** โปรไฟล์ — เฉพาะจำนวนข้อ Part 5 */
const SIZES = {
  small: { p5: 5, label: "small (5 ข้อ)" },
  medium: { p5: 15, label: "medium (15 ข้อ)" },
};

const isExam = size === "exam";
const profile = isExam ? null : SIZES[size] || SIZES.small;
if (!isExam && !SIZES[size]) {
  console.error(`Unknown --size=${size}, using small`);
}

const WRITER_ROLE = `You are an expert TOEIC test item writer. Produce realistic Part 5 (Incomplete Sentences) items only. Original content — do not copy from official past papers. Use professional business English.

Contexts to draw from (vary across items): contract negotiations, corporate restructuring, shipment delays, employee performance reviews, quarterly results, compliance, procurement, R&D handoffs, client onboarding, budget approvals, logistics, HR policies.`;

const SYSTEM_PROMPT = `${WRITER_ROLE}

OUTPUT: Reply with ONLY one JSON object. No markdown code fences. No text before or after.

JSON shape:
{
  "meta": { "id", "title", "createdAt" (ISO-8601 UTC), "version": 1, "notes" (optional) },
  "items": [ ... ]
}

Every element of "items" MUST be Part 5: { "id", "part": 5, "prompt", "options": [4 strings], "correctIndex": 0-3, "explanation", "focus", "tags": [] }.
- "focus" (required): short label such as "Grammar - Word Form", "Grammar - Tense", "Grammar - Connector", "Vocabulary - business context".
- "tags": optional array e.g. ["grammar","word-form"] or ["vocab","collocation"].
- "analysisSteps" (REQUIRED): array of exactly 5 strings in English. Each string must be **concrete and item-specific** — not generic exam advice.

  BANNED unless followed immediately by THIS item's words: vague filler like "consider the context", "read carefully", "think about grammar", "choose the best option", "in general", "generally speaking", "it is important to", "business English often", "many sentences".

  Every analysisSteps line must be unusable as a generic textbook paragraph — if you could paste the same line onto a different Part 5 question without changing it, rewrite it.

  REQUIRED (every item):
  - Each step should be at least ~35 words (step 1 can be ~25 if it is a precise label + one concrete clause).
  - Step 2 MUST include a **quoted phrase copied from THIS item's prompt** (inside "double quotes") — words that actually appear in "prompt" (not a paraphrase).
  - Step 3 MUST give **one "trap" or pitfall specific to THIS item** — e.g. why a strong test-taker might pick a particular wrong option here (name that option by letter and quote a few words from it).
  - Step 4 MUST name **at least two wrong options by letter (A/B/C/D)** (not the correct letter) and give a **different** reason each, quoting fragments of the wrong option text.
  - Step 5 MUST include the **exact string of the correct option** from the "options" array in quotes, then contrast with the closest distractor using exact words from both strings.

  Strict order:
  1) What the item tests — skill (match "focus") + one detail tied to THIS sentence (quote a few words from "prompt" near ------- if helpful).
  2) Signal / keywords — quoted phrase FROM "prompt" + what it forces.
  3) Item-specific trap — wrong answer that looks tempting here and why.
  4) Wrong options — ≥2 incorrect letters with reasons tied to option wording.
  5) Correct option — exact correct wording + contrast with one wrong option's wording.

Do NOT output Part 6 or Part 7.

Mechanical rules:
- One sentence per item; exactly one blank as "-------" (seven hyphens). Never put A/B/C/D in the prompt.
- "options": exactly 4 strings; "correctIndex" 0–3 points to the correct option.

Distribution (the user message will give exact counts):
- Grammar items: word forms (noun/verb/adj/adv variants), verb tenses and aspects, connectors/subordinators — spread these types across grammar slots.
- Vocabulary items: context-based business terms (collocation, phrasal verbs, or word choice in office settings), NOT pure rare trivia.

Word Form rule (when focus is Grammar - Word Form):
- All four options MUST share the SAME English root word family (e.g. produce, production, productive, productively OR comprehensive, comprehensively, comprehend, comprehension). Same lemma family; distractors differ by part of speech or form.

Grammar items that are NOT Word Form: still use plausible distractors (wrong tense, wrong connector, etc.).

Vocabulary items: options are distinct business-appropriate words/phrases; distractors are plausible in register but wrong in meaning or collocation.`;

const SYSTEM_PROMPT_ITEMS_ONLY = `${SYSTEM_PROMPT}

For THIS request only: return JSON with shape { "items": [ ... ] } only — no "meta" field. Every item must have "part": 5 and "focus".`;

const SYSTEM_PROMPT_REFERENCE = `

When the user message includes "REFERENCE MATERIAL", keep names/dates/facts consistent if an item relates to that content; otherwise use generic office English.`;

/** สัดส่วน 3 Grammar : 2 Vocabulary (ตามแนว 5 ข้อ = 3+2) */
function splitGrammarVocab(total) {
  const grammar = Math.round((total * 3) / 5);
  const vocab = total - grammar;
  return { grammar, vocab };
}

function buildDistributionText(total) {
  const { grammar, vocab } = splitGrammarVocab(total);
  let grammarSubtype = "";
  if (grammar >= 3) {
    grammarSubtype = `Among the ${grammar} grammar items, include at least ONE of each where possible:
  • "Grammar - Word Form" — all four options share the same root/lemma family (different parts of speech or derivatives only).
  • "Grammar - Tense" (or aspect / voice).
  • "Grammar - Connector" (conjunction, subordinator, transition).
If grammar count is larger, you may add more of these types or related grammar points.`;
  } else {
    grammarSubtype = `Use varied grammar types (word form, tense, connector) within these ${grammar} items.`;
  }
  return `DISTRIBUTION (strict counts):
- ${grammar} items with focus starting with "Grammar -" …
- ${vocab} items with focus "Vocabulary - business context" (or similar: collocation / phrasal verb in workplace context).

${grammarSubtype}

Vocabulary items: test meaning or collocation in context; distractors must be plausible business English, not random rare words.`;
}

function buildUserPrompt({ useReference } = {}) {
  const { p5, label } = profile;

  return `Generate ONE JSON practice file — Part 5 ONLY (size: ${label}).

${buildDistributionText(p5)}

Requirements:
- "items" must contain exactly ${p5} objects. Each has "part": 5, "prompt" (with -------), "options" (4), "correctIndex", "explanation", "focus", and "analysisSteps" (exactly 5 English strings: concrete, not vague — see system prompt).
- IDs: p5-001 … p5-${String(p5).padStart(3, "0")}.

meta.title: e.g. "Part 5 — grammar & vocabulary mix"
meta.notes: one line: ${
    useReference
      ? '"AI-generated; verify answers. Based on reference if used."'
      : '"AI-generated Part 5; verify answers before study."'
  }
meta.createdAt: UTC ISO string.
meta.id: unique like "set-p5-" + random suffix.

Verify: Word Form items have four options from the same word family; every correctIndex is defensible in context.`;
}

async function loadContextFile(relOrAbs) {
  const path = resolve(ROOT, relOrAbs);
  let text = await readFile(path, "utf8");
  text = text.trim();
  if (text.length > CONTEXT_MAX_CHARS) {
    console.error(
      `Warning: context file truncated from ${text.length} to ${CONTEXT_MAX_CHARS} characters`
    );
    text = text.slice(0, CONTEXT_MAX_CHARS);
  }
  return { path, text };
}

function contextPrefix(text, max = CONTEXT_PER_CHUNK_MAX) {
  if (!text) return "";
  const t = text.length > max ? text.slice(0, max) + "\n[…truncated…]" : text;
  return `REFERENCE MATERIAL (use when relevant; do not contradict):\n---\n${t}\n---\n\n`;
}

function extractJson(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/** ปฏิเสธ analysisSteps แบบกว้างๆ ที่ไม่อ้างถึงโจทย์/ตัวเลือกจริง */
const ANALYSIS_BANNED_PHRASES = [
  /consider\s+the\s+context/i,
  /read\s+carefully/i,
  /think\s+carefully/i,
  /choose\s+the\s+best/i,
  /\bin\s+general\b/i,
  /generally\s+speaking/i,
  /\bit\s+is\s+important\s+to\b/i,
  /\bmany\s+sentences\b/i,
  /\bbusiness\s+english\s+often\b/i,
];

const ANALYSIS_STOPWORDS = new Set(
  "that this with from have will been were they their there which when what your about into than then some such only just also very each other the and for are was but not you all can her one our out day get has him his how its may new now old see two way who boy did let put say she too use".split(
    /\s+/
  )
);

function significantTokensFromPart5Item(it) {
  const prompt = String(it.prompt || "").replace(/-------/g, " ");
  const optStr = (it.options || []).join(" ");
  const raw = `${prompt} ${optStr}`.toLowerCase();
  const tokens = raw
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 4 && !ANALYSIS_STOPWORDS.has(w));
  return [...new Set(tokens)];
}

function assertAnalysisStepsAnchoredToItem(it) {
  const ast = it.analysisSteps;
  if (!Array.isArray(ast) || ast.length !== 5) return;

  for (let i = 0; i < ast.length; i++) {
    const s = String(ast[i] ?? "");
    for (const re of ANALYSIS_BANNED_PHRASES) {
      if (re.test(s)) {
        throw new Error(
          `Part 5 ${it.id}: analysisSteps[${i}] has banned generic phrasing — use words from THIS prompt/options only`
        );
      }
    }
  }

  const tokens = significantTokensFromPart5Item(it);
  if (tokens.length >= 2) {
    let overlap = 0;
    for (const step of ast) {
      const low = step.toLowerCase();
      if (tokens.some((t) => low.includes(t))) overlap++;
    }
    // At least 3/5 steps must echo a significant token (models often paraphrase 1–2 steps; 4/5 was too brittle).
    const need = 3;
    if (overlap < need) {
      throw new Error(
        `Part 5 ${it.id}: analysisSteps must use words from THIS prompt/options in at least ${need} of 5 steps (got ${overlap}) — too generic`
      );
    }
  }

  if (!/["']/.test(String(ast[1] ?? ""))) {
    throw new Error(
      `Part 5 ${it.id}: analysisSteps[1] must include a quoted phrase from the prompt`
    );
  }

  const correctLetter = ["A", "B", "C", "D"][it.correctIndex];
  const wrongLetters = new Set(
    ["A", "B", "C", "D"].filter((L) => L !== correctLetter)
  );
  const step4 = String(ast[3] ?? "");
  const mentioned = [...step4.matchAll(/\b([ABCD])\b/g)].map((m) => m[1]);
  const wrongNamed = [...new Set(mentioned.filter((L) => wrongLetters.has(L)))];
  if (wrongNamed.length < 2) {
    throw new Error(
      `Part 5 ${it.id}: analysisSteps[3] must name at least two wrong options (letters ${[...wrongLetters].join("/")}), not only "${correctLetter}"`
    );
  }

  const correctOpt = String(it.options[it.correctIndex] ?? "").toLowerCase().trim();
  const step5 = String(ast[4] ?? "").toLowerCase();
  if (correctOpt.length >= 3) {
    const hasSubstring =
      correctOpt.length >= 5 && step5.includes(correctOpt.slice(0, 15));
    const words = correctOpt.split(/\s+/).filter((w) => w.length >= 3);
    const hasWord = words.some((w) => step5.includes(w));
    if (!hasSubstring && !hasWord) {
      throw new Error(
        `Part 5 ${it.id}: analysisSteps[4] must quote or repeat the correct option text from this item`
      );
    }
  }
}

export function validateBank(data) {
  if (!data || typeof data !== "object") throw new Error("Not an object");
  if (!data.meta || typeof data.meta.id !== "string")
    throw new Error("Missing meta.id");
  if (!Array.isArray(data.items) || data.items.length === 0)
    throw new Error("items must be a non-empty array");
  for (const it of data.items) {
    if (![5, 6, 7].includes(it.part)) throw new Error(`Invalid part: ${it.part}`);
    if (it.part === 5) {
      if (!Array.isArray(it.options) || it.options.length !== 4)
        throw new Error(`Part 5 ${it.id}: need 4 options`);
      if (!String(it.prompt || "").includes("-------"))
        throw new Error(`Part 5 ${it.id}: prompt must contain -------`);
      if (!String(it.focus || "").trim())
        throw new Error(`Part 5 ${it.id}: missing "focus"`);
      const ast = it.analysisSteps;
      if (!Array.isArray(ast) || ast.length !== 5) {
        throw new Error(
          `Part 5 ${it.id}: "analysisSteps" must be an array of exactly 5 non-empty strings`
        );
      }
      for (let i = 0; i < ast.length; i++) {
        const s = String(ast[i] ?? "").trim();
        if (!s) {
          throw new Error(`Part 5 ${it.id}: analysisSteps[${i}] is empty`);
        }
        if (s.length < 28) {
          throw new Error(
            `Part 5 ${it.id}: analysisSteps[${i}] is too short (${s.length} chars) — write specific analysis, not vague hints (min ~28 characters)`
          );
        }
      }
      assertAnalysisStepsAnchoredToItem(it);
    }
    if (it.part === 6) {
      if (!Array.isArray(it.blanks) || it.blanks.length < 1)
        throw new Error(`Part 6 ${it.id}: need blanks`);
    }
    if (it.part === 7) {
      if (!Array.isArray(it.questions) || it.questions.length < 1)
        throw new Error(`Part 7 ${it.id}: need questions`);
    }
  }
}

function assertAllPart5(data, label) {
  for (const it of data.items) {
    if (it.part !== 5) {
      throw new Error(
        `${label}: expected only Part 5 items, found part ${it.part} (${it.id})`
      );
    }
  }
}

function validateExamPart5Shape(items) {
  if (items.length !== EXAM_PART5_TOTAL) {
    throw new Error(
      `Exam Part 5: expected ${EXAM_PART5_TOTAL} items, got ${items.length}`
    );
  }
  for (const it of items) {
    if (it.part !== 5) {
      throw new Error(`Exam Part 5: expected part 5, got ${it.part} (${it.id})`);
    }
  }
}

/**
 * @param {object} [chatOpts]
 * @param {boolean} [chatOpts.formatJson] — ใช้กับ Ollama เพื่อบังคับ JSON ที่ parse ได้ (แนะนำในโหมด exam)
 * @param {number} [chatOpts.numCtx] — ขนาด context (default 8192)
 */
async function ollamaChat(system, user, numPredict = 8192, chatOpts = {}) {
  const { formatJson = false, numCtx = 8192 } = chatOpts;
  const url = `${OLLAMA_HOST.replace(/\/$/, "")}/api/chat`;
  const requestBody = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
    options: {
      temperature: 0.28,
      num_predict: numPredict,
      num_ctx: numCtx,
    },
  };
  if (formatJson) {
    requestBody.format = "json";
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const resBody = await res.json();
  const text =
    resBody.message?.content ??
    resBody.response ??
    (typeof resBody === "string" ? resBody : "");
  if (!text) throw new Error("Empty response from Ollama");
  return text;
}

function parseItemsJson(raw, label) {
  let data;
  try {
    data = JSON.parse(extractJson(raw));
  } catch (e) {
    console.error(`--- Raw (${label}, first 2500 chars) ---\n`, raw.slice(0, 2500));
    console.error(
      `--- Raw (${label}, last 600 chars, total ${raw.length}) ---\n`,
      raw.slice(-600)
    );
    throw new Error(`${label}: JSON parse failed: ${e.message}`);
  }
  if (!data.items || !Array.isArray(data.items)) {
    throw new Error(`${label}: missing items array`);
  }
  return data.items;
}

async function generateExamMode(contextText) {
  const ctx = contextText ? contextPrefix(contextText) : "";
  const systemItems = contextText
    ? SYSTEM_PROMPT_ITEMS_ONLY + SYSTEM_PROMPT_REFERENCE
    : SYSTEM_PROMPT_ITEMS_ONLY;
  const items = [];
  const batchLabel = "[exam]";

  /** Part 5: หลาย batch × EXAM_ITEMS_PER_BATCH ข้อ (รวม 30) */
  const p5chunks = [];
  for (let start = 1; start <= EXAM_PART5_TOTAL; start += EXAM_ITEMS_PER_BATCH) {
    const n = Math.min(EXAM_ITEMS_PER_BATCH, EXAM_PART5_TOTAL - start + 1);
    p5chunks.push({ start, n });
  }
  for (let b = 0; b < p5chunks.length; b++) {
    const { start, n } = p5chunks[b];
    const end = start + n - 1;
    console.error(
      `${batchLabel} Part 5 batch ${b + 1}/${p5chunks.length} (items ${start}–${end})…`
    );
    const { grammar: gBatch, vocab: vBatch } = splitGrammarVocab(n);
    const user = `${ctx}Return ONLY valid JSON: { "items": [ ... ] }
The "items" array must contain exactly ${n} objects, each with "part": 5.

Batch distribution (${n} items): exactly ${gBatch} items with "focus" starting with "Grammar -", exactly ${vBatch} items with "focus" for vocabulary (e.g. "Vocabulary - business context"). Among grammar items, include Word Form (same root in all 4 options), Tense, and Connector where possible.

Each item: "prompt" with "-------", "options" (4 strings), "correctIndex", "explanation", "focus" (required), "analysisSteps", optional "tags".

CRITICAL — "analysisSteps" shape (must be valid JSON):
- MUST be an array of exactly 5 separate strings: "analysisSteps": ["step1...", "step2...", "step3...", "step4...", "step5..."]
- Do NOT put all five steps inside one string or one array element.
- Inside each of those 5 strings: do NOT use the double-quote character ("). Use single quotes 'like this' for any quoted words. Unescaped " breaks JSON.
- Keep each of the 5 strings concise (under ~280 characters each).

Other analysisSteps content rules: item-specific; step 2 quotes a phrase from the prompt; step 4 names wrong options A–D; see system prompt.
Lexical tie-in: in at least three steps, use an exact word (4+ letters) from THIS item's prompt or options — not only synonyms — so each line clearly refers to this question.

IDs exactly p5-${String(start).padStart(3, "0")} through p5-${String(end).padStart(3, "0")} in order.
Root object must only have key "items". The entire reply must be one valid JSON object only.`;

    let chunk;
    let lastBatchErr;
    for (let attempt = 1; attempt <= EXAM_BATCH_MAX_ATTEMPTS; attempt++) {
      try {
        const raw = await ollamaChat(systemItems, user, EXAM_NUM_PREDICT, {
          formatJson: true,
          numCtx: EXAM_NUM_CTX,
        });
        chunk = parseItemsJson(raw, `Part5 batch ${b + 1}`);
        if (chunk.length !== n) {
          throw new Error(`expected ${n} items, got ${chunk.length}`);
        }
        lastBatchErr = null;
        break;
      } catch (err) {
        lastBatchErr = err;
        console.error(
          `[exam] batch ${b + 1} attempt ${attempt}/${EXAM_BATCH_MAX_ATTEMPTS}: ${err.message}`
        );
        if (attempt === EXAM_BATCH_MAX_ATTEMPTS) {
          throw err;
        }
        console.error(`[exam] retrying batch ${b + 1}…`);
      }
    }
    if (!chunk) throw lastBatchErr ?? new Error(`Part 5 batch ${b + 1}: no chunk`);
    for (const it of chunk) {
      if (it.part !== 5) throw new Error(`Part 5 batch ${b + 1}: expected part 5, got ${it.part}`);
      if (!String(it.prompt || "").includes("-------"))
        throw new Error(`Part 5 ${it.id}: missing -------`);
      if (!String(it.focus || "").trim())
        throw new Error(`Part 5 ${it.id}: missing "focus" field`);
    }
    items.push(...chunk);
  }

  validateExamPart5Shape(items);

  const examId = `exam-p5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    meta: {
      id: examId,
      title: "TOEIC Part 5 — full section (30 items)",
      createdAt: new Date().toISOString(),
      version: 1,
      notes:
        "AI-generated Part 5×30 (exam-style count). Verify answers; quality varies by model.",
    },
    items,
  };
}

async function main() {
  const contextArg = arg("--context-file") || arg("--context");
  let contextText = "";
  if (contextArg) {
    const { path, text } = await loadContextFile(contextArg);
    console.error(`Context file: ${path}`);
    contextText = text;
  }

  if (isExam) {
    console.error(`Ollama: ${OLLAMA_HOST}`);
    console.error(`Model: ${model}`);
    console.error(
      `Size: exam — Part 5 only, 30 items (${Math.ceil(
        EXAM_PART5_TOTAL / EXAM_ITEMS_PER_BATCH
      )} API calls × up to ${EXAM_ITEMS_PER_BATCH} questions). Same count as real TOEIC Part 5.`
    );
    console.error("Do not interrupt.\n");
    console.error(
      `Exam: ${EXAM_ITEMS_PER_BATCH} item(s) per API call, format=json, num_ctx=${EXAM_NUM_CTX} (set EXAM_ITEMS_PER_BATCH=2–5 to speed up if stable).\n`
    );

    const data = await generateExamMode(contextArg ? contextText : "");
    validateBank(data);
    assertAllPart5(data, "exam output");

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(data, null, 2), "utf8");

    console.error(`Saved: ${outPath}`);
    console.error(`meta.id: ${data.meta.id}`);
    console.error(`Part 5 items: ${data.items.length} (target ${EXAM_PART5_TOTAL})`);
    return;
  }

  let userMessage = buildUserPrompt({ useReference: Boolean(contextArg) });
  let systemMessage = SYSTEM_PROMPT;

  if (contextArg) {
    systemMessage = SYSTEM_PROMPT + SYSTEM_PROMPT_REFERENCE;
    userMessage =
      `The following REFERENCE MATERIAL was user-provided. Use it when helpful for Part 5 vocabulary or context; do not contradict facts.\n\nREFERENCE MATERIAL:\n---\n${contextText}\n---\n\n` +
      userMessage;
  }

  const numPredict = profile.p5 >= 15 ? 16384 : 8192;

  console.error(`Ollama: ${OLLAMA_HOST}`);
  console.error(`Model: ${model}`);
  console.error(`Size: ${size} — Part 5 × ${profile.p5} items only`);
  console.error("Generating… (may take a few minutes on first run)");

  const raw = await ollamaChat(systemMessage, userMessage, numPredict);
  let data;
  try {
    data = JSON.parse(extractJson(raw));
  } catch (e) {
    console.error("--- Raw response (first 2000 chars) ---\n", raw.slice(0, 2000));
    throw new Error(`JSON parse failed: ${e.message}`);
  }

  validateBank(data);
  assertAllPart5(data, "generated bank");
  if (data.items.length !== profile.p5) {
    throw new Error(
      `Expected exactly ${profile.p5} Part 5 items, got ${data.items.length}`
    );
  }
  if (!data.meta.version) data.meta.version = 1;

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(data, null, 2), "utf8");

  console.error(`Saved: ${outPath}`);
  console.error(`Items: ${data.items.length} · id: ${data.meta.id}`);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
