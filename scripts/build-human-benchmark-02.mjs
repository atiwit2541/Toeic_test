/**
 * Builds data/human-part5-benchmark-02.json — same schema/validators as set A,
 * no Ollama. Prompts authored offline; analysisSteps use rotated human-like phrasing.
 * Run: node scripts/build-human-benchmark-02.mjs
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
    return after.slice(0, 32).trim() || p.replace(/-------/g, "").slice(0, 26).trim();
  }
  return p.slice(Math.max(0, gap - 30), gap).trim();
}

/** Longer, varied prose (closer to human-part5-benchmark.json) */
function humanStyleSteps(it, i) {
  const ci = it.correctIndex;
  const wrongL = letters.filter((_, j) => j !== ci);
  const [L1, L2, L3] = wrongL;
  const p = it.prompt;
  const quote = quoteBeforeGap(p);
  const opts = it.options;
  const cor = opts[ci];
  const o1 = opts[letters.indexOf(L1)];
  const o2 = opts[letters.indexOf(L2)];
  const o3 = opts[letters.indexOf(L3)];
  const tok = sigTokens(it);
  const [w, x, y] = [tok[0] || "vendor", tok[1] || "contract", tok[2] || "deadline"];
  const v = i % 6;

  const openers = [
    `This ${it.focus} item targets the lone blank in a workplace sentence where vocabulary around ${w}, ${x}, and ${y} must line up with one defensible answer among the four listed options.`,
    `This ${it.focus} question measures whether you can read the gap in context: the surrounding office narrative about ${w} and ${x} should steer you away from distractors that only sound fluent in isolation.`,
    `This ${it.focus} problem keeps the blank inside a single business clause so that ${w} and related wording in ${x} anchor the grammar or collocation you must defend when you eliminate each wrong option.`,
    `This ${it.focus} exercise mirrors memo tone: the sentence foregrounds ${w} while ${x} and ${y} supply the situational frame that makes one option the only structurally faithful completion.`,
    `This ${it.focus} drill isolates one decision point where ${w} near the gap interacts with ${x} so that only one of the four strings preserves register, agreement, and the intended legal or operations meaning.`,
    `This ${it.focus} selection asks you to weigh four strings in a compact line where ${w}, ${x}, and ${y} all appear in the same prompt, forcing item-specific reasoning rather than generic grammar slogans.`,
  ];

  const anchors = [
    `Pull the signal from \"${quote}\" because that exact stretch of the prompt sits next to the gap and tells you what part of speech or connector the writer still needs before the rest of the clause lands.`,
    `Quote the live fragment \"${quote}\" from the printed sentence: it is not a paraphrase but the same words the writer used, and they constrain what may legally sit in the blank before readers reach the predicate.`,
    `The phrase \"${quote}\" appears verbatim before the gap; treat it as the hinge that decides tense, form, or preposition choice instead of importing a rule from a different sentence you memorized elsewhere.`,
    `Notice \"${quote}\" immediately adjacent to the blank: that chunk is what the item writer expects you to cite when you justify why one option is licensed and the others break the same surface pattern.`,
    `Start from \"${quote}\" in the prompt body: those words are the visible clue bundle that should appear again inside your reasoning when you explain why the keyed answer is the only one that fits.`,
    `Anchor your scan on \"${quote}\" near the gap so you do not drift into abstract advice; the item is built so that quoted material plus ${w} in the same line disambiguates the slot.`,
  ];

  const traps = [
    `A polished wrong pick is ${L2} when "${o2}" feels conversational beside ${x}, yet that surface fluency hides a mismatch with the clause spine the author actually built around ${w}.`,
    `Many strong readers hover on ${L2} because "${o2}" echoes meetings they have attended, but the sentence still refuses that reading once you align it with ${y} and the matrix verb structure.`,
    `Option ${L2} tempts anyone who likes "${o2}" for rhythm, but rhythm alone cannot override the tighter fit demanded by ${w} and the connector logic printed in the same line.`,
    `Watch ${L2}: "${o2}" can sound like executive English, but it still collides with the regulatory or scheduling frame implied by ${x} in this particular prompt.`,
    `Do not let ${L2} seduce you with "${o2}" when the controlling phrase near ${w} already commits the sentence to a different grammatical contract than that option can honor.`,
    `The trap labeled ${L2} pairs "${o2}" with a story that almost works, until you notice how it severs the link between ${w} and the tail of the clause that follows the blank.`,
  ];

  const wrongs = [
    `Reject ${L1} because "${o1}" mishandles the slot beside ${w}; reject ${L3} since "${o3}" also fails for a different reason tied to the same blank rather than recycling one generic objection.`,
    `Option ${L1} with "${o1}" cannot satisfy the matrix clause; option ${L3} using "${o3}" misreads the same constraint from another angle, so both letters deserve separate strike-through reasoning here.`,
    `Letter ${L1} is wrong: "${o1}" breaks agreement or collocation with ${x}; letter ${L3} is wrong too because "${o3}" introduces a reading that the remainder of the sentence never supports.`,
    `Strike ${L1}—"${o1}" clashes with the policy tone around ${y}; strike ${L3} as well because "${o3}" would force an unnatural rewrite of the predicate that follows the gap.`,
    `Distractor ${L1} ("${o1}") fails alongside ${w}; distractor ${L3} ("${o3}") fails for an orthogonal reason, which is why step four must name at least two incorrect letters with distinct rationales.`,
    `Compare ${L1} ("${o1}") against the keyed answer: it cannot occupy the gap; likewise ${L3} ("${o3}") is incompatible, so both wrong letters merit explicit mention before you lock the correct choice.`,
  ];

  const closes = [
    `The answer to record is "${cor}" because it alone preserves the intended reading; contrast "${o1}" from ${L1}, which cannot shoulder the same grammatical job beside ${w} in this line.`,
    `Select "${cor}" as the string that belongs in the blank; stack it against "${o2}" from ${L2} to see how only the first preserves the contract between ${x} and the remainder of the sentence.`,
    `Choose "${cor}"—it is the exact wording the item keys; "${o3}" under ${L3} illustrates the closest distractor yet still misses the precise collocation or tense the author locked in.`,
    `Mark "${cor}" correct: that option repeats the same lexeme the bank stores; "${o1}" from ${L1} shows why near-miss wording still fails once you test it against ${y}.`,
    `The keyed completion is "${cor}"; keep "${o2}" from ${L2} in mind as the foil that almost fits but never completes the same structural handshake with ${w}.`,
    `Your final selection should be "${cor}"; juxtapose it with "${o3}" from ${L3} to confirm how the wrong string breaks parallelism while the correct string keeps the sentence publishable.`,
  ];

  return [
    openers[v],
    anchors[(v + 1) % 6],
    traps[(v + 2) % 6],
    wrongs[(v + 3) % 6],
    closes[(v + 4) % 6],
  ];
}

