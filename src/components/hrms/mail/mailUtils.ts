import { format, isToday, isYesterday, isThisYear } from "date-fns";

/** Gmail-style timestamp: time for today, "25 Aug" this year, "25 Aug 2025" older. */
export function mailTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return isThisYear(d) ? format(d, "d MMM") : format(d, "d MMM yyyy");
}

export function mailTimeFull(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return format(d, "EEE, d MMM yyyy 'at' HH:mm");
}

/** Display name for a sender — falls back to the local part of the address. */
export function senderLabel(name?: string | null, address?: string | null): string {
  const n = (name || "").trim().replace(/^"|"$/g, "");
  if (n) return n;
  const a = (address || "").trim();
  if (!a) return "Unknown sender";
  return a.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_TONES = [
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-destructive/15 text-destructive",
  "bg-accent text-accent-foreground",
  "bg-secondary text-secondary-foreground",
];

export function avatarTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Strips a leading chain of Re:/Fwd: prefixes for display. */
export function cleanSubject(subject?: string | null): string {
  const s = (subject || "").replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "").trim();
  return s || subject?.trim() || "(no subject)";
}

export function replySubject(subject?: string | null): string {
  const s = (subject || "").trim();
  return /^re\s*:/i.test(s) ? s : `Re: ${s || "(no subject)"}`;
}

/** Quotes an original message as Gmail does, in plain text. */
export function quoteOriginal(opts: {
  fromName?: string | null;
  fromAddress?: string | null;
  receivedAt?: string | null;
  text?: string | null;
}): string {
  const who = senderLabel(opts.fromName, opts.fromAddress);
  const when = mailTimeFull(opts.receivedAt);
  const body = (opts.text || "").trim().split("\n").map((l) => `> ${l}`).join("\n");
  return `\n\nOn ${when}, ${who} <${opts.fromAddress || ""}> wrote:\n${body}\n`;
}
