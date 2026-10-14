// Generated data-entry records and match pairs for the Quiz (pure; no Deno APIs so vitest can test it).
// Every value is made up — no real people's data. Keys stay server-side (generated_key).
export type Level = "beginner" | "intermediate" | "advanced";
export type Rng = () => number;

const FIRST = ["Ravi", "Anita", "Suresh", "Pooja", "Arjun", "Meena", "Vikram", "Kavita", "Rahul", "Sunita", "Imran", "Neha", "Deepak", "Farah", "Gopal", "Lata", "Manoj", "Rekha", "Sanjay", "Asha"];
const LAST = ["Sharma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Khan", "Das", "Joshi", "Menon", "Rao", "Singh", "Verma", "Pillai", "Kulkarni", "Bose", "Mehta", "Chauhan", "Naidu", "Ghosh"];
// Unusual / long spellings for advanced records.
const FIRST_ADV = ["Jagadeeshwaran", "Lakshmipathy", "Sreenivasulu", "Bhagyashree", "Venkataramana", "Chandrashekhar", "Mohammed Azharuddin", "Thiruvengadam", "Vijayalakshmi", "Parthasarathy"];
const LAST_ADV = ["Balasubramaniam", "Raghunathan", "Chakraborty", "Venkatachalam", "Bhattacharjee", "Ramakrishnan", "Subramanyam", "Mukhopadhyay"];
// Near-identical spellings (advanced mismatches).
const NEAR: Record<string, string> = {
  Sreenivasulu: "Srinivasulu", Bhagyashree: "Bhagyasri", Vijayalakshmi: "Vijaylakshmi", Parthasarathy: "Parthasarthy",
  Balasubramaniam: "Balasubramanian", Raghunathan: "Ragunathan", Chakraborty: "Chakravorty", Ramakrishnan: "Ramakrishna",
  Subramanyam: "Subramaniam", Mukhopadhyay: "Mukhopadhaya", Lakshmipathy: "Laxmipathy", Thiruvengadam: "Tiruvengadam",
  Jagadeeshwaran: "Jagadishwaran", Venkataramana: "Venkatramana", Chandrashekhar: "Chandrasekhar", Venkatachalam: "Venkatachallam",
  Bhattacharjee: "Bhattacharya",
};
const BANKS = ["HDFC", "ICIC", "SBIN", "UTIB", "KKBK", "PUNB", "BARB", "CNRB", "IDIB", "INDB", "YESB", "FDRL"];
const LOOK: Record<string, string> = { O: "0", "0": "O", I: "1", "1": "I", S: "5", "5": "S", B: "8", "8": "B" };

export const rngFrom = (seed: number): Rng => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const int = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const pick = <T,>(r: Rng, a: readonly T[]) => a[int(r, 0, a.length - 1)];
const digits = (r: Rng, n: number) => String(int(r, 1, 9)) + Array.from({ length: n - 1 }, () => String(int(r, 0, 9))).join("");
const letters = (r: Rng, n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + int(r, 0, 25))).join("");