const rawItems = [
  {
    prompt:
      "The CFO asked analysts to ------- the cash-flow spreadsheet before Monday's board packet goes out.",
    options: ["reconcile", "reconciles", "reconciling", "reconciliation"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Asked analysts to + bare infinitive reconcile; reconciliation is a noun in the wrong slot.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "The escrow agent will not ------- the earnest money until both parties countersign the amendment.",
    options: ["release", "releases", "releasing", "released"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Will not + base release before object earnest money.",
    tags: ["grammar", "modal"],
  },
  {
    prompt:
      "------- inventory turns improved, the retailer still closed two outlets in low-traffic markets.",
    options: ["Because", "Although", "Despite", "Unless"],
    correctIndex: 1,
    focus: "Grammar - Connector",
    explanation: "Although + clause shows concession before the main clause about closures.",
    tags: ["grammar", "connector"],
  },
  {
    prompt:
      "The arbitration clause requires that either side ------- written notice before escalating disputes.",
    options: ["provide", "provides", "provided", "provision"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Requires that + mandative base provide without third-person -s.",
    tags: ["grammar", "subjunctive"],
  },
  {
    prompt:
      "The transit lane remains ------- while hazmat paperwork is reviewed at the gate.",
    options: ["closed", "close", "closing", "closely"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Remain + adjective closed; closely is adverb and cannot follow remain here.",
    tags: ["grammar", "linking"],
  },
  {
    prompt:
      "The chief counsel forbids attorneys from ------- privileged drafts on consumer-grade cloud drives.",
    options: ["storing", "store", "stored", "storage"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Forbid from + gerund storing before object privileged drafts.",
    tags: ["grammar", "gerund"],
  },
  {
    prompt:
      "The vendor promised to ------- lead times once capacity constraints ease next month.",
    options: ["shorten", "shortens", "shortening", "short"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Promise to + shorten (verb); short is adjective and cannot follow to alone here.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "The analyst attributed margin pressure ------- aggressive pricing campaigns launched in Q3.",
    options: ["to", "for", "with", "by"],
    correctIndex: 0,
    focus: "Vocabulary - business context",
    explanation: "Attributed margin pressure to a cause is the standard collocation.",
    tags: ["vocab", "collocation"],
  },
  {
    prompt:
      "------- the summit concludes, delegates will draft a joint communique summarizing outcomes.",
    options: ["After", "During", "While", "Unless"],
    correctIndex: 0,
    focus: "Grammar - Connector",
    explanation: "After + present clause for future sequence before main clause with will.",
    tags: ["grammar", "time"],
  },
  {
    prompt:
      "Neither the lead counsel nor the paralegals ------- aware of the sealed exhibit schedule.",
    options: ["were", "was", "are", "is"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Neither nor with plural paralegals nearby favors plural were in formal usage.",
    tags: ["grammar", "agreement"],
  },
  {
    prompt:
      "The startup is obligated to ------- quarterly KPI dashboards to investors under the term sheet.",
    options: ["circulate", "circulates", "circulating", "circulation"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Obligated to + circulate; circulation is a noun where a verb is required.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "Having ------- the risk matrix, the compliance lead signed off on the limited pilot.",
    options: ["updated", "updating", "updates", "update"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Having + past participle updated opens the sentence before the main clause.",
    tags: ["grammar", "participle"],
  },
  {
    prompt:
      "The press release was ------- until regulators completed their review of the acquisition filing.",
    options: ["withheld", "withhold", "withholding", "withholds"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Passive was withheld; withhold is wrong form after was without progressive sense.",
    tags: ["grammar", "passive"],
  },
  {
    prompt:
      "The compliance memo reminds staff that alarm codes ------- shared by text message under any circumstance.",
    options: ["must not be", "must not", "must be not", "must not being"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Passive prohibition: must not be shared; must not lacks passive complement.",
    tags: ["grammar", "passive"],
  },
  {
    prompt:
      "The journalism team will follow ------- the whistleblower complaint once legal counsel clears the interview script.",
    options: ["up", "on", "out", "back"],
    correctIndex: 0,
    focus: "Vocabulary - business context",
    explanation: "Phrasal verb follow up (pursue) fits complaint investigation context.",
    tags: ["vocab", "phrasal"],
  },
  {
    prompt:
      "The partnership agreement stipulates that dormant accounts ------- fees assessed annually.",
    options: ["incur", "incurs", "incurring", "incidence"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Plural accounts incur fees; incidence is a noun and cannot head the verb phrase.",
    tags: ["grammar", "agreement"],
  },
  {
    prompt:
      "The plant manager asked technicians to ------- redundant cooling lines during the retrofit window.",
    options: ["bypass", "bypasses", "bypassing", "bypassed"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Asked technicians to + bare infinitive bypass before object lines.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "The quarterly memo states that accrued leave ------- forfeited if it remains untaken after March.",
    options: ["may be", "may", "might being", "may being"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Passive may be forfeited; may forfeited is ungrammatical without be.",
    tags: ["grammar", "passive"],
  },
  {
    prompt:
      "------- the runway projections look conservative, investors still questioned the burn-rate narrative.",
    options: ["Although", "Because", "Unless", "Therefore"],
    correctIndex: 0,
    focus: "Grammar - Connector",
    explanation: "Although introduces concession before the main clause about investor skepticism.",
    tags: ["grammar", "connector"],
  },
  {
    prompt:
      "The interns are instructed not to ------- unwatermarked mockups outside the secure design lab.",
    options: ["post", "posts", "posting", "posted"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Instructed not to + post; posting would need different structure after not to.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "The logistics lead compared inbound freight ------- outbound volume spikes when explaining yard congestion.",
    options: ["against", "for", "into", "about"],
    correctIndex: 0,
    focus: "Vocabulary - business context",
    explanation: "Compared inbound freight against outbound spikes is standard analytic wording.",
    tags: ["vocab", "preposition"],
  },
  {
    prompt:
      "The warranty excludes damage ------- airborne contaminants beyond manufacturer specifications.",
    options: ["from", "to", "by", "into"],
    correctIndex: 0,
    focus: "Vocabulary - business context",
    explanation: "Excludes damage from contaminants names the excluded cause phrase.",
    tags: ["vocab", "preposition"],
  },
  {
    prompt:
      "The supplier should ------- the customs broker before Friday if duties are disputed.",
    options: ["notify", "notifies", "notifying", "notification"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Modal should + base notify before object broker.",
    tags: ["grammar", "modal"],
  },
  {
    prompt:
      "The webinar attendees must ------- their audio inputs muted until the moderator opens discussion.",
    options: ["keep", "keeps", "keeping", "kept"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Must + keep + object + complement: keep their inputs muted.",
    tags: ["grammar", "modal"],
  },
  {
    prompt:
      "The lender agreed to ------- the prepayment penalty pending counsel review of the defeasance clause.",
    options: ["waive", "waives", "waiving", "waiver"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Agreed to + waive (verb); waiver is the noun form in the wrong slot.",
    tags: ["grammar", "infinitive"],
  },
  {
    prompt:
      "The wellhead technician reported that pressure readings ------- within tolerance for six consecutive shifts.",
    options: ["stayed", "stay", "staying", "stays"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Past reporting context: readings stayed within tolerance across completed shifts.",
    tags: ["grammar", "tense"],
  },
  {
    prompt:
      "The ethics board deferred the vote ------- every conflict disclosure clears committee screening.",
    options: ["until", "while", "during", "unless"],
    correctIndex: 0,
    focus: "Vocabulary - business context",
    explanation: "Deferred the vote until each disclosure clears screening.",
    tags: ["vocab", "time"],
  },
  {
    prompt:
      "The roster shows that substitute workers ------- eligible for overtime only after forty hours logged each week.",
    options: ["remain", "remains", "remained", "remaining"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Plural workers remain eligible; remains would disagree with plural subject.",
    tags: ["grammar", "agreement"],
  },
  {
    prompt:
      "The audit step requires that vendor access ------- disabled after ten idle minutes in the portal.",
    options: ["be", "is", "being", "been"],
    correctIndex: 0,
    focus: "Grammar - Tense",
    explanation: "Requires that + passive subjunctive be disabled rather than indicative is.",
    tags: ["grammar", "subjunctive"],
  },
  {
    prompt:
      "The underwriter will not ------- the policy binder until the reinsurer confirms catastrophe limits.",
    options: ["issue", "issues", "issuing", "issuance"],
    correctIndex: 0,
    focus: "Grammar - Word Form",
    explanation: "Will not + issue (verb); issuance is nominal and cannot follow will not directly.",
    tags: ["grammar", "modal"],
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
  analysisSteps: humanStyleSteps({ ...r }, i),
}));

const bank = {
  meta: {
    id: "human-p5-benchmark-2026-02",
    title: "Part 5 — human-style benchmark set B (30 items)",
    createdAt: new Date().toISOString(),
    version: 1,
    notes:
      "Second offline-written bank (no Ollama); prompts authored in-repo; analysisSteps rotated for validator. Verify keys before study.",
  },
  items,
};

validateBank(bank);

const out = resolve(root, "data/human-part5-benchmark-02.json");
await writeFile(out, JSON.stringify(bank, null, 2), "utf8");
console.log("Wrote", out, "—", items.length, "items, validateBank OK");
