// Pure quick-reply templating. Replaces {amount} {orderNo} {name} {upi} tokens with live order values at insert time,
// {greeting} with the time of day in India, and on our buy orders {net_amount} {tds_amount} with what we pay after the
// 1% TDS and the TDS. Unknown/empty tokens are left intact so operators can spot and fill them manually. No side effects.

export interface TemplateOrderValues {
  amount?: number | string | null;
  orderNo?: string | null;
  name?: string | null;
  upi?: string | null;
  /** The order's side (BUY / SELL): the amount after TDS exists only on our buy orders. */
  side?: string | null;
}

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 1% TDS (Section 194S) on our buy orders, to the paisa: tds = round(total × 1%, 2), net = total − tds, as finance books
 * it. The server works it out the same way (copilot-playbook.ts tdsSplit).
 */
export function tdsSplit(amount: number): { tds: number; net: number } | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const paise = Math.round(amount * 100);
  const tdsPaise = Math.round(paise / 100);
  return { tds: tdsPaise / 100, net: (paise - tdsPaise) / 100 };
}

/** "Good morning" / "Good afternoon" / "Good evening" by the hour in India (the server's greetingFor). */
export function greetingFor(date: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(date));
  if (h >= 4 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function fillTemplate(text: string, values: TemplateOrderValues, now: Date = new Date()): string {
  if (!text) return text;
  // "4,500.00" as well as 4500: Indian digit grouping is dropped before reading the number.
  const amount = values.amount === null || values.amount === undefined || values.amount === '' ? null : Number(String(values.amount).replace(/,/g, ''));
  const valid = amount !== null && Number.isFinite(amount);
  const split = valid && String(values.side ?? '').toUpperCase() === 'BUY' ? tdsSplit(amount) : null;
  const map: Record<string, string | undefined> = {
    amount: valid ? money(amount) : undefined,
    orderNo: values.orderNo || undefined,
    name: values.name || undefined,
    upi: values.upi || undefined,
    net_amount: split ? money(split.net) : undefined,
    tds_amount: split ? money(split.tds) : undefined,
    greeting: greetingFor(now),
  };
  return text.replace(/\{(amount|orderNo|name|upi|net_amount|tds_amount|greeting)\}/g, (whole, key: string) => {
    const v = map[key];
    return v !== undefined ? v : whole;
  });
}
