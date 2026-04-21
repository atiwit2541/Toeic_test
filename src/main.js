import "./styles.css";
import {
  authGateRequired,
  isLoggedIn,
  markLoggedIn,
  logout,
} from "./auth.js";
import { loadAttempts, saveAttempt, clearAllAttempts } from "./stats.js";

const bankModules = import.meta.glob("../data/*.json", { eager: true });

function getBankList() {
  return Object.entries(bankModules)
    .map(([path, mod]) => ({
      file: path.replace(/^.*\//, ""),
      data: mod.default ?? mod,
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/** Part 6–7 ปิดชั่วคราว — โฟกัสพัฒนา Part 5 ให้สมจริงก่อน */
const ACTIVE_PARTS = [5];

const LABELS = ["A", "B", "C", "D"];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flattenItems(items, partsFilter) {
  const set = new Set(partsFilter);
  const out = [];

  for (const item of items) {
    if (!set.has(item.part)) continue;

    if (item.part === 5) {
      out.push({
        kind: "p5",
        key: item.id,
        part: 5,
        item,
      });
    } else if (item.part === 6) {
      item.blanks.forEach((blank, i) => {
        out.push({
          kind: "p6",
          key: `${item.id}-b${blank.blankNumber}`,
          part: 6,
          item,
          blankIndex: i,
        });
      });
    } else if (item.part === 7) {
      item.questions.forEach((q, i) => {
        out.push({
          kind: "p7",
          key: q.id,
          part: 7,
          item,
          questionIndex: i,
        });
      });
    }
  }
  return out;
}

function getCorrectIndex(slide) {
  if (slide.kind === "p5") return slide.item.correctIndex;
  if (slide.kind === "p6")
    return slide.item.blanks[slide.blankIndex].correctIndex;
  if (slide.kind === "p7")
    return slide.item.questions[slide.questionIndex].correctIndex;
  return 0;
}

function getOptions(slide) {
  if (slide.kind === "p5") return slide.item.options;
  if (slide.kind === "p6")
    return slide.item.blanks[slide.blankIndex].options;
  if (slide.kind === "p7")
    return slide.item.questions[slide.questionIndex].options;
  return [];
}

function getExplanation(slide) {
  if (slide.kind === "p5") return slide.item.explanation;
  if (slide.kind === "p6")
    return slide.item.blanks[slide.blankIndex].explanation;
  if (slide.kind === "p7")
    return slide.item.questions[slide.questionIndex].explanation;
  return "";
}

/** ขั้นตอนจาก JSON (Part 5) หรือ null ถ้าไม่มี */
function getAnalysisStepsFromItem(slide) {
  if (slide.kind !== "p5" || !Array.isArray(slide.item.analysisSteps))
    return null;
  const s = slide.item.analysisSteps
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean);
  return s.length ? s : null;
}

/** แยกข้อความยาวเป็นหลายขั้น (ใช้กับ explanation เมื่อยังไม่มี analysisSteps) */
function splitExplanationIntoSteps(text) {
  if (!text || !String(text).trim()) return [];
  const t = String(text).trim();
  if (t.includes("\n")) {
    return t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  const parts = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

/** ตรวจจับวลี signal ใน prompt Part 5 — ข้อความละเอียดกว่าเดิม (fallback เมื่อไม่มี analysisSteps) */
function inferSignalHintFromPrompt(slide) {
  if (slide.kind !== "p5" || !slide.item.prompt) return null;
  const p = String(slide.item.prompt);
  if (/\bby\s+the\s+time\b/i.test(p)) {
    return 'วลี "By the time" นำประโยคย่อย (clause) ที่บอกเหตุการณ์แรก ไปเทียบกับประโยคหลักที่บอกเหตุการณ์หลัง — มักต้องเลือกกาลให้ “เหตุการณ์แรกเสร็จ/เกิดครบ” ก่อนเวลาอ้างอิงของเหตุการณ์หลัง (เช่นหลักใช้ will / will be + V3 ฝั่งหลัง ฝั่งย่อยจึงมักเป็น present perfect ไม่ใช่แค่ past หรือ future ล้วนๆ ถ้าไม่สอดคล้องลำดับเวลา)';
  }
  if (/\bdue\s+to\b/i.test(p)) {
    return 'วลี "due to" ทำหน้าที่เหมือนคำบ่งชี้ (คล้าย preposition) — หลังช่องว่างต้องเป็นคำนาม กลุ่มคำนาม หรือ gerund (เช่น rising / a rise) ไม่ใช่กริยารูป bare infinitive หรือรูปที่ไม่ทำหน้าที่เป็นคำนามในช่องนั้น';
  }
  if (/\bso\s+that\b/i.test(p)) {
    return '"So that" แนะนำวัตถุประสงค์หรือผลที่ต้องการ — ช่องว่างมักต้องเป็นรูปที่ทำหน้าที่ตามบทบาทในโครงสร้างประโยคหลัง (กาล หรือรูปกริยาให้สอดคล้องกับประธานและความหมาย “เพื่อให้…”)';
  }
  if (/\bunless\b/i.test(p)) {
    return '"Unless" = if … not — ประโยคหลัง unless เป็นเงื่อนไข; ช่องว่างต้องเลือกกาล/รูปที่สอดคล้องกับความเป็นจริงของเงื่อนไขและประโยคหลัก ไม่ใช่เลือกกาลที่ขัดกับโครงสร้าง if/unless';
  }
  if (/\bin\s+order\s+to\b/i.test(p)) {
    return '"In order to" ตามด้วย infinitive (to + V1) เพื่อบอกจุดประสงค์ — ถ้าช่องอยู่หลังวลีนี้มักต้องเป็นกริยารูป base หรือรูปที่โครงสร้างกำหนด ไม่สับสนกับ -ing ถ้าโครงสร้างไม่ใช่กริยาหลัง to';
  }
  if (/\b(if|when|before|after|until|since)\b/i.test(p)) {
    return "คำเชื่อม/คำบอกเวลา (if, when, before, after, until, since) กำหนดความสัมพันธ์ของกาลระหว่างประโยค — ให้จับคู่ tense/aspect ของข้อความในช่องว่างกับอีกข้อความหนึ่ง (เช่น เหตุก่อนผล, เงื่อนไขกับผล) ไม่เลือกกาลที่ทำให้เส้นเวลาขัดกัน";
  }
  return null;
}

/** เมื่อไม่มี analysisSteps ใน JSON — ไม่แสดงคำอธิบายแยก; รวมเป็นรายการหัวข้อในการวิเคราะห์ */
function buildFallbackAnalysisSteps(slide) {
  const steps = [];

  if (slide.kind === "p5") {
    let num = 1;
    if (slide.item.focus) {
      steps.push(
        `ข้อ ${num++} — จุดที่โจทย์วัด: ${String(slide.item.focus).trim()}`
      );
    }
    const hint = inferSignalHintFromPrompt(slide);
    steps.push(
      hint
        ? `ข้อ ${num++} — Signal / คำสัญญาณในโจทย์: ${hint}`
        : `ข้อ ${num++} — Signal / คำสัญญาณในโจทย์: แอปจับวลีพิเศษในโจทย์นี้ไม่ได้ — ให้ดูคำก่อน/หลังช่องว่างเองว่าเป็น connector, คำบ่งชี้ หรือกริยาหลักอะไร หรือรัน npm run generate ใหม่ให้ได้ analysisSteps ที่อ้างคำจากประโยคจริงทีละข้อ`
    );
    const opts = getOptions(slide);
    const optLine = opts
      .map((o, i) => `${LABELS[i]}. ${o}`)
      .join(" · ");
    steps.push(
      `ข้อ ${num++} — ตัวเลือกในข้อนี้ (ใช้เทียบกับช่องว่างในประโยคนี้เท่านั้น ไม่ใช่กฎทั่วไป): ${optLine}`
    );
    const exp = getExplanation(slide);
    const pieces = splitExplanationIntoSteps(exp);
    pieces.forEach((part) => {
      steps.push(`ข้อ ${num++} — เนื้อหาวิเคราะห์: ${part}`);
    });
    if (pieces.length === 0) {
      steps.push(
        `ข้อ ${num} — เนื้อหาวิเคราะห์: (ยังไม่มีข้อความ) — สร้างชุดใหม่ด้วย generate ให้ได้ analysisSteps ครบ หรือเพิ่มฟิลด์ analysisSteps / explanation ใน JSON`
      );
    }
    return steps;
  }

  const exp = getExplanation(slide);
  const pieces = splitExplanationIntoSteps(exp);
  pieces.forEach((part, i) => {
    steps.push(`ข้อ ${i + 1} — เนื้อหาวิเคราะห์: ${part}`);
  });
  if (steps.length === 0) {
    steps.push(
      "ยังไม่มีขั้นวิเคราะห์ในแบงก์ข้อมูล — เพิ่ม analysisSteps หรือ explanation ใน JSON"
    );
  }
  return steps;
}

function getAnalysisSteps(slide) {
  const custom = getAnalysisStepsFromItem(slide);
  if (custom) return custom;
  return buildFallbackAnalysisSteps(slide);
}

function analysisStepsHtml(slide, openByDefault = true) {
  const steps = getAnalysisSteps(slide);
  if (!steps.length) return "";
  return `
    <details class="analysis-steps" ${openByDefault ? "open" : ""}>
      <summary class="analysis-steps-summary">วิเคราะห์ทีละขั้นตอน</summary>
      <ol class="analysis-steps-list">
        ${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
      </ol>
    </details>
  `;
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatDateTime(ts) {
  try {
    return new Date(ts).toLocaleString("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function computeSessionStats() {
  const slides = state.slides;
  let correct = 0;
  const byPart = { 5: { c: 0, t: 0 }, 6: { c: 0, t: 0 }, 7: { c: 0, t: 0 } };

  const rows = slides.map((slide) => {
    const ans = state.answers[slide.key];
    const ok = ans === getCorrectIndex(slide);
    if (ok) correct += 1;
    byPart[slide.part].t += 1;
    if (ok) byPart[slide.part].c += 1;

    let label = slide.key;
    if (slide.kind === "p6") {
      label = `${slide.item.id} · blank (${slide.item.blanks[slide.blankIndex].blankNumber})`;
    }
    if (slide.kind === "p7") {
      label = slide.item.questions[slide.questionIndex].id;
    }

    return { slide, ans, ok, label };
  });

  const total = slides.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const durationMs = state.startedAt > 0 ? Date.now() - state.startedAt : 0;

  return { correct, total, pct, byPart, durationMs, rows };
}

const state = {
  view: "home",
  parts: [...ACTIVE_PARTS],
  slides: [],
  index: 0,
  answers: {},
  startedAt: 0,
  timerId: null,
  bankFile: null,
  /** กันบันทึกสถิติซ้ำระหว่างอยู่หน้าผลลัพธ์ชุดเดียวกัน */
  _savedThisResult: false,
};

(function initBankFile() {
  const list = getBankList();
  if (list.length) state.bankFile = list[0].file;
})();

function getBank() {
  const list = getBankList();
  if (!list.length) return null;
  const hit = list.find((x) => x.file === state.bankFile);
  return hit ? hit.data : list[0].data;
}

const app = document.getElementById("app");

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startTimer() {
  stopTimer();
  state.startedAt = Date.now();
  state.timerId = setInterval(() => {
    const el = document.querySelector(".timer");
    if (el && state.view === "quiz" && state.startedAt > 0) {
      el.textContent = `เวลา ${formatElapsed(Date.now() - state.startedAt)}`;
    }
  }, 1000);
}

function logoutButtonHtml() {
  return authGateRequired()
    ? `<button type="button" class="btn ghost" id="btn-logout">ออกจากระบบ</button>`
    : "";
}

function attachLogout() {
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    logout();
    state.view = "home";
    render();
  });
}

function renderLogin() {
  return `
    <div class="login-wrap">
      <h1>TOEIC Reading — Practice</h1>
      <p class="sub">เข้าสู่ระบบเพื่อใช้งาน</p>
      <div class="card login-card">
        <form id="form-login" class="login-form">
          <label class="bank-label">รหัสผ่าน
            <input type="password" id="login-password" class="input" autocomplete="current-password" required />
          </label>
          <p class="login-error" id="login-error" hidden></p>
          <button type="submit" class="btn primary">เข้าสู่ระบบ</button>
        </form>
      </div>
    </div>
  `;
}

function bindLogin() {
  const form = document.getElementById("form-login");
  const errEl = document.getElementById("login-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const password = document.getElementById("login-password").value;
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent =
          data.error === "Invalid password"
            ? "รหัสผ่านไม่ถูกต้อง"
            : data.error || "เข้าสู่ระบบไม่สำเร็จ";
        errEl.hidden = false;
        return;
      }
      markLoggedIn();
      state.view = "home";
      render();
    } catch {
      errEl.textContent =
        "เชื่อมต่อ API ไม่ได้ — สำหรับ localhost ตั้งไฟล์ .env เป็น VITE_SKIP_AUTH=1 แล้วรีสตาร์ท dev";
      errEl.hidden = false;
    }
  });
}

function render() {
  if (authGateRequired() && !isLoggedIn()) {
    app.innerHTML = renderLogin();
    bindLogin();
    return;
  }

  if (state.view === "home") {
    app.innerHTML = renderHome();
    bindHome();
    attachLogout();
    return;
  }
  if (state.view === "stats") {
    app.innerHTML = renderStats();
    bindStats();
    attachLogout();
    return;
  }
  if (state.view === "quiz") {
    app.innerHTML = renderQuiz();
    bindQuiz();
    return;
  }
  if (state.view === "results") {
    stopTimer();
    if (!state._savedThisResult) {
      const b = getBank();
      const st = computeSessionStats();
      const parts = {};
      for (const p of [5, 6, 7]) {
        if (st.byPart[p].t > 0) {
          parts[p] = { c: st.byPart[p].c, t: st.byPart[p].t };
        }
      }
      saveAttempt({
        id: crypto.randomUUID(),
        at: Date.now(),
        bankFile: state.bankFile ?? "",
        bankTitle: b?.meta?.title ?? "",
        bankId: b?.meta?.id ?? "",
        total: st.total,
        correct: st.correct,
        percent: st.pct,
        durationMs: st.durationMs,
        parts,
      });
      state._savedThisResult = true;
    }
    app.innerHTML = renderResults();
    bindResults();
  }
}

function renderHome() {
  const list = getBankList();
  if (!list.length) {
    return `
      <nav class="nav-row">
        <button type="button" class="btn" id="btn-stats-empty">สถิติ</button>
        ${logoutButtonHtml()}
      </nav>
      <h1>TOEIC Reading — Practice</h1>
      <p class="sub">ยังไม่มีไฟล์ชุดข้อในโฟลเดอร์ <code>data/</code></p>
      <p class="sub">เพิ่มไฟล์ <code>.json</code> ตาม schema หรือรัน <code>npm run generate</code> (ต้องเปิด Ollama)</p>
    `;
  }

  const bank = getBank();
  const m = bank.meta;
  const options = list
    .map(
      ({ file, data }) =>
        `<option value="${escapeHtml(file)}" ${
          file === state.bankFile ? "selected" : ""
        }>${escapeHtml(file)} — ${escapeHtml(data.meta?.title || "")}</option>`
    )
    .join("");

  return `
    <nav class="nav-row">
      <button type="button" class="btn" id="btn-stats">สถิติ</button>
      ${logoutButtonHtml()}
    </nav>
    <h1>${escapeHtml(m.title)}</h1>
    <p class="sub">${escapeHtml(m.id)} · v${m.version}${
    m.createdAt ? ` · ${escapeHtml(m.createdAt.slice(0, 10))}` : ""
  }</p>
    ${m.notes ? `<p class="sub">${escapeHtml(m.notes)}</p>` : ""}
    <div class="card">
      <label class="bank-label">ชุดข้อสอบ
        <select id="bank-select" class="select">${options}</select>
      </label>
      <p class="parts-focus">ตอนนี้ฝึกเฉพาะ <strong>Part 5 · Incomplete Sentences</strong> — Part 6 และ Part 7 ปิดไว้ก่อน (จะเปิดเมื่อพัฒนา Part 5 เสร็จ)</p>
      <div class="exam-structure" aria-label="Part 5 ในข้อสอบจริง">
        <p class="exam-structure-title">Part 5 ในข้อสอบจริง</p>
        <ul class="exam-structure-list">
          <li><strong>Incomplete Sentences</strong> — 30 ข้อ · เติมคำในช่องว่างระดับประโยคเดียว เน้นวัดไวยากรณ์และคำศัพท์ในบริบทสำนักงาน/ธุรกิจ</li>
        </ul>
        <p class="exam-structure-note">ไฟล์ JSON อาจมี Part 6–7 อยู่ — แอปจะข้ามและแสดงเฉพาะข้อ <code>part: 5</code> · รัน <code>npm run generate -- --size=exam</code> เพื่อสร้างชุด 30 ข้อ (เท่าข้อสอบจริง)</p>
      </div>
      <p class="home-hint muted">หลังเลือกคำตอบจะเห็นเฉลยทันที พร้อม <strong>วิเคราะห์ทีละขั้นตอน</strong> (ฝึกคิดตามได้โดยไม่เพิ่มเวลาในห้องสอบ)</p>
      <button type="button" class="btn primary" id="btn-start">เริ่มทำข้อ</button>
    </div>
  `;
}

function bindHome() {
  const statsBtn = document.getElementById("btn-stats");
  const statsEmpty = document.getElementById("btn-stats-empty");
  for (const b of [statsBtn, statsEmpty].filter(Boolean)) {
    b.addEventListener("click", () => {
      state.view = "stats";
      render();
    });
  }

  const sel = document.getElementById("bank-select");
  if (sel) {
    sel.addEventListener("change", (e) => {
      state.bankFile = e.target.value;
    });
  }

  const btn = document.getElementById("btn-start");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const bank = getBank();
    if (!bank) {
      alert("ไม่พบชุดข้อสอบ");
      return;
    }
    state.parts = [...ACTIVE_PARTS];
    state.slides = flattenItems(bank.items, state.parts);
    if (state.slides.length === 0) {
      alert("ไม่มีข้อใน Part ที่เลือก");
      return;
    }
    state.index = 0;
    state.answers = {};
    state._savedThisResult = false;
    state.view = "quiz";
    startTimer();
    render();
  });
}

function renderQuiz() {
  const slide = state.slides[state.index];
  const total = state.slides.length;
  const pct = ((state.index + 1) / total) * 100;
  const elapsed =
    state.startedAt > 0 ? Date.now() - state.startedAt : 0;

  const selectedIndex =
    state.answers[slide.key] === undefined
      ? null
      : state.answers[slide.key];

  let body = "";
  if (slide.kind === "p5") {
    body = `
      ${
        slide.item.focus
          ? `<p class="hint focus-line">${escapeHtml(slide.item.focus)}</p>`
          : ""
      }
      <p class="prompt">${escapeHtml(slide.item.prompt)}</p>
      ${optionsHtml(slide, selectedIndex)}
      ${feedbackHtml(slide, selectedIndex)}
    `;
  } else if (slide.kind === "p6") {
    const b = slide.item.blanks[slide.blankIndex];
    body = `
      ${slide.item.title ? `<p class="hint">${escapeHtml(slide.item.title)}</p>` : ""}
      <div class="passage">${escapeHtml(slide.item.passage)}</div>
      <p class="hint">เลือกคำที่เหมาะสมสำหรับช่อง (${b.blankNumber})</p>
      ${optionsHtml(slide, selectedIndex)}
      ${feedbackHtml(slide, selectedIndex)}
    `;
  } else {
    const q = slide.item.questions[slide.questionIndex];
    body = `
      ${
        slide.item.sourceLabel
          ? `<p class="hint">${escapeHtml(slide.item.sourceLabel)}</p>`
          : ""
      }
      <div class="passage">${escapeHtml(slide.item.passage)}</div>
      <p class="q-stem">${escapeHtml(q.prompt)}</p>
      ${optionsHtml(slide, selectedIndex)}
      ${feedbackHtml(slide, selectedIndex)}
    `;
  }

  return `
    <div class="row" style="justify-content: space-between;">
      <span class="part-badge">Part ${slide.part}</span>
      <span class="timer">เวลา ${formatElapsed(elapsed)}</span>
    </div>
    <div class="progress-line"><span style="width:${pct}%"></span></div>
    <p class="sub" style="margin:0 0 0.5rem">ข้อ ${state.index + 1} / ${total}</p>
    <div class="card">
      ${body}
    </div>
    <div class="btn-bar">
      <button type="button" class="btn" id="btn-prev" ${
        state.index === 0 ? "disabled" : ""
      }>ก่อนหน้า</button>
      <button type="button" class="btn primary" id="btn-next">${
        state.index === total - 1 ? "ส่งคำตอบ" : "ถัดไป"
      }</button>
      <button type="button" class="btn" id="btn-abort">กลับหน้าแรก</button>
    </div>
  `;
}

function feedbackHtml(slide, selectedIndex) {
  if (selectedIndex === null || selectedIndex === undefined) return "";
  const opts = getOptions(slide);
  const ci = getCorrectIndex(slide);
  const ok = selectedIndex === ci;
  const stepsBlock = analysisStepsHtml(slide);
  return `
    <div class="feedback-inline" role="status" aria-live="polite">
      <p class="feedback-status ${ok ? "ok" : "bad"}">${ok ? "ถูก" : "ผิด"}</p>
      <p class="feedback-line"><strong>คำตอบที่ถูก:</strong> ${LABELS[ci]}. ${escapeHtml(
    opts[ci] ?? ""
  )}</p>
      ${stepsBlock}
    </div>
  `;
}

function optionsHtml(slide, selectedIndex = null) {
  const opts = getOptions(slide);
  const name = `q-${slide.key}`;
  const ci = getCorrectIndex(slide);
  const reveal =
    selectedIndex !== null && selectedIndex !== undefined;
  return `
    <div class="opts" role="radiogroup" aria-label="ตัวเลือก">
      ${opts
        .map((opt, i) => {
          let cls = "choice";
          if (reveal) {
            if (i === ci) cls += " choice-correct";
            if (i === selectedIndex && i !== ci) cls += " choice-wrong";
          }
          return `
        <label class="${cls}">
          <input type="radio" name="${escapeHtml(name)}" value="${i}" ${
            selectedIndex === i ? "checked" : ""
          } />
          <span><strong>${LABELS[i]}.</strong> ${escapeHtml(opt)}</span>
        </label>
      `;
        })
        .join("")}
    </div>
  `;
}

function readSelected(slide) {
  const name = `q-${slide.key}`;
  const el = document.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
  if (!el) return undefined;
  return Number(el.value);
}

function bindQuiz() {
  const slide = state.slides[state.index];
  const name = `q-${slide.key}`;

  document.querySelectorAll(`input[name="${CSS.escape(name)}"]`).forEach((inp) => {
    inp.addEventListener("change", () => {
      state.answers[slide.key] = Number(inp.value);
      render();
    });
  });

  document.getElementById("btn-prev").addEventListener("click", () => {
    const cur = readSelected(slide);
    if (cur !== undefined) state.answers[slide.key] = cur;
    if (state.index > 0) {
      state.index -= 1;
      render();
    }
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    const cur = readSelected(slide);
    if (cur === undefined) {
      alert("เลือกคำตอบก่อนไปข้อถัดไป");
      return;
    }
    state.answers[slide.key] = cur;
    if (state.index < state.slides.length - 1) {
      state.index += 1;
      render();
    } else {
      state.view = "results";
      render();
    }
  });

  document.getElementById("btn-abort").addEventListener("click", () => {
    if (confirm("ออกจากชุดข้อนี้? คำตอบจะไม่ถูกบันทึก")) {
      stopTimer();
      state.view = "home";
      render();
    }
  });
}

function renderResults() {
  const { correct, total, pct, byPart, durationMs, rows } = computeSessionStats();

  const breakdownRows = [5, 6, 7]
    .filter((p) => byPart[p].t > 0)
    .map(
      (p) => `
    <tr>
      <td>Part ${p}</td>
      <td>${byPart[p].c} / ${byPart[p].t}</td>
    </tr>
  `
    )
    .join("");

  const detail = rows
    .map(({ slide, ans, ok, label }) => {
      const opts = getOptions(slide);
      const ci = getCorrectIndex(slide);
      const letters = LABELS[ci];
      const your =
        ans === undefined ? "—" : `${LABELS[ans]} (${opts[ans] ?? ""})`;
      const stepsBlock = analysisStepsHtml(slide, false);
      return `
      <div class="result-item">
        <div><strong>${escapeHtml(label)}</strong> · Part ${slide.part}</div>
        <div class="${ok ? "ok" : "bad"}">${ok ? "ถูก" : "ผิด"}</div>
        <p class="explain">คำตอบที่ถูก: <strong>${letters}</strong> · ${escapeHtml(
        opts[ci] ?? ""
      )}</p>
        <p class="explain">คำตอบของคุณ: ${escapeHtml(your)}</p>
        ${stepsBlock}
      </div>
    `;
    })
    .join("");

  return `
    <h1>สรุปผล</h1>
    <p class="sub">${escapeHtml(getBank()?.meta?.title ?? "")}</p>
    <div class="card">
      <p class="results-summary">${correct} / ${total} ข้อ (${pct}%) · เวลา ${formatElapsed(durationMs)}</p>
      <table class="breakdown">
        <thead><tr><th>Part</th><th>ถูก / ทั้งหมด</th></tr></thead>
        <tbody>${breakdownRows}</tbody>
      </table>
    </div>
    <h2>เฉลยรายข้อ</h2>
    <div class="card">${detail}</div>
    <div class="btn-bar">
      <button type="button" class="btn primary" id="btn-again">ทำชุดนี้อีกครั้ง</button>
      <button type="button" class="btn" id="btn-home">หน้าแรก</button>
    </div>
  `;
}

function bindResults() {
  document.getElementById("btn-again").addEventListener("click", () => {
    state.index = 0;
    state.answers = {};
    state._savedThisResult = false;
    state.view = "quiz";
    startTimer();
    render();
  });
  document.getElementById("btn-home").addEventListener("click", () => {
    state.view = "home";
    render();
  });
}

function renderStats() {
  const attempts = loadAttempts();
  const n = attempts.length;
  const last5 = attempts.slice(0, 5);
  const avgPct =
    last5.length > 0
      ? Math.round(
          last5.reduce((s, a) => s + (a.percent ?? 0), 0) / last5.length
        )
      : null;

  const rows =
    n === 0
      ? `<tr><td colspan="5" class="stats-empty">ยังไม่มีประวัติ — ทำชุดข้อให้จบแล้วจะบันทึกที่นี่</td></tr>`
      : attempts
          .map(
            (a) => `
    <tr>
      <td>${escapeHtml(formatDateTime(a.at))}</td>
      <td>${escapeHtml(a.bankTitle || a.bankFile || "—")}</td>
      <td>${a.correct ?? 0} / ${a.total ?? 0}</td>
      <td>${a.percent ?? 0}%</td>
      <td>${formatElapsed(a.durationMs ?? 0)}</td>
    </tr>
  `
          )
          .join("");

  return `
    <nav class="nav-row">
      <button type="button" class="btn" id="btn-stats-back">← หน้าแรก</button>
      ${logoutButtonHtml()}
    </nav>
    <h1>สถิติ</h1>
    <p class="sub">เก็บในเบราว์เซอร์ (localStorage) · สูงสุด 500 รายการล่าสุด</p>
    ${
      avgPct !== null
        ? `<p class="stats-highlight">คะแนนเฉลี่ย 5 รอบล่าสุด: <strong>${avgPct}%</strong></p>`
        : ""
    }
    <div class="card stats-card">
      <table class="stats-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ชุดข้อ</th>
            <th>ถูก</th>
            <th>%</th>
            <th>เวลา</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="btn-bar">
      <button type="button" class="btn danger" id="btn-stats-clear" ${
        n === 0 ? "disabled" : ""
      }>ล้างประวัติทั้งหมด</button>
    </div>
  `;
}

function bindStats() {
  document.getElementById("btn-stats-back").addEventListener("click", () => {
    state.view = "home";
    render();
  });
  document.getElementById("btn-stats-clear").addEventListener("click", () => {
    if (!loadAttempts().length) return;
    if (
      confirm(
        "ลบประวัติการทำข้อทั้งหมดในเครื่องนี้? ไม่สามารถกู้คืนได้"
      )
    ) {
      clearAllAttempts();
      render();
    }
  });
}

render();
