// Copilot · Rephrase: what the message box's rewrite strip shows, and when a rewrite is asked for. No React (the hook
// useRephrase wraps it), so it is unit-tested with fake timers (rephraseController.test.ts).
// One result per typed text and language; it is shown only while those words are in the box. A response for words no
// longer in the box is kept for later (and shown if the words come back). Nothing is sent from here: take() hands the
// rewrite over.
import type { CopilotError, OrderHint, RephraseResult } from '@/hooks/useCopilotPlaybook';
import { sameText } from '@/lib/copilot/copilotText';
import {
  LOW_LEFT, MAX_ANOTHER, REPHRASE_PAUSE_MS, manualCheck, pauseFor, rephraseKey, shouldAutoRephrase, stillTheRewrite, sameWordsExact, wordCount, type RephraseLang,
} from '@/lib/copilot/rephrase';

export interface RephraseView {
  status: 'idle' | 'loading' | 'ready' | 'same' | 'blocked' | 'unclear' | 'error' | 'stopped';
  /** The typed words this is for (it is shown only while they are still in the box). */
  forText: string;
  text: string | null;
  callId: string | null;
  language: 'en' | 'hi' | null;
  warnings: Array<{ code: string; label: string }>;
  reason: string | null;
  message: string | null;
  /** Rewrites already shown for these words in this language ("Another" avoids them). */
  shown: string[];
  /** "Another" may still be asked for these words. */
  canAnother: boolean;
  /** Rewrites left today, once only a few are left (else null). */
  left: number | null;
}

export const IDLE: RephraseView = {
  status: 'idle', forText: '', text: null, callId: null, language: null, warnings: [], reason: null, message: null, shown: [], canAnother: false, left: null,
};

/** Why a rewrite was held back, as the strip says it. */
export const heldBackText = (reason: string | null) => `Rewrite held back: ${(reason ?? 'it did not pass the checks').replace(/^It /, 'it ')}.`;

/** The one short line a screen reader hears for a state of the strip. */
export function rephraseAnnouncement(v: RephraseView): string {
  switch (v.status) {
    case 'loading': return 'Rewording';
    case 'ready': return `Rewrite ready${v.warnings.length ? ', with a warning' : ''}. Tab to use it, Escape to hide it.`;
    case 'same': return 'Reads well as it is.';
    case 'unclear': return 'Nothing to suggest.';
    case 'blocked': return heldBackText(v.reason);
    case 'error': return 'Could not reword it.';
    case 'stopped': return v.message ?? 'Rewording stopped.';
    default: return '';
  }
}

/** The strip's line for an error: "Could not reword it: The AI did not answer." (the strip has its own Try again). */
export function errorLine(message: string | null): string {
  const m = (message || '').replace(/\s*Try again\.?\s*$/i, '').trim();
  return m && m !== 'Could not reword it' ? `Could not reword it: ${m}` : 'Could not reword it.';
}

/** How a rewrite was asked for: after a pause on its own, the ✨ button, "Another", or the language button. */
export type RephraseMode = 'auto' | 'manual' | 'another' | 'lang';
export type RephraseApi = (body: {
  orderNumber: string; exchangeAccountId?: string | null; text: string; lang?: RephraseLang; avoid?: string[]; hint?: OrderHint; mode?: RephraseMode;
}) => Promise<RephraseResult>;

export interface RephraseSettings { enabled: boolean; auto: boolean; orderNumber: string; exchangeAccountId: string | null }

/** Why the ✨ button did nothing: there is too little or too much to reword, or rewording is off. */
export type AskResult = 'asked' | 'short' | 'long' | 'off';

export class RephraseController {
  private view: RephraseView = IDLE;
  private settings: RephraseSettings = { enabled: false, auto: false, orderNumber: '', exchangeAccountId: null };
  private text = '';
  private cache = new Map<string, RephraseResult>();
  /** Per words and language: the rewrites shown, and how many times "Another" was asked. */
  private shownBy = new Map<string, string[]>();
  private triesBy = new Map<string, number>();
  private seq = 0;
  private lastKey: string | null = null;
  private dismissed = new Set<string>();
  private autoCount = 0;
  private lastAutoText: string | null = null;
  private placed: string | null = null;
  private stopped: string | null = null;
  private left: number | null = null;
  /** The language picked with the strip's language button (for this chat); otherwise the chat decides. */
  private lang: RephraseLang = 'auto';
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The latest order details from the screen (sent with each request). */
  hint: OrderHint = {};
  /** What a rewrite is checked against, as the screen knows it (the order's status and KYC, the latest message, the
   *  Copilot panel's request): when it changes, rewrites kept from before are asked again, because the checks depend on
   *  the chat's step ("details shortly" is fine once the client can pay, held back during KYC). */
  context = '';
  private cacheContext = '';

  constructor(private api: RephraseApi, private onView: (v: RephraseView) => void, private pauseMs = REPHRASE_PAUSE_MS) {}