/** Indian digit grouping: 1234567.5 → 12,34,567.50 */
export function inr(amount: number): string {
  const [whole, paise] = amount.toFixed(2).split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest ? rest + "," : ""}${last3}.${paise}`;
}

export type BankRecord = { name: string; pan: string; account_number: string; ifsc: string; utr: string; amount: string; txn_date: string };

export function makeRecord(r: Rng, level: Level): BankRecord {
  const adv = level === "advanced";
  const initial = level !== "beginner" && r() < 0.5 ? ` ${letters(r, 1)}.` : "";
  const name = adv ? `${pick(r, FIRST_ADV)}${initial} ${pick(r, LAST_ADV)}` : `${pick(r, FIRST)}${initial} ${pick(r, LAST)}`;
  const accLen = level === "beginner" ? int(r, 9, 11) : level === "intermediate" ? int(r, 11, 14) : int(r, 14, 18);
  // Advanced IFSC branch codes mix letters and look-alike digits (e.g. 0O, 1I).
  const branch = adv
    ? Array.from({ length: 6 }, () => (r() < 0.3 ? pick(r, ["0", "1", "5", "8", "M", "K"]) : String(int(r, 0, 9)))).join("")
    : digits(r, 6);
  const amountValue = level === "beginner" ? int(r, 100, 9999) + int(r, 0, 99) / 100
    : level === "intermediate" ? int(r, 1000, 99999) + int(r, 0, 99) / 100
    : int(r, 100000, 9999999) + int(r, 1, 99) / 100;
  const d = new Date(Date.UTC(int(r, 2024, 2026), int(r, 0, 11), int(r, 1, 28)));
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return {
    name,
    pan: `${letters(r, 3)}P${letters(r, 1)}${digits(r, 4)}${letters(r, 1)}`,
    account_number: digits(r, accLen),
    ifsc: `${pick(r, BANKS)}0${branch}`,
    utr: digits(r, 12),
    amount: level === "beginner" ? amountValue.toFixed(2) : inr(amountValue),
    txn_date: `${dd}/${mm}/${d.getUTCFullYear()}`,
  };
}

export function makeDataEntry(r: Rng, level: Level) {
  const record = makeRecord(r, level);
  return {
    content: { prompt: "Copy every field exactly as printed.", record },
    key: { record },
  };
}

type Pair = { left: string; right: string; match: boolean; difference: string | null };
const line = (rec: BankRecord, amount = rec.amount, name = rec.name, acc = rec.account_number, ifsc = rec.ifsc) =>
  `${name} · A/c ${acc} · IFSC ${ifsc} · Rs ${amount}`;

function changeOneDigit(r: Rng, s: string): string {
  const idx = [...s].map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  const i = pick(r, idx);
  const d = Number(s[i]);
  return s.slice(0, i) + String((d + int(r, 1, 8)) % 10) + s.slice(i + 1);
}
function swapTwo(r: Rng, s: string): string | null {
  const idx: number[] = [];
  for (let i = 0; i < s.length - 1; i++) if (/\d/.test(s[i]) && /\d/.test(s[i + 1]) && s[i] !== s[i + 1]) idx.push(i);
  if (!idx.length) return null;
  const i = pick(r, idx);
  return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
}
function lookAlike(r: Rng, s: string): string | null {
  const idx = [...s].map((c, i) => (LOOK[c] ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const i = pick(r, idx);
  return s.slice(0, i) + LOOK[s[i]] + s.slice(i + 1);
}
function moveDecimal(s: string): string {
  const plain = s.replace(/,/g, "");
  const [w, p] = plain.split(".");
  return `${w.slice(0, -1)}.${w.slice(-1)}${p}`; // 4520.75 → 452.075
}

export function makeMatchPair(r: Rng, level: Level, forceMatch?: boolean): Pair {
  const rec = makeRecord(r, level);
  const left = line(rec);
  const match = forceMatch ?? r() < 0.5;
  if (match) return { left, right: left, match: true, difference: null };
  for (let tries = 0; tries < 20; tries++) {
    const kind = int(r, 0, 2);
    if (level === "beginner") {
      if (kind === 0) {
        const last = rec.name.split(" ").pop()!;
        const other = pick(r, LAST.filter((x) => x !== last));
        return { left, right: line(rec, rec.amount, rec.name.replace(last, other)), match: false, difference: `Surname ${last} vs ${other}` };
      }
      const n = Number(rec.amount.replace(/,/g, ""));
      const other = (n + int(r, 1000, 5000)).toFixed(2);
      return { left, right: line(rec, other), match: false, difference: `Amount ${rec.amount} vs ${other}` };
    }
    if (level === "intermediate") {
      if (kind === 0) { const a = changeOneDigit(r, rec.account_number); return { left, right: line(rec, rec.amount, rec.name, a), match: false, difference: "One digit changed in the account number" }; }
      if (kind === 1) { const a = swapTwo(r, rec.account_number); if (a) return { left, right: line(rec, rec.amount, rec.name, a), match: false, difference: "Two digits swapped in the account number" }; continue; }
      const m = rec.name.match(/ ([A-Z])\. /);
      if (m) return { left, right: line(rec, rec.amount, rec.name.replace(` ${m[1]}.`, "")), match: false, difference: `Initial ${m[1]}. missing` };
      continue;
    }
    // advanced
    if (kind === 0) {
      const target = r() < 0.5 ? "ifsc" : "account";
      const v = lookAlike(r, target === "ifsc" ? rec.ifsc : rec.account_number);
      if (v) return { left, right: target === "ifsc" ? line(rec, rec.amount, rec.name, rec.account_number, v) : line(rec, rec.amount, rec.name, v), match: false, difference: `Look-alike character in the ${target === "ifsc" ? "IFSC" : "account number"}` };
      continue;
    }
    if (kind === 1) {
      const plainLeft = line(rec, rec.amount.replace(/,/g, ""));
      return { left: plainLeft, right: line(rec, moveDecimal(rec.amount)), match: false, difference: "Decimal point moved in the amount" };
    }
    const part = rec.name.split(" ").find((p) => NEAR[p]);
    if (part) return { left, right: line(rec, rec.amount, rec.name.replace(part, NEAR[part])), match: false, difference: `Spelling ${part} vs ${NEAR[part]}` };
  }
  const a = changeOneDigit(r, rec.utr);
  return { left: `${left} · UTR ${rec.utr}`, right: `${left} · UTR ${a}`, match: false, difference: "One digit changed in the UTR" };
}

/** About half match: a shuffled set with exactly floor(n/2) matching pairs. */
export function makeMatchPairs(r: Rng, level: Level, n: number) {
  const flags = Array.from({ length: n }, (_, i) => i < Math.floor(n / 2));
  for (let i = flags.length - 1; i > 0; i--) { const j = int(r, 0, i); [flags[i], flags[j]] = [flags[j], flags[i]]; }
  return flags.map((f) => {
    const p = makeMatchPair(r, level, f);
    return {
      content: { prompt: "Do these two records refer to the same payment?", left: p.left, right: p.right },
      key: { match: p.match, difference: p.difference },
    };
  });
}

/** Bank difficulty a level prefers, then the order to top up from. */
export const LEVEL_DIFFICULTY: Record<Level, ("easy" | "medium" | "hard")[]> = {
  beginner: ["easy", "medium", "hard"],
  intermediate: ["medium", "easy", "hard"],
  advanced: ["hard", "medium", "easy"],
};
export const LEVEL_ORDER: Record<Level, Level[]> = {
  beginner: ["beginner", "intermediate", "advanced"],
  intermediate: ["intermediate", "beginner", "advanced"],
  advanced: ["advanced", "intermediate", "beginner"],
};
/** How many generated vs bank items a section takes. "both" = half generated (rounded up). */
export function splitSource(source: string | null | undefined, n: number) {
  if (source === "generated") return { generated: n, bank: 0 };
  if (source === "both") return { generated: Math.ceil(n / 2), bank: n - Math.ceil(n / 2) };
  return { generated: 0, bank: n };
}
