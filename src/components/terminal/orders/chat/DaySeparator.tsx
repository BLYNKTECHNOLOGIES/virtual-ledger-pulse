/**
 * WhatsApp/Binance-style day dividers for chat transcripts.
 * Day boundaries follow IST (Asia/Kolkata), matching every other time the
 * Terminal shows. "Today" / "Yesterday"; anything older shows the full date.
 */

const DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_LABEL_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** IST calendar-day key ("2026-09-19") for a millisecond timestamp, or null. */
export function istDayKey(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return DAY_KEY_FMT.format(new Date(ms));
}

/** "Today" / "Yesterday" / "17 September 2026" — null when the ts is unusable. */
export function daySeparatorLabel(ms: number): string | null {
  const key = istDayKey(ms);
  if (!key) return null;
  if (key === DAY_KEY_FMT.format(new Date())) return 'Today';
  if (key === DAY_KEY_FMT.format(new Date(Date.now() - 86_400_000))) return 'Yesterday';
  return DAY_LABEL_FMT.format(new Date(ms));
}

export function DaySeparator({ ts }: { ts: number }) {
  const label = daySeparatorLabel(ts);
  if (!label) return null;
  return (
    <div className="flex justify-center py-1.5" role="separator" aria-label={label}>
      <span className="text-[9px] t-mono uppercase tracking-wide text-muted-foreground bg-muted/60 border border-border/60 rounded-full px-2.5 py-0.5">
        {label}
      </span>
    </div>
  );
}
