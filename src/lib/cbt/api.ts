// Candidate-side (public /test) transport for the Blynk CBT edge functions.
// Candidates are never signed in: every call goes to an edge function with the
// anon apikey plus the attempt token + session nonce minted by cbt-register.
const FUNCTIONS_BASE = 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM';

const TOKEN_KEY = 'cbt.attempt.token';
const NONCE_KEY = 'cbt.attempt.nonce';

export type CbtSession = { token: string; nonce: string };

export function saveSession(token: string, nonce: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(NONCE_KEY, nonce);
}

export function loadSession(): CbtSession | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const nonce = sessionStorage.getItem(NONCE_KEY);
  return token && nonce ? { token, nonce } : null;
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(NONCE_KEY);
}

export class CbtError extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;
  constructor(code: string, message: string, status: number, extra: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export type CbtCallOptions = { authed?: boolean; keepalive?: boolean; signal?: AbortSignal };

export async function cbtCall<T = any>(
  fn: string,
  body: Record<string, unknown> = {},
  opts: CbtCallOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  };
  if (opts.authed !== false) {
    const session = loadSession();
    if (!session) throw new CbtError('no_token', 'Your test session has ended. Please contact HR.', 401, {});
    headers['x-attempt-token'] = session.token;
    headers['x-session-nonce'] = session.nonce;
  }

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: opts.keepalive,
      signal: opts.signal,
    });
  } catch (e) {
    throw new CbtError('network', 'Your connection dropped. We will keep retrying.', 0, {});
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || payload?.ok === false) {
    throw new CbtError(
      payload?.code ?? 'server_error',
      payload?.message ?? 'Something went wrong. Please try again.',
      res.status,
      payload ?? {},
    );
  }
  return payload as T;
}

// ---------- clock skew ----------
// The server stamps every payload with `server_now`; deadlines are server truth,
// so we track the offset and never trust the device clock on its own.
let clockOffsetMs = 0;

export function noteServerNow(serverNow?: string | null) {
  if (!serverNow) return;
  const t = new Date(serverNow).getTime();
  if (Number.isFinite(t)) clockOffsetMs = t - Date.now();
}

export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

export function secondsLeft(deadlineAt?: string | null): number | null {
  if (!deadlineAt) return null;
  const end = new Date(deadlineAt).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - serverNow()) / 1000));
}

export function formatClock(totalSeconds: number | null): string {
  if (totalSeconds === null) return '--:--';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