  private show(v: RephraseView) { this.view = v; this.onView(v); }
  private freshen() { if (this.context !== this.cacheContext) { this.cache.clear(); this.cacheContext = this.context; } }
  private clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  private isPlaced(text: string) { return this.placed !== null && sameText(text, this.placed); }
  private lowLeft() { return this.left !== null && this.left <= LOW_LEFT ? this.left : null; }

  private viewFor(r: RephraseResult, forText: string, key: string, message: string | null = null): RephraseView {
    const ok = r.status === 'ok' && !!r.text;
    return {
      status: r.status === 'ok' ? (ok ? 'ready' : 'unclear') : r.status, forText, text: ok ? r.text : null, callId: r.callId, language: r.language,
      warnings: r.warnings ?? [], reason: r.reason, message, shown: this.shownBy.get(key) ?? [],
      canAnother: ok && (this.triesBy.get(key) ?? 0) < MAX_ANOTHER, left: this.lowLeft(),
    };
  }

  /** Who may reword and how; a different chat starts from nothing. */
  configure = (s: RephraseSettings) => {
    if (s.orderNumber !== this.settings.orderNumber) {
      this.clearTimer();
      this.cache.clear();
      this.shownBy.clear();
      this.triesBy.clear();
      this.dismissed.clear();
      this.seq += 1;
      this.lastKey = null;
      this.autoCount = 0;
      this.lastAutoText = null;
      this.placed = null;
      this.stopped = null;
      this.lang = 'auto';
      this.text = '';
      if (this.view !== IDLE) this.show(IDLE);
    }
    this.settings = s;
  };

