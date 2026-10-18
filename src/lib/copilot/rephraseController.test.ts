import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RephraseResult } from '@/hooks/useCopilotPlaybook';
import { IDLE, RephraseController, errorLine, type RephraseApi, type RephraseView } from './rephraseController';
import { AUTO_PER_MESSAGE, MAX_ANOTHER } from './rephrase';

const ORDER = '22944071217231917056';
const ok = (text: string, extra: Partial<RephraseResult> = {}): RephraseResult => ({ callId: `c-${text.length}`, status: 'ok', text, language: 'en', warnings: [], reason: null, left: 100, ...extra });

function setup(opts: { enabled?: boolean; auto?: boolean } = {}) {
  const views: RephraseView[] = [];
  const api = vi.fn<RephraseApi>();
  const c = new RephraseController(api, (v) => views.push(v), 1000);
  c.configure({ enabled: opts.enabled ?? true, auto: opts.auto ?? true, orderNumber: ORDER, exchangeAccountId: null });
  const last = () => views.at(-1) ?? IDLE;
  return { c, api, views, last };
}

describe('RephraseController', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('asks once the typing pauses, shows the rewrite, and hands it over for the words in the box', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValue(ok('Sir, IMPS is not available right now. Kindly pay via UPI.'));
    c.setText('imps abhi nahi');
    c.setText('imps abhi nahi, upi pe karo');
    await vi.advanceTimersByTimeAsync(999);
    expect(api).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][0]).toMatchObject({ orderNumber: ORDER, text: 'imps abhi nahi, upi pe karo', lang: 'auto', avoid: [] });
    expect(last().status).toBe('ready');
    expect(c.take()).toEqual({ text: 'Sir, IMPS is not available right now. Kindly pay via UPI.', callId: 'c-57', rough: 'imps abhi nahi, upi pe karo' });
    // The rewrite in the box is the screen's text: not reworded again.
    c.setText('Sir, IMPS is not available right now. Kindly pay via UPI.');
    expect(last().status).toBe('idle');
    await vi.advanceTimersByTimeAsync(5000);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('a result for words no longer in the box is never shown (kept for later); typing again drops a shown one', async () => {
    const { c, api, last } = setup();
    let resolve!: (r: RephraseResult) => void;
    api.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    c.setText('please wait checking payment');
    await vi.advanceTimersByTimeAsync(1000);
    expect(last().status).toBe('loading');
    c.setText('please wait checking payment sir');
    expect(last().status).toBe('idle');
    resolve(ok('Sir, please wait while we check the payment.'));
    await vi.advanceTimersByTimeAsync(0);
    expect(last().status).toBe('idle');
    // Back to the earlier words: shown from what was kept, no new call.
    api.mockClear();
    c.setText('please wait checking payment');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ status: 'ready', text: 'Sir, please wait while we check the payment.' });
    c.setText('please wait checking payment!');
    expect(last().status).toBe('idle');
  });

  it('never asks on its own for short text, a finished reply, text the screen placed, words waved away, or when off', async () => {
    const { c, api } = setup();
    for (const t of ['pls wait', 'Sir, please wait while we check your payment.']) { c.setText(t); await vi.advanceTimersByTimeAsync(2000); }
    c.markPlaced('Kindly share your Aadhaar card');
    c.setText('Kindly share your Aadhaar card');
    await vi.advanceTimersByTimeAsync(2000);
    c.setText('Kindly share your Aadhaar card and PAN'); // an edited quick reply: still the screen's text
    await vi.advanceTimersByTimeAsync(2000);
    expect(api).not.toHaveBeenCalled();
    c.setText('');
    api.mockResolvedValue(ok('Sir, kindly share your Aadhaar card, front and back.'));
    c.setText('Kindly share your Aadhaar card front back');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).toHaveBeenCalledTimes(1);
    c.dismiss();
    c.setText('Kindly share your Aadhaar card front back ');
    await vi.advanceTimersByTimeAsync(2000);
    expect(api).toHaveBeenCalledTimes(1);
    const off = setup({ auto: false });
    off.c.setText('imps abhi nahi, upi pe karo');
    await vi.advanceTimersByTimeAsync(2000);
    expect(off.api).not.toHaveBeenCalled();
  });

  it('asks on its own at most a few times per message, each later one after a longer pause and a few new words; ✨ still works', async () => {
    const { c, api } = setup();
    api.mockImplementation(async (b) => ok(`Sir, ${b.text}.`));
    c.setText('imps abhi nahi hai');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).toHaveBeenCalledTimes(1);
    c.setText('imps abhi nahi hai upi'); // one new word: not worth another call
    await vi.advanceTimersByTimeAsync(5000);
    expect(api).toHaveBeenCalledTimes(1);
    const w1 = 'imps abhi nahi hai upi pe karo', w2 = `${w1} turant sir please`, w3 = `${w2} warna order cancel`, w4 = `${w3} ho jayega phir`;
    const words = [w1, w2, w3, w4];
    c.setText(words[0]);
    await vi.advanceTimersByTimeAsync(1499);
    expect(api).toHaveBeenCalledTimes(1); // the second waits 1.5× the pause
    await vi.advanceTimersByTimeAsync(1);
    expect(api).toHaveBeenCalledTimes(2);
    for (const w of words.slice(1)) { c.setText(w); await vi.advanceTimersByTimeAsync(3000); }
    expect(api).toHaveBeenCalledTimes(AUTO_PER_MESSAGE);
    expect(c.ask()).toBe('asked');
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(AUTO_PER_MESSAGE + 1);
    c.setText('');
    c.setText('new message for the client');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).toHaveBeenCalledTimes(AUTO_PER_MESSAGE + 2);
  });

  it('the ✨ button needs two words and the feature switched on; it never waits for the pause', async () => {
    const { c, api } = setup({ auto: false });
    c.setText('wait');
    expect(c.ask()).toBe('short');
    c.setText('पैसे भेज दो'); // Devanagari vowel signs are part of the words
    api.mockResolvedValue(ok('Sir, please send the money.'));
    expect(c.ask()).toBe('asked');
    c.setText(`pls wait ${'x'.repeat(600)}`);
    expect(c.ask()).toBe('long');
    api.mockResolvedValue(ok('Sir, please wait.'));
    c.setText('pls wait');
    expect(c.ask()).toBe('asked');
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(2);
    const off = setup({ enabled: false });
    off.c.setText('pls wait');
    expect(off.c.ask()).toBe('off');
  });

  it('"Another" sends the rewrites shown so far, up to the limit; the language button asks again in that language and keeps it', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValueOnce(ok('Sir, please wait a moment.')).mockResolvedValueOnce(ok('Sir, kindly bear with us for a moment.'))
      .mockResolvedValueOnce(ok('Sir, one moment please.'));
    c.setText('pls wait a moment');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    c.another();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.mock.calls[1][0].avoid).toEqual(['Sir, please wait a moment.']);
    c.another();
    await vi.advanceTimersByTimeAsync(0);
    expect(last().shown).toHaveLength(MAX_ANOTHER);
    expect(last().canAnother).toBe(true);
    api.mockResolvedValueOnce(ok('Sir, kindly wait a moment.'));
    c.another();
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(4);
    expect(last().canAnother).toBe(false); // three "Another"s for these words
    c.another();
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(4);
    // Typing and putting the words back does not start the count again.
    c.setText('pls wait a moment!');
    c.setText('pls wait a moment');
    await vi.advanceTimersByTimeAsync(1000);
    expect(last()).toMatchObject({ status: 'ready', canAnother: false });
    api.mockResolvedValueOnce(ok('Sir, bas ek minute.', { language: 'hi' }));
    c.switchLang('hi');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.mock.calls[4][0]).toMatchObject({ lang: 'hi', avoid: [] });
    expect(last()).toMatchObject({ status: 'ready', language: 'hi' });
  });

  it('held back, unclear and "same" are shown as such; errors offer a retry; today\'s allowance stops it until the next chat', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValueOnce({ callId: 'b', status: 'blocked', text: null, language: 'en', warnings: [], reason: 'It changed a number', left: 9 });
    c.setText('wait 10 min checking');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ status: 'blocked', reason: 'It changed a number', left: 9 });
    expect(c.take()).toBeNull();
    api.mockRejectedValueOnce(Object.assign(new Error('Network down'), { code: null, status: 0 }));
    c.setText('wait 10 min checking pls');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ status: 'error', message: 'Network down' });
    api.mockRejectedValueOnce(Object.assign(new Error("Today's 200 rewrites are used up; more tomorrow."), { code: 'daily_limit', status: 429 }));
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ status: 'stopped', message: "Today's 200 rewrites are used up; more tomorrow." });
    c.setText('another long message for the client here');
    await vi.advanceTimersByTimeAsync(2000);
    expect(api).toHaveBeenCalledTimes(3);
    c.configure({ enabled: true, auto: true, orderNumber: '99944071217231917056', exchangeAccountId: null });
    api.mockResolvedValueOnce(ok('Sir, noted.'));
    c.setText('another long message for the client here');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).toHaveBeenCalledTimes(4);
  });

  it('a response from the previous chat is never shown in the next one', async () => {
    const { c, api, last } = setup();
    let resolve!: (r: RephraseResult) => void;
    api.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    c.setText('imps abhi nahi, upi pe karo');
    c.ask();
    c.configure({ enabled: true, auto: true, orderNumber: '99944071217231917056', exchangeAccountId: null });
    c.setText('imps abhi nahi, upi pe karo');
    resolve(ok('Sir, IMPS is not available.'));
    await vi.advanceTimersByTimeAsync(0);
    expect(last().status).not.toBe('ready');
  });

  it('"Another" that gives nothing usable keeps the rewrite on show; a ✨ press asks again after "unclear"', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValueOnce(ok('Sir, please wait a moment.'))
      .mockResolvedValueOnce({ callId: 'b', status: 'blocked', text: null, language: 'en', warnings: [], reason: 'It changed a number', left: 50 });
    c.setText('pls wait a moment');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    c.another();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ status: 'ready', text: 'Sir, please wait a moment.', message: 'The other wording was held back; this one passed the checks.' });
    c.setText('');
    api.mockResolvedValueOnce({ callId: 'u', status: 'unclear', text: null, language: 'en', warnings: [], reason: null, left: 50 })
      .mockResolvedValueOnce(ok('Sir, please share the UTR.'));
    c.setText('utr bhejo jaldi');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(last().status).toBe('unclear');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(4);
    expect(last()).toMatchObject({ status: 'ready', text: 'Sir, please share the UTR.' });
  });

  it('a rewrite that came back in a language is kept under it, so switching back costs nothing', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValueOnce(ok('Sir, please wait.', { language: 'en' })).mockResolvedValueOnce(ok('Sir, thoda wait kijiye.', { language: 'hi' }));
    c.setText('pls wait thoda');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    c.switchLang('hi');
    await vi.advanceTimersByTimeAsync(0);
    c.switchLang('en');
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(2);
    expect(last()).toMatchObject({ status: 'ready', text: 'Sir, please wait.' });
  });

  it('today\'s allowance stops rewording even when the words changed while it was asked; few left are shown', async () => {
    const { c, api, last } = setup();
    let reject!: (e: unknown) => void;
    api.mockImplementationOnce(() => new Promise((_r, j) => { reject = j; }));
    c.setText('please wait checking payment');
    await vi.advanceTimersByTimeAsync(1000);
    c.setText('please wait checking payment sir');
    reject(Object.assign(new Error("Today's 200 rewrites are used up; more tomorrow."), { code: 'daily_limit', status: 429 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ status: 'stopped', forText: 'please wait checking payment sir' });
    c.setText('');
    c.setText('a completely different long message here');
    await vi.advanceTimersByTimeAsync(5000);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('a late answer for words put back in the box is shown (unless waved away)', async () => {
    const { c, api, last } = setup();
    let resolve!: (r: RephraseResult) => void;
    api.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    c.setText('imps abhi nahi milega');
    await vi.advanceTimersByTimeAsync(1000);
    c.setText('imps abhi nahi milega x');
    c.setText('imps abhi nahi milega');
    resolve(ok('Sir, IMPS is not available right now.'));
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ status: 'ready', text: 'Sir, IMPS is not available right now.' });
  });

  it('a word an input method is still composing counts as typed: the pause asks, and a ✨ answer always shows', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValue(ok('Sir, please wait a moment.'));
    c.setText('pls wait thoda sa'); // the last word still composing on a phone keyboard
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).toHaveBeenCalledTimes(1);
    expect(last().status).toBe('ready');
  });

  it('with automatic rewording off, words already answered do not pop up again on their own', async () => {
    const { c, api, last } = setup({ auto: false });
    api.mockResolvedValue(ok('Sir, please wait a moment.'));
    c.setText('pls wait a moment');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    c.setText('pls wait a moment!');
    c.setText('pls wait a moment');
    await vi.advanceTimersByTimeAsync(3000);
    expect(last().status).toBe('idle');
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(1); // the ✨ button shows it again from what was kept
    expect(last().status).toBe('ready');
  });

  it('Esc while rewording, then today\'s allowance runs out: the strip stays hidden for those words', async () => {
    const { c, api, last } = setup();
    let reject!: (e: unknown) => void;
    api.mockImplementationOnce(() => new Promise((_r, j) => { reject = j; }));
    c.setText('pls wait checking the payment');
    c.ask();
    c.dismiss();
    reject(Object.assign(new Error("Today's 200 rewrites are used up; more tomorrow."), { code: 'daily_limit', status: 429 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(last().status).toBe('idle');
    c.ask();
    expect(last()).toMatchObject({ status: 'stopped', message: "Today's 200 rewrites are used up; more tomorrow." });
  });

  it('automatic rewording switched off on the server: no more automatic requests in this chat', async () => {
    const { c, api, last } = setup();
    api.mockRejectedValueOnce(Object.assign(new Error('Automatic rewording is off.'), { code: 'auto_off', status: 409 }));
    c.setText('imps abhi nahi milega upi use karo');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.mock.calls[0][0].mode).toBe('auto');
    expect(last().status).toBe('idle');
    c.setText('imps abhi nahi milega upi use karo jaldi please sir');
    await vi.advanceTimersByTimeAsync(5000);
    expect(api).toHaveBeenCalledTimes(1);
    api.mockResolvedValueOnce(ok('Sir, IMPS is not available.'));
    c.ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.mock.calls[1][0].mode).toBe('manual');
  });

  it('text the screen placed is no longer the screen\'s once another message is typed over it', async () => {
    const { c, api } = setup();
    api.mockResolvedValue(ok('Sir, please share your UTR.'));
    c.markPlaced('Kindly share your Aadhaar card front and back');
    c.setText('Kindly share your Aadhaar card front and back');
    await vi.advanceTimersByTimeAsync(3000);
    expect(api).not.toHaveBeenCalled();
    c.setText('utr number bhejo jaldi sir please');
    await vi.advanceTimersByTimeAsync(2000);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('the typed words put back after a rewrite are the person\'s own again, and not reworded on their own', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValue(ok('Sir, IMPS is not available right now.'));
    c.setText('imps abhi nahi milega');
    await vi.advanceTimersByTimeAsync(1000);
    const t = c.take()!;
    c.setText(t.text);
    c.untake(t.rough);
    c.setText(t.rough);
    await vi.advanceTimersByTimeAsync(5000);
    expect(last().status).toBe('idle');
    c.setText(`${t.rough} upi pe pay karo sir`);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api).toHaveBeenCalledTimes(2); // their own words again: reworded after the pause
  });

  it('an error line never says "Try again" twice (the strip has its own button)', () => {
    expect(errorLine('The AI did not answer. Try again.')).toBe('Could not reword it: The AI did not answer.');
    expect(errorLine('Suggestions are taking longer than usual. Try again')).toBe('Could not reword it: Suggestions are taking longer than usual.');
    expect(errorLine('Could not reword it')).toBe('Could not reword it.');
    expect(errorLine(null)).toBe('Could not reword it.');
    expect(errorLine('Try again.')).toBe('Could not reword it.');
  });

  it('kept rewrites are asked again once the chat moves on (new message, status, KYC or step); a late answer for the old one is dropped', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValue(ok('Sir, we will share the payment details shortly.'));
    c.context = 'TRADING|2|m1|r1';
    c.setText('details share karte hai thodi der me');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).toHaveBeenCalledTimes(1);
    expect(last().status).toBe('ready');
    // Same words, same chat: from what was kept, no new call.
    c.setText('');
    c.setText('details share karte hai thodi der me');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).toHaveBeenCalledTimes(1);
    // An approver moves the chat back to KYC (a new panel request): the same words are checked again.
    c.setText('');
    c.context = 'TRADING|1|m1|r2';
    api.mockResolvedValue(ok('x', { status: 'blocked', text: null, reason: 'It asked the client to pay, which you did not say' }));
    c.setText('details share karte hai thodi der me');
    expect(c.ask()).toBe('asked');
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(2);
    expect(last().status).toBe('blocked');
    // An answer that comes back after the chat moved on is neither kept nor shown.
    let resolve: (r: RephraseResult) => void = () => {};
    api.mockImplementation(() => new Promise((r) => { resolve = r; }));
    c.setText('payment check kar rahe hai');
    expect(c.ask()).toBe('asked');
    expect(last().status).toBe('loading');
    c.context = 'TRADING|1|m2|r2';
    resolve(ok('Sir, we are checking the payment.'));
    await vi.advanceTimersByTimeAsync(0);
    expect(last().status).toBe('idle');
    expect(c.take()).toBeNull();
  });

  it('words that differ only in case are other words (a wallet address or reference differs by case alone)', async () => {
    const { c, api, last } = setup();
    api.mockResolvedValue(ok('Sir, please send the USDT to TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE.'));
    c.setText('usdt TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE pe bhejo');
    await vi.advanceTimersByTimeAsync(1000);
    expect(last().status).toBe('ready');
    c.setText('usdt TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSe pe bhejo');
    expect(last().status).toBe('idle');
    expect(c.take()).toBeNull();
  });
});

