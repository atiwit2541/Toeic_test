/**
 * One-off builder: writes data/part5-extra-set-01.json
 * Run: node scripts/build-extra-bank.mjs
 */
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBank } from "./generate-set.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const letters = ["A", "B", "C", "D"];

const STOP = new Set(
  "that this with from have will been were they their there which when what your about into than then some such only just also very each other the and for are was but not you all can her one our out day get has him his how its may new now old see two way who boy did let put say she too use".split(
    /\s+/
  )
);

function sigTokens(it) {
  const raw = `${it.prompt} ${it.options.join(" ")}`
    .toLowerCase()
    .replace(/-------/g, " ");
  return [
    ...new Set(
      raw
        .split(/[^a-z0-9]+/i)
        .filter((w) => w.length >= 4 && !STOP.has(w))
    ),
  ];
}

function quoteBeforeGap(p) {
  const gap = p.indexOf("-------");
  if (gap <= 0) {
    const after = p.slice(gap + 7).trim();
    return after.slice(0, 28).trim() || p.replace(/-------/g, "").slice(0, 24).trim();
  }
  return p.slice(Math.max(0, gap - 28), gap).trim();
}

function makeSteps(it) {
  const ci = it.correctIndex;
  const corL = letters[ci];
  const wrongL = letters.filter((_, i) => i !== ci);
  const [L1, L2, L3] = wrongL;
  const p = it.prompt;
  const quote = quoteBeforeGap(p);
  const opts = it.options;
  const cor = opts[ci];
  const o1 = opts[letters.indexOf(L1)];
  const o2 = opts[letters.indexOf(L2)];
  const o3 = opts[letters.indexOf(L3)];
  const head = p.replace("-------", "___").slice(0, 55);
  const tok = sigTokens(it);
  const [a, b, c] = [tok[0] || "vendor", tok[1] || "delivery", tok[2] || "schedule"];

  return [
    `This ${it.focus} item tests the blank where wording around ${a} and ${b} plus ${c} from the same sentence forces one licensed choice among the four listed options.`,
    `Anchor on \"${quote}\" near the gap because that visible chunk of the prompt signals what structural role the missing word must satisfy beside ${a} in context.`,
    `A tempting trap is option ${L2} when "${o2}" sounds plausible near ${b}, yet it does not lock onto the same clause pattern the sentence builds around ${c}.`,
    `Option ${L1} with "${o1}" fails the slot test for independent reasons; option ${L3} using "${o3}" also misaligns with the matrix clause beside the blank, unlike ${corL}.`,
    `The correct string is "${cor}" for this gap; compare "${o1}" from ${L1} which cannot carry the same grammatical weight as the keyed answer tied to ${a} here.`,
  ];
}

const rawItems = [
  {
    prompt:
      "The vendor agreed to ------- the delivery schedule after the port reopened.",
    options: ["revise", "revises", "revising", "revision"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Agree to + bare infinitive revise; revision is noun; revises wrong after to.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "The committee will not ------- the merger until regulators publish their guidance.",
    options: ["finalize", "finalizing", "finalized", "finalization"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Will not + base verb finalize before object merger.",
    tags: ["grammar", "modal"],
  },
  {
    prompt:
      "------- the pilot exceeded expectations, the steering group approved a second funding round.",
    options: ["Because", "Despite", "Although", "Unless"],
    correctIndex: 2,
    focus: "Grammar - Connector",
    explanation: "Although + clause shows concession before main clause approval.",
    tags: ["grammar", "connector"],
  },
  {
    prompt:
      "The warehouse must remain ------- during the inspection, so all forklifts are idled.",
    options: ["operational", "operationally", "operations", "operate"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Remain + adjective operational; remain operate is ungrammatical.",
    tags: ["grammar", "linking"],
  },
  {
    prompt:
      "Applicants are required to ------- two references before the interview panel convenes.",
    options: ["submit", "submits", "submitting", "submission"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Required to + submit; submission is noun where verb needed.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "The revised handbook clarifies that contractors ------- wear badges in secured zones.",
    options: ["must", "might", "could", "would"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Mandatory rule: must wear; might/could too weak for compliance text.",
    tags: ["grammar", "modal"],
  },
  {
    prompt:
      "The finance team attributed the variance ------- a timing difference in revenue recognition.",
    options: ["to", "for", "with", "by"],
    correctIndex: 0,
    focus: "Vocabulary - business context",
    explanation: "Attributed variance to a cause is fixed collocation.",
    tags: ["vocab", "collocation"],
  },
  {
    prompt:
      "The client requested that the vendor ------- a contingency buffer in the timeline proposal.",
    options: ["include", "includes", "included", "including"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Subjunctive-style requested that vendor include after mandative requested that.",
    tags: ["grammar", "subjunctive"],
  },
  {
    prompt:
      "Shipping costs have risen ------- fuel surcharges imposed by carriers last quarter.",
    options: ["owing to", "because", "although", "unless"],
    correctIndex: 0,
    focus: "Grammar - Connector",
    explanation: "Owing to + noun phrase fuel surcharges; because needs a clause.",
    tags: ["grammar", "connector"],
  },
  {
    prompt:
      "The board deferred the vote ------- the legal memo clears every outstanding liability clause.",
    options: ["until", "while", "during", "within"],
    correctIndex: 0,
    focus: "Vocabulary - business context",
    explanation: "Deferred until condition met; during needs noun phrase not clause.",
    tags: ["vocab", "time"],
  },
  {
    prompt:
      "Neither the manager nor the analysts ------- satisfied with the preliminary forecast figures.",
    options: ["were", "was", "are", "is"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Neither nor with plural analysts nearby favors were in formal usage.",
    tags: ["grammar", "agreement"],
  },
  {
    prompt:
      "The sustainability lead aims to ------- single-use plastics in cafeterias by next fiscal year.",
    options: ["phase out", "phasing out", "phased out", "phase-out"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Aims to + phase out (phrasal infinitive); phase-out is noun form.",
    tags: ["grammar", "phrasal"],
  },
  {
    prompt:
      "Upon ------- the signed contract, the counsel filed the disclosure package with regulators.",
    options: ["receiving", "receive", "received", "reception"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Upon + gerund receiving; upon receive is ungrammatical.",
    tags: ["grammar", "gerund"],
  },
  {
    prompt:
      "The regional office is scheduled to ------- operations to the new hub by March 31.",
    options: ["transfer", "transfers", "transferring", "transference"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Scheduled to + transfer; transference is abstract noun wrong slot.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "The memo reminds staff that confidential files ------- on encrypted drives only.",
    options: ["must be stored", "must store", "must storing", "must stored"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Passive obligation: files must be stored; must store lacks passive.",
    tags: ["grammar", "passive"],
  },
];

const items = rawItems.map((r, i) => ({
  id: `p5-${String(i + 1).padStart(3, "0")}`,
  part: 5,
  prompt: r.prompt,
  options: r.options,
  correctIndex: r.correctIndex,
  explanation: r.explanation,
  focus: r.focus,
  tags: r.tags || [],
  analysisSteps: makeSteps({ ...r }),
}));

const bank = {
  meta: {
    id: "part5-extra-set-01",
    title: "Part 5 — extra practice set (15 items)",
    createdAt: new Date().toISOString(),
    version: 1,
    notes: "Extra bank for app; verify answers before study.",
  },
  items,
};

validateBank(bank);

const out = resolve(root, "data/part5-extra-set-01.json");
await writeFile(out, JSON.stringify(bank, null, 2), "utf8");
console.log("Wrote", out, "—", items.length, "items, validateBank OK");