  /** Every change of the box: a result for other words goes; a pause asks for a new one when it is worth a call. */
  setText = (text: string) => {
    this.text = text;
    this.clearTimer();
    this.freshen();
    if (this.view.status !== 'idle' && !sameWordsExact(this.view.forText, text)) {
      this.seq += 1;
      this.show(IDLE);
    }
    if (!text.trim()) { this.autoCount = 0; this.lastAutoText = null; this.placed = null; return; }
    // Text the screen placed stops being the screen's once it is mostly gone (another message typed over it).
    if (this.placed !== null && wordCount(text) >= 3 && !stillTheRewrite(text, this.placed)) this.placed = null;
    const s = this.settings;
    // Words already answered come back from what was kept, at no cost (unless waved away, placed by the screen, or the
    // automatic mode is off: then only the ✨ button shows anything).
    // A word an input method is still composing counts as typed: the pause after it is the pause that matters (phone
    // keyboards keep the last word composing until a space).
    const key = rephraseKey(text.trim(), this.lang);
    const kept = s.enabled && s.auto && this.cache.has(key) && !this.dismissed.has(key) && !this.isPlaced(text);
    if (!kept && !shouldAutoRephrase(text, {
      enabled: s.enabled, auto: s.auto, stopped: this.stopped, placed: this.placed, lastKey: this.lastKey,
      dismissed: this.dismissed, autoCount: this.autoCount, lastAutoText: this.lastAutoText, lang: this.lang,
    })) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (sameWordsExact(this.text, text)) void this.run(text.trim(), 'auto');
    }, kept ? Math.min(this.pauseMs, 600) : pauseFor(this.autoCount, this.pauseMs));
  };

  private remember(key: string, text: string) {
    const list = (this.shownBy.get(key) ?? []).filter((x) => !sameText(x, text));
    this.shownBy.set(key, [...list, text].slice(-(MAX_ANOTHER + 1)));
  }

  private async run(forText: string, mode: RephraseMode) {
    this.freshen();
    const lang = this.lang;
    const context = this.context;
    const key = rephraseKey(forText, lang);
    this.lastKey = key;
    const kept = this.cache.get(key);
    // What was kept answers again, except "Another" and a ✨ press on words the Copilot could not read before.
    if (kept && mode !== 'another' && !(mode === 'manual' && kept.status === 'unclear')) { this.show(this.viewFor(kept, forText, key)); return; }
    if (mode === 'auto') { this.autoCount += 1; this.lastAutoText = forText; }
    if (mode === 'another') this.triesBy.set(key, (this.triesBy.get(key) ?? 0) + 1);
    const my = ++this.seq;
    const order = this.settings.orderNumber;
    this.show({ ...IDLE, status: 'loading', forText, shown: this.shownBy.get(key) ?? [], left: this.lowLeft() });
    try {
      const r = await this.api({
        orderNumber: order, exchangeAccountId: this.settings.exchangeAccountId, text: forText, lang, avoid: this.shownBy.get(key) ?? [], hint: this.hint, mode,
      });
      if (order !== this.settings.orderNumber) return;
      if (typeof r.left === 'number') this.left = r.left;
      // The chat moved on while it was asked (a new message, another step): checked for the old one, so neither kept nor shown.
      if (this.context !== context) {
        if (my === this.seq && this.view.status === 'loading') this.show(IDLE);
        return;
      }
      let shown = r, message: string | null = null;
      if (r.status === 'ok' && r.text) {
        this.cache.set(key, r);
        this.remember(key, r.text);
        // Kept under the language it came in too, so switching back to it costs nothing.
        const resolved = lang === 'auto' && r.language ? rephraseKey(forText, r.language) : null;
        if (resolved && !this.cache.has(resolved)) { this.cache.set(resolved, r); this.remember(resolved, r.text); }
      } else if (mode === 'another' && kept?.status === 'ok') {
        // "Another" that gave nothing usable keeps the rewrite already on show.
        shown = kept;
        message = r.status === 'blocked' ? 'The other wording was held back; this one passed the checks.' : 'No other wording this time.';
      } else if ((r.status === 'same' || r.status === 'unclear') && kept?.status !== 'ok') {
        this.cache.set(key, r);
      }
      if (!sameWordsExact(this.text, forText)) return;
      // A late answer for the words in the box (they were edited and put back) shows when nothing else is on show.
      if (my !== this.seq && !(this.view.status === 'idle' && !this.dismissed.has(key) && !this.isPlaced(this.text) && key === rephraseKey(this.text.trim(), this.lang))) return;
      this.show(this.viewFor(shown, forText, key, message));
    } catch (e) {
      if (order !== this.settings.orderNumber) return;
      const err = e as CopilotError;
      if (err?.code === 'auto_off' && mode === 'auto') {
        // Automatic rewording was switched off meanwhile: only the ✨ button asks from now on (nothing to show).
        this.settings = { ...this.settings, auto: false };
        if (my === this.seq && this.view.status === 'loading') this.show(IDLE);
        return;
      }
      if (err?.code === 'daily_limit' || err?.code === 'monthly_cap' || err?.status === 403) {
        // Stopped for this chat even when the words changed meanwhile, so no more calls are made only to be refused.
        this.stopped = err?.status === 403
          ? (err?.message && err.message !== 'not_allowed' ? err.message : 'Rewording is not switched on for you.')
          : (err?.message || 'No rewrites left for now.');
        this.clearTimer();
        // Said at once unless the strip was waved away for the words still in the box (it shows at the next ✨ press).
        const waved = this.dismissed.has(rephraseKey(this.text.trim(), this.lang));
        if (this.text.trim() && (my === this.seq || (this.view.status === 'idle' && !waved))) {
          this.show({ ...IDLE, status: 'stopped', forText: this.text.trim(), message: this.stopped });
        }
        return;
      }
      if (my !== this.seq || !sameWordsExact(this.text, forText)) return;
      this.show({ ...IDLE, status: 'error', forText, message: err?.message || 'Could not reword it' });
    }
  }

  /** The ✨ button: reword what is in the box now. */
  ask = (): AskResult => {
    const t = this.text.trim();
    if (!this.settings.enabled) return 'off';
    const c = manualCheck(t);
    if (c !== 'ok') return c;
    this.clearTimer();
    if (this.stopped) { this.show({ ...IDLE, status: 'stopped', forText: t, message: this.stopped }); return 'asked'; }
    // A ✨ press brings back words that were waved away.
    this.dismissed.delete(rephraseKey(t, this.lang));
    void this.run(t, 'manual');
    return 'asked';
  };

  another = () => {
    const v = this.view;
    if (v.status !== 'ready' || !v.canAnother || !sameWordsExact(this.text, v.forText)) return;
    void this.run(v.forText, 'another');
  };

  /** The same words in the other language (kept for this chat). */
  switchLang = (to: 'en' | 'hi') => {
    this.lang = to;
    const v = this.view;
    if (v.forText && sameWordsExact(this.text, v.forText)) void this.run(v.forText, 'lang');
  };

  dismiss = () => {
    const v = this.view;
    if (v.forText) this.dismissed.add(rephraseKey(v.forText, this.lang));
    this.clearTimer();
    this.seq += 1;
    this.show(IDLE);
  };

  /** The rewrite on show, for the words in the box (null otherwise); it is then text the screen placed. */
  take = (): { text: string; callId: string | null; rough: string } | null => {
    const v = this.view;
    if (v.status !== 'ready' || !v.text || !sameWordsExact(this.text, v.forText)) return null;
    this.placed = v.text;
    return { text: v.text, callId: v.callId, rough: v.forText };
  };

  /** The rewrite in the box was swapped back for the typed words: they are the person's own again (not reworded on their own). */
  untake = (rough: string) => {
    this.placed = null;
    this.dismissed.add(rephraseKey(rough.trim(), this.lang));
  };

  /** Text the screen put in the box (a suggestion, a quick reply): not reworded on its own until the box is emptied. */
  markPlaced = (text: string) => { this.placed = text; };

  dispose = () => { this.clearTimer(); this.seq += 1; };
}
