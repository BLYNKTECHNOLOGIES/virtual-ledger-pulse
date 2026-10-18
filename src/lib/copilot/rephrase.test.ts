import { describe, expect, it } from 'vitest';
import {
  AUTO_PER_MESSAGE, autoWorthy, chainRewrite, looksFinished, manualWorthy, newWords, pauseFor, rephraseKey, rewriteSent, shouldAutoRephrase, stillTheRewrite,
  wordCount, type AutoState,
} from './rephrase';

const base: AutoState = { enabled: true, auto: true, stopped: null, placed: null, lastKey: null, dismissed: new Set(), autoCount: 0, lang: 'auto' };

describe('rephrase helpers', () => {
  it('counts words of two letters or more in any script', () => {
    expect(wordCount('imps abhi nahi, upi pe karo')).toBe(6);
    expect(wordCount('ok 5 k')).toBe(1);
    expect(wordCount('भुगतान अभी नहीं')).toBe(3);
    expect(wordCount('पैसे भेज दो')).toBe(3); // vowel signs are part of the word
    expect(wordCount('आप पेमेंट कर दीजिए')).toBe(4);
  });

  it('keys ignore spacing but not case (a wallet address differs by case alone), and differ by language', () => {
    expect(rephraseKey('  pls  wait ', 'auto')).toBe(rephraseKey('pls wait', 'auto'));
    expect(rephraseKey('Pls WAIT', 'auto')).not.toBe(rephraseKey('pls wait', 'auto'));
    expect(rephraseKey('pls wait', 'en')).not.toBe(rephraseKey('pls wait', 'hi'));
  });

  it('a finished reply is not reworded on its own', () => {
    expect(looksFinished('Sir, please wait while we check your payment.')).toBe(true);
    expect(looksFinished("Ma'am, kindly share your Aadhaar.")).toBe(true);
    expect(looksFinished('sir pls wait checking')).toBe(false);
    expect(looksFinished('Sir, pls wait.')).toBe(false);
    expect(looksFinished('Please wait.')).toBe(false);
  });

  it('auto needs a few words of the person\'s own; the button needs two', () => {
    expect(autoWorthy('imps abhi nahi milega')).toBe(true);
    expect(autoWorthy('pls wait')).toBe(false);
    expect(autoWorthy('ok sir done')).toBe(false); // under 12 characters
    expect(autoWorthy('a'.repeat(601))).toBe(false);
    expect(autoWorthy('Sir, please wait while we check your payment.')).toBe(false);
    expect(manualWorthy('pls wait')).toBe(true);
    expect(manualWorthy('wait')).toBe(false);
    expect(manualWorthy('Sir, please wait while we check your payment.')).toBe(true);
  });

  it('asks after a pause only when it is worth a call', () => {
    const t = 'imps abhi nahi milega upi pe karo';
    expect(shouldAutoRephrase(t, base)).toBe(true);
    expect(shouldAutoRephrase(t, { ...base, enabled: false })).toBe(false);
    expect(shouldAutoRephrase(t, { ...base, auto: false })).toBe(false);
    expect(shouldAutoRephrase(t, { ...base, stopped: "Today's rewrites are used up" })).toBe(false);
    expect(shouldAutoRephrase(t, { ...base, placed: ` ${t.toUpperCase()} ` })).toBe(false);
    expect(shouldAutoRephrase(`${t} jaldi`, { ...base, placed: t })).toBe(false); // an edited suggestion or quick reply
    expect(shouldAutoRephrase(t, { ...base, lastKey: rephraseKey(t, 'auto') })).toBe(false);
    expect(shouldAutoRephrase(t, { ...base, lastKey: rephraseKey(t, 'en') })).toBe(true);
    expect(shouldAutoRephrase(t, { ...base, dismissed: new Set([rephraseKey(t, 'auto')]) })).toBe(false);
    expect(shouldAutoRephrase(t, { ...base, autoCount: AUTO_PER_MESSAGE })).toBe(false);
    expect(shouldAutoRephrase(t, { ...base, autoCount: AUTO_PER_MESSAGE - 1 })).toBe(true);
  });

  it('a later automatic rewrite in a message waits longer and needs a few new words', () => {
    expect([0, 1, 2, 3, 4].map((n) => pauseFor(n))).toEqual([1800, 2700, 3600, 4500, 4500]);
    const s1 = { ...base, autoCount: 1, lastAutoText: 'imps abhi nahi milega' };
    expect(shouldAutoRephrase('imps abhi nahi milega upi', s1)).toBe(false);
    expect(shouldAutoRephrase('imps abhi nahi milega upi pe karo', s1)).toBe(true);
    expect(newWords('imps abhi nahi', 'imps abhi nahi milega upi pe')).toBe(3);
  });

  it('a sent text is still the rewrite only when it mostly is', () => {
    const r = 'Sir, IMPS is not available at the moment. Kindly make the payment via UPI.';
    expect(stillTheRewrite(r, r)).toBe(true);
    expect(stillTheRewrite(`${r} Thank you.`, r)).toBe(true);
    expect(stillTheRewrite('Sir, IMPS is not available right now. Please make the payment via UPI only.', r)).toBe(true);
    expect(stillTheRewrite('ok', r)).toBe(false);
    expect(stillTheRewrite('Sir, please share your Aadhaar card front and back first.', r)).toBe(false);
  });

  it('a rewrite of the rewrite keeps the words first typed and their call; a reworded suggestion stays a suggestion', () => {
    const r1 = chainRewrite({ callId: 'c1', text: 'Sir, IMPS is not available.', rough: 'imps nahi hai' }, null, false);
    expect(r1).toEqual({ callId: 'c1', text: 'Sir, IMPS is not available.', rough: 'imps nahi hai', roughCallId: 'c1', ofPick: false });
    const r2 = chainRewrite({ callId: 'c2', text: 'Sir, IMPS is unavailable right now.', rough: 'Sir, IMPS is not available.' }, r1, false);
    expect(r2).toMatchObject({ callId: 'c2', rough: 'imps nahi hai', roughCallId: 'c1' });
    const other = chainRewrite({ callId: 'c3', text: 'Sir, please wait.', rough: 'pls wait' }, r1, false);
    expect(other).toMatchObject({ rough: 'pls wait', roughCallId: 'c3' });
    expect(chainRewrite({ callId: 'c4', text: 'Sir, kindly share the UTR.', rough: 'Sir, please share the UTR thanks' }, null, true).ofPick).toBe(true);
  });

  it('a send counts as the rewrite only from the box, never for a reworded suggestion, and only while it is mostly the rewrite', () => {
    const r = chainRewrite({ callId: 'c1', text: 'Sir, IMPS is not available at the moment. Kindly pay via UPI.', rough: 'imps nahi, upi pe karo' }, null, false);
    expect(rewriteSent(`${r.text} Thank you.`, true, r)).toBe(r);
    expect(rewriteSent(r.text, false, r)).toBeNull();
    expect(rewriteSent('Sir, please share your Aadhaar card first.', true, r)).toBeNull();
    expect(rewriteSent(r.text, true, { ...r, ofPick: true })).toBeNull();
    expect(rewriteSent(r.text, true, null)).toBeNull();
  });
});
