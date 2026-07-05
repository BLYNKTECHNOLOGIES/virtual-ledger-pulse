// Shared logic for the AI Copilot v2 (train + suggest).
// Pure, dependency-free helpers: situation classification, language detection,
// and embedding via the Lovable AI gateway (openai/text-embedding-3-small = 1536d,
// matching the copilot_exemplars.embedding vector(1536) column).

export const SITUATION_CLASSES = [
  "payment_claim",
  "utr_request",
  "delay",
  "wrong_amount",
  "release_pressure",
  "appeal",
  "greeting",
  "closing",
  "other",
] as const;

export type SituationClass = (typeof SITUATION_CLASSES)[number];

// Keyword rules — evaluated top-to-bottom, first match wins. Lowercased input.
const RULES: Array<{ cls: SituationClass; kws: RegExp }> = [
  { cls: "appeal", kws: /\b(appeal|dispute|complaint|complain|raise\s*a\s*case|customer\s*service|report\s*you|scam|fraud|cheat|police)\b/i },
  { cls: "wrong_amount", kws: /\b(wrong\s*amount|less\s*amount|short|kam\s*(paise|amount)|extra\s*amount|zyada|overpaid|underpaid|amount\s*(is\s*)?(wrong|different|mismatch)|galat\s*amount)\b/i },
  { cls: "utr_request", kws: /\b(utr|reference\s*(no|number)|txn\s*id|transaction\s*id|rrn|ref\s*no|reference\s*id|screenshot|proof|receipt|slip)\b/i },
  { cls: "release_pressure", kws: /\b(release|releas|jaldi|hurry|fast|quick|kab\s*(karoge|hoga)|waiting|kitni\s*der|abhi\s*karo|do\s*it\s*now|coins?\s*(de|do|release)|unfreeze)\b/i },
  { cls: "payment_claim", kws: /\b(paid|payment\s*(done|sent|complete)|sent\s*(the\s*)?(money|payment)|paisa\s*(bhej|de)\s*diya|kar\s*diya|transferred|maine\s*bhej|payment\s*ho\s*gaya|done\s*payment)\b/i },
  { cls: "delay", kws: /\b(delay|late|pending|stuck|not\s*yet|abhi\s*tak\s*nahi|taking\s*(too\s*)?long|slow|wait\s*kar|der\s*ho)\b/i },
  { cls: "closing", kws: /\b(thank|thanks|thankyou|dhanyavad|shukriya|welcome|bye|done\s*deal|good\s*(day|bye)|nice\s*(doing|trade)|received\s*(coins|payment))\b/i },
  { cls: "greeting", kws: /\b(hi|hello|hey|hii+|namaste|namaskar|good\s*(morning|afternoon|evening)|hlo|helo)\b/i },
];

export function classifySituation(text: string | null | undefined): SituationClass {
  const t = (text || "").toLowerCase().trim();
  if (!t) return "other";
  for (const r of RULES) if (r.kws.test(t)) return r.cls;
  return "other";
}

// Rough language heuristic: en / hi (Devanagari) / hinglish (roman Hindi tokens).
const HINGLISH_TOKENS = /\b(hai|hain|kya|kaise|karo|kar|kiya|diya|nahi|nahin|paisa|paise|bhai|bhej|kab|abhi|jaldi|ho|hoga|hua|mera|meri|aap|tum|thoda|kitna|kitni|acha|theek|de|do|le|lo|wala|karna|raha|rahe|rhi)\b/i;

export function detectLanguage(text: string | null | undefined): "en" | "hi" | "hinglish" {
  const t = (text || "").trim();
  if (!t) return "en";
  if (/[\u0900-\u097F]/.test(t)) return "hi"; // Devanagari
  if (HINGLISH_TOKENS.test(t)) return "hinglish";
  return "en";
}

// Embed a single string. Returns null on any failure so callers can degrade to
// text/trigram-only ranking (embeddings are best-effort, never fatal).
export async function embedCopilot(text: string): Promise<number[] | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key || !text?.trim()) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Lovable-API-Key": key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const vec = data?.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length === 1536 ? vec : null;
  } catch {
    return null;
  }
}

export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
