import { describe, expect, it } from 'vitest';
import { composerKeyAction, type ComposerKeyState } from './composerKeys';

const base: ComposerKeyState = {
  key: 'x', shift: false, ctrl: false, meta: false, alt: false, composing: false,
  isApprover: false, canRephrase: true, strip: 'idle', rewriteInBox: false, canCyclePicks: false,
};
const act = (o: Partial<ComposerKeyState>) => composerKeyAction({ ...base, ...o });

describe('composerKeyAction', () => {
  it('Esc hides the strip first, then brings back the typed words, then leaves the box (never two of them at once)', () => {
    expect(act({ key: 'Escape', strip: 'ready' })).toBe('hide-strip');
    expect(act({ key: 'Escape', strip: 'other' })).toBe('hide-strip');
    expect(act({ key: 'Escape', strip: 'ready', rewriteInBox: true })).toBe('hide-strip');
    expect(act({ key: 'Escape', rewriteInBox: true })).toBe('undo-rewrite');
    expect(act({ key: 'Escape' })).toBe('leave-box');
    expect(act({ key: 'Escape', canRephrase: false, rewriteInBox: true })).toBe('leave-box');
    expect(act({ key: 'Escape', composing: true, strip: 'ready' })).toBe('ime');
  });

  it('Tab uses the rewrite on show before cycling the suggestions; Shift+Tab only cycles; modifiers and composing leave Tab alone', () => {
    expect(act({ key: 'Tab', strip: 'ready', isApprover: true, canCyclePicks: true })).toBe('use-rewrite');
    expect(act({ key: 'Tab', isApprover: true, canCyclePicks: true })).toBe('cycle-picks');
    expect(act({ key: 'Tab', shift: true, strip: 'ready', isApprover: true, canCyclePicks: true })).toBe('cycle-picks');
    expect(act({ key: 'Tab', strip: 'ready', composing: true })).toBeNull();
    expect(act({ key: 'Tab', strip: 'ready', ctrl: true })).toBeNull();
    expect(act({ key: 'Tab', strip: 'other' })).toBeNull();
    expect(act({ key: 'Tab', canCyclePicks: true })).toBeNull(); // operators have no suggestions
  });

  it('Ctrl/Cmd+Enter approves for approvers, but not the rough words while their rewrite is on show; for others it sends as before', () => {
    expect(act({ key: 'Enter', ctrl: true, isApprover: true })).toBe('approve');
    expect(act({ key: 'Enter', meta: true, isApprover: true })).toBe('approve');
    expect(act({ key: 'Enter', ctrl: true, isApprover: true, strip: 'ready' })).toBe('approve-refused');
    expect(act({ key: 'Enter', ctrl: true, isApprover: true, strip: 'ready', canRephrase: false })).toBe('approve');
    expect(act({ key: 'Enter', ctrl: true, isApprover: true, composing: true })).toBeNull();
    expect(act({ key: 'Enter', ctrl: true })).toBe('send');
  });

  it('Enter sends (also while a phone keyboard composes the last word); Shift+Enter is a new line', () => {
    expect(act({ key: 'Enter' })).toBe('send');
    expect(act({ key: 'Enter', composing: true })).toBe('send');
    expect(act({ key: 'Enter', shift: true })).toBeNull();
    expect(act({ key: 'a' })).toBeNull();
  });
});
