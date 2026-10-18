// Copilot · Rephrase: pure helpers for the order chat's message box. No React, no network (rephrase.test.ts).
// The words typed are reworded only when it is worth a call: after a pause, a few words of the person's own, not
// already asked for, never while the box holds text the screen put there (until it is emptied), and at most a few times
// per message (the ✨ button always works).
/** How long typing must pause before a rewrite is asked for on its own (each later one in a message waits longer). */
export const REPHRASE_PAUSE_MS = 1800;
export const pauseFor = (autoCount: number, base = REPHRASE_PAUSE_MS) => base + (Math.min(autoCount, 3) * base) / 2;
/** New words needed before a later rewrite is asked for on its own (a slow typer's half-sentences are not paid for). */
export const NEW_WORDS_FOR_NEXT = 3;
/** Rewrites asked for on their own per message being typed; after that only the ✨ button asks. */
export const AUTO_PER_MESSAGE = 4;
/** "Another" at most this many times for the same words. */
export const MAX_ANOTHER = 3;
/** The longest text that is reworded (the server refuses longer). */
export const MAX_TYPED = 600;

export type RephraseLang = 'auto' | 'en' | 'hi';

/** The same words asked again (spacing and case aside) are never paid for twice. */
export const rephraseKey = (text: string, lang: RephraseLang) => `${lang}:${text.replace(/\s+/g, ' ').trim().toLowerCase()}`;

const WORD = /\p{L}[\p{L}\p{M}]+/gu;
/** Words of two letters or more, in any script (Devanagari vowel signs are part of the word). */
export const wordCount = (text: string) => (text.match(WORD) ?? []).length;
const wordsOf = (text: string) => (text.toLowerCase().match(WORD) ?? []);

/** Words in `text` that `before` did not have. */
export function newWords(before: string, text: string): number {
  const seen = new Set(wordsOf(before));
  return wordsOf(text).filter((w) => !seen.has(w)).length;
}

/**
 * The sent text is still the rewrite (edited a little), not a different reply typed over it: most of the rewrite's
 * words are in it, and most of its words come from the rewrite.
 */
export function stillTheRewrite(sent: string, rewrite: string): boolean {
  const a = wordsOf(sent), b = wordsOf(rewrite);
  if (!a.length || !b.length) return false;
  const sb = new Set(b), sa = new Set(a);
  const kept = b.filter((w) => sa.has(w)).length / b.length;
  const own = a.filter((w) => sb.has(w)).length / a.length;
  return kept >= 0.6 && own >= 0.6;
}

/** The rewrite in the message box, with the words it was made from (the reason) and the call that made it. */
export interface BoxRewrite {
  callId: string | null;
  text: string;
  /** The words first typed (a rewrite of a rewrite keeps them), and the call made for them. */
  rough: string;
  roughCallId: string | null;
  /** A Copilot suggestion reworded: sending it saves it as that suggestion, edited (not as the person's own words). */
  ofPick: boolean;
}
const sameWords = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/** A rewrite taken from the strip. A rewrite of the rewrite in the box keeps the words first typed and their call. */
export function chainRewrite(
  taken: { callId: string | null; text: string; rough: string }, prev: BoxRewrite | null, ofPick: boolean,
): BoxRewrite {
  const chained = !!prev && sameWords(taken.rough, prev.text);
  return {
    callId: taken.callId,
    text: taken.text,
    rough: chained ? prev!.rough : taken.rough,
    roughCallId: chained ? (prev!.roughCallId ?? prev!.callId) : taken.callId,
    ofPick: ofPick || (chained && prev!.ofPick),
  };
}

/**
 * The rewrite a sent text counts as: only for a send from the box (an Approve button sends the suggestion, not the box),
 * never for a reworded Copilot suggestion (it is saved as that suggestion), and only while what is sent is still mostly it.
 */
export function rewriteSent(msg: string, fromBox: boolean, r: BoxRewrite | null): BoxRewrite | null {
  return fromBox && r && !r.ofPick && stillTheRewrite(msg, r.text) ? r : null;
}

/** Already written as a finished reply ("Sir, … ."): not reworded on its own (the ✨ button still can). */
export function looksFinished(text: string): boolean {
  const t = text.trim();
  return /^(sir|ma'?am|madam|dear|hello|hi|good (morning|afternoon|evening))\b[\s,]/i.test(t) && /[.?!]$/.test(t)
    && !/\b(pls|plz|u|ur|acc|ss|thx|kr|kro|krdo|nhi|nai)\b/i.test(t);
}

/** Enough of the person's own words for a rewrite on its own after a pause. */
export function autoWorthy(text: string): boolean {
  const t = text.trim();
  return t.length >= 12 && t.length <= MAX_TYPED && wordCount(t) >= 3 && !looksFinished(t);
}

/** Enough for the ✨ button: two words, and not longer than the server rewords. */
export function manualCheck(text: string): 'ok' | 'short' | 'long' {
  const t = text.trim();
  if (t.length > MAX_TYPED) return 'long';
  return wordCount(t) >= 2 ? 'ok' : 'short';
}
export const manualWorthy = (text: string) => manualCheck(text) === 'ok';

/** Rewrites left today, shown in the strip once this few are left. */
export const LOW_LEFT = 20;

export interface AutoState {
  enabled: boolean;
  auto: boolean;
  /** Why rewording stopped for now (today's allowance used up, …), or null. */
  stopped: string | null;
  /** Text the screen put in the box (a suggestion, a quick reply, a rewrite that was used), until the box is emptied:
   *  edits to it are not reworded on their own (it was a finished reply). */
  placed: string | null;
  /** The last words asked for, and the ones the person waved away. */
  lastKey: string | null;
  dismissed: ReadonlySet<string>;
  /** Rewrites asked for on their own for this message so far, and the words the last one was for. */
  autoCount: number;
  lastAutoText?: string | null;
  lang: RephraseLang;
}

/** Whether the pause after typing `text` should ask for a rewrite. */
export function shouldAutoRephrase(text: string, s: AutoState): boolean {
  if (!s.enabled || !s.auto || s.stopped || s.placed !== null || !autoWorthy(text)) return false;
  const key = rephraseKey(text, s.lang);
  if (key === s.lastKey || s.dismissed.has(key)) return false;
  if (s.autoCount > 0 && s.lastAutoText && newWords(s.lastAutoText, text) < NEW_WORDS_FOR_NEXT) return false;
  return s.autoCount < AUTO_PER_MESSAGE;
}
