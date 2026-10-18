// Copilot · the order chat's message box: what a key press does with the rewrite strip and the Copilot's suggestions.
// Pure, so the routing is unit-tested (composerKeys.test.ts); ChatPanel performs the action.
export type ComposerKeyAction =
  /** Ctrl/Cmd+Enter (approvers): approve what is in the box without sending it. */
  | 'approve'
  /** …while a rewrite of those words is on show: use it or hide it first (the rough words are no Playbook reply). */
  | 'approve-refused'
  /** Tab: put the rewrite on show in the box. */
  | 'use-rewrite'
  /** Tab (approvers): the next Copilot suggestion (Shift+Tab: the previous one). */
  | 'cycle-picks'
  /** Esc: hide the strip. */
  | 'hide-strip'
  /** Esc while the box still holds the rewrite that was used: bring back the typed words. */
  | 'undo-rewrite'
  /** Esc with nothing else to do: leave the box. The Terminal's own Esc (back to the list) waits for the next press. */
  | 'leave-box'
  /** Enter: send. */
  | 'send'
  /** Esc while an input method is composing a word: it cancels the word; nothing else happens (the box keeps focus). */
  | 'ime'
  /** The key does what it normally does. */
  | null;

export interface ComposerKeyState {
  key: string;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  /** An input method is composing a word: Tab, Esc and Ctrl+Enter belong to it. */
  composing: boolean;
  isApprover: boolean;
  canRephrase: boolean;
  /** What the strip shows: nothing, a rewrite of the words in the box, or anything else (rewording, held back, …). */
  strip: 'idle' | 'ready' | 'other';
  /** The box still holds the rewrite that was used. */
  rewriteInBox: boolean;
  /** Copilot suggestions to cycle: the box is empty or holds the last one inserted. */
  canCyclePicks: boolean;
}

export function composerKeyAction(s: ComposerKeyState): ComposerKeyAction {
  const plain = !s.ctrl && !s.meta && !s.alt;
  if (s.key === 'Enter' && (s.ctrl || s.meta) && s.isApprover) {
    if (s.composing) return null;
    return s.canRephrase && s.strip === 'ready' ? 'approve-refused' : 'approve';
  }
  if (s.key === 'Tab') {
    if (!plain || s.composing) return null;
    if (s.canRephrase && !s.shift && s.strip === 'ready') return 'use-rewrite';
    if (s.isApprover && s.canCyclePicks) return 'cycle-picks';
    return null;
  }
  if (s.key === 'Escape') {
    if (s.composing) return 'ime';
    if (s.canRephrase && s.strip !== 'idle') return 'hide-strip';
    if (s.canRephrase && s.rewriteInBox) return 'undo-rewrite';
    return 'leave-box';
  }
  // Enter sends even while a phone keyboard is composing the last word (unchanged: those keyboards report every key so).
  if (s.key === 'Enter' && !s.shift) return 'send';
  return null;
}
