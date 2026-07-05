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
let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function beep(freq: number, start: number, duration: number) {
  const c = ctx();
  if (!c) return;
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
