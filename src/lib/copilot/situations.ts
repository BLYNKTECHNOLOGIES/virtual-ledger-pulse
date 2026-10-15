// Copilot situations (what the client is waiting for) for the screens. The labels come from the copilot_situations
// table; codes are a tree, so a reply for "sell.kyc" covers every KYC step, including steps added later.
// No React, no network.

export interface SituationRow {
  code: string;
  side: 'BUY' | 'SELL' | null;
  label: string;
  description: string;
  detectable: boolean;
  sort: number;
  active: boolean;
}

/** Set from Binance's order status; never chosen by hand. */
export const STATUS_SITUATIONS = new Set(['done', 'cancelled', 'appeal', 'sell.pay.checking', 'buy.pay.sent']);

/** True when a reply limited to `scopeCode` applies in `code` (the same code, or a step inside it). */
export function covers(scopeCode: string, code: string | null | undefined): boolean {
  return !!code && (code === scopeCode || code.startsWith(`${scopeCode}.`));
}

export const parentOf = (code: string): string | null => (code.includes('.') && code.split('.').length > 2 ? code.split('.').slice(0, -1).join('.') : null);

export function situationLabel(code: string | null | undefined, rows: SituationRow[] | undefined): string {
  if (!code) return 'Any situation';
  const row = rows?.find((r) => r.code === code);
  if (row) return row.detectable ? row.label : `${row.label} (any step)`;
  return code;
}

/** "KYC pending, Checking KYC" — or "Any situation" when the list is empty. */
export function stagesSummary(codes: string[] | null | undefined, rows: SituationRow[] | undefined): string {
  if (!codes?.length) return 'Any situation';
  const order = new Map((rows ?? []).map((r, i) => [r.code, r.sort ?? i]));
  return [...codes].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999)).map((c) => situationLabel(c, rows)).join(', ');
}

export interface SituationGroup { group: SituationRow | null; items: SituationRow[] }

/** Active situations for one side (or both), as groups with their steps, for the "Applies to" editor. */
export function situationTree(rows: SituationRow[] | undefined, sides: Array<'BUY' | 'SELL'> | null | undefined): SituationGroup[] {
  const list = (rows ?? []).filter((r) => r.active && (r.side === null || !sides?.length || sides.includes(r.side)))
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  const groups: SituationGroup[] = [];
  const byCode = new Map(list.map((r) => [r.code, r]));
  for (const r of list) {
    const parent = parentOf(r.code);
    if (!r.detectable && !parent) { groups.push({ group: r, items: [] }); continue; }
    const g = parent ? groups.find((x) => x.group?.code === parent) : undefined;
    if (g) g.items.push(r);
    else if (!parent || !byCode.has(parent)) {
      const loose = groups.find((x) => x.group === null);
      if (loose) loose.items.push(r); else groups.push({ group: null, items: [r] });
    }
  }
  return groups;
}

/** Situations an approver may pick for a chat on this side (detectable steps, not Binance status ones). */
export function markableSituations(rows: SituationRow[] | undefined, side: 'BUY' | 'SELL' | null | undefined): SituationRow[] {
  return (rows ?? []).filter((r) => r.active && r.detectable && !STATUS_SITUATIONS.has(r.code) && (r.side === null || r.side === side))
    .sort((a, b) => a.sort - b.sort);
}

/** Adds or removes a code; choosing a group drops its own steps (the group covers them). */
export function toggleStage(stages: string[] | undefined, code: string): string[] {
  const cur = stages ?? [];
  if (cur.includes(code)) return cur.filter((c) => c !== code);
  return [...cur.filter((c) => !covers(code, c)), code];
}

/** Same as the server: when a code does not exist (any more), the reply needs a situation picked again. */
export function unknownStages(stages: string[] | undefined, rows: SituationRow[] | undefined): string[] {
  if (!rows?.length) return [];
  return (stages ?? []).filter((c) => !rows.some((r) => r.code === c && r.active));
}
