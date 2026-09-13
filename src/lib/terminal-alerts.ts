// Terminal alert primitives — browser notifications, WebAudio beeps, tab title
// + app badge management, and per-type mute preferences (localStorage).
// Purely presentational: no data fetching, no business logic.

export type AlertType = 'orders' | 'messages' | 'appeals';

export interface AlertPrefs {
  master: boolean;
  orders: boolean;
  messages: boolean;
  appeals: boolean;
}

const PREFS_KEY = 'terminal-alert-prefs';
const BASE_TITLE = 'Terminal';

const DEFAULT_PREFS: AlertPrefs = { master: true, orders: true, messages: true, appeals: true };

export function getAlertPrefs(): AlertPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setAlertPrefs(next: AlertPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  // Notify same-tab subscribers (storage event only fires cross-tab).
  window.dispatchEvent(new CustomEvent('terminal-alert-prefs'));
}

export function subscribeAlertPrefs(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener('terminal-alert-prefs', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('terminal-alert-prefs', handler);
    window.removeEventListener('storage', handler);
  };
}

export function isAlertEnabled(prefs: AlertPrefs, type: AlertType): boolean {
  return prefs.master && prefs[type];
}

// ---- WebAudio beeps (no audio assets) ----
// Background-tab requirement: a browser only lets a page make sound after a real
// user gesture, and an AudioContext created/left suspended will silently swallow
// beeps once the tab loses focus. So we (1) unlock the context on the operator's
// first click/keypress inside the terminal, (2) keep it running with an inaudible
// carrier tone so it is never auto-suspended in the background, and (3) re-resume
// on visibility/focus changes. Result: alerts are audible while the operator is in
// another tab or another app, as long as the terminal tab stays open.
let audioCtx: AudioContext | null = null;
let keepAliveStarted = false;

function ctx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Inaudible DC-ish tone that keeps the context alive in background tabs. */
function startKeepAlive(c: AudioContext) {
  if (keepAliveStarted) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(30, c.currentTime);
    gain.gain.setValueAtTime(0.00001, c.currentTime);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    keepAliveStarted = true;
  } catch {
    // ignore
  }
}

/** Prime audio output. Safe to call repeatedly; must run inside a user gesture once. */
export function unlockAlertAudio() {
  const c = ctx();
  if (!c) return;
  startKeepAlive(c);
}

let audioLifecycleBound = false;
/** Bind gesture + visibility listeners that keep alert audio usable in the background. */
export function initAlertAudioLifecycle(): () => void {
  if (typeof window === 'undefined' || audioLifecycleBound) return () => {};
  audioLifecycleBound = true;
  const onGesture = () => unlockAlertAudio();
  const onWake = () => {
    const c = audioCtx;
    if (c && c.state === 'suspended') void c.resume();
  };
  window.addEventListener('pointerdown', onGesture, { capture: true });
  window.addEventListener('keydown', onGesture, { capture: true });
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('focus', onWake);
  return () => {
    audioLifecycleBound = false;
    window.removeEventListener('pointerdown', onGesture, { capture: true } as any);
    window.removeEventListener('keydown', onGesture, { capture: true } as any);
    document.removeEventListener('visibilitychange', onWake);
    window.removeEventListener('focus', onWake);
  };
}

function beep(freq: number, start: number, duration: number) {
  const c = ctx();
  if (!c) return;
  const fire = () => {
    try {
      startKeepAlive(c);
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime + start);
      gain.gain.setValueAtTime(0.0001, c.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.16, c.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
      osc.start(c.currentTime + start);
      osc.stop(c.currentTime + start + duration + 0.02);
    } catch {
      // ignore
    }
  };
  if (c.state === 'suspended') {
    // Resume first, otherwise the scheduled beep is discarded while hidden.
    c.resume().then(fire).catch(() => {});
  } else {
    fire();
  }
}

export function playTone(kind: AlertType) {
  if (kind === 'orders' || kind === 'appeals') {
    // ~880Hz double-blip
    beep(880, 0, 0.12);
    beep(880, 0.16, 0.12);
  } else {
    // ~600Hz single
    beep(600, 0, 0.18);
  }
}


// ---- Browser notification ----
export function fireBrowserNotification(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    const n = new Notification(title, { body, icon: '/favicon.svg', silent: true });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  try {
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

// ---- Tab title + app badge ----
export function setUnreadIndicator(count: number) {
  try {
    document.title = count > 0 ? `(${count}) ${BASE_TITLE}…` : document.title.replace(/^\(\d+\)\s.*$/, BASE_TITLE);
    if (count > 0) {
      document.title = `(${count}) ${BASE_TITLE}…`;
      (navigator as any).setAppBadge?.(count).catch?.(() => {});
    } else {
      document.title = BASE_TITLE;
      (navigator as any).clearAppBadge?.().catch?.(() => {});
    }
  } catch {
    // ignore
  }
}

export function clearUnreadIndicator() {
  setUnreadIndicator(0);
}
