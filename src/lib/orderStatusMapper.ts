/**
 * Centralized operational status mapper for Binance P2P orders.
 *
 * Translates raw Binance status codes/strings into human-readable
 * operational labels based on the order side (BUY / SELL).
 *
 * The raw Binance status is always preserved in the database;
 * this module is UI-only.
 */

// ── Operational labels ──────────────────────────────────────────
export type OperationalStatus =
  | 'Pending Payment'
  | 'Releasing'
  | 'Pending Release'
  | 'Completed'
  | 'Cancelled'
  | 'Expired'
  | 'Under Appeal';

// ── Raw Binance numeric → canonical string ──────────────────────
const NUMERIC_STATUS_MAP: Record<number, string> = {
  1: 'PENDING',
  2: 'TRADING',
  3: 'BUYER_PAYED',
  4: 'BUYER_PAYED',
  5: 'COMPLETED',
  6: 'CANCELLED',
  7: 'CANCELLED',
  8: 'APPEAL',
};

/** Normalise whatever Binance returns into an upper-case canonical string */
export function normaliseBinanceStatus(raw: number | string | undefined | null): string {
  if (raw === undefined || raw === null) return 'TRADING';
  if (typeof raw === 'number') return NUMERIC_STATUS_MAP[raw] || 'TRADING';
  return String(raw).toUpperCase();
}

// ── Core mapper ─────────────────────────────────────────────────
export function mapToOperationalStatus(
  rawStatus: string,
  tradeType: 'BUY' | 'SELL' | string,
): OperationalStatus {
  const s = rawStatus.toUpperCase();

  // Terminal states (side-agnostic)
  if (s.includes('COMPLETED') || s.includes('RELEASED')) return 'Completed';
  if (s.includes('CANCEL')) return 'Cancelled';
  if (s.includes('EXPIRED') || s.includes('TIMEOUT')) return 'Expired';
  if (s.includes('APPEAL') || s.includes('DISPUTE')) return 'Under Appeal';

  // Active workflow — depends on side
  const isBuy = tradeType === 'BUY';

  if (s.includes('BUYER_PAYED') || s.includes('BUYER_PAID')) {
    // Payment confirmed by buyer
    return isBuy ? 'Releasing' : 'Pending Release';
  }

  // TRADING / PENDING = no payment yet
  return 'Pending Payment';
}

// ── Styling ─────────────────────────────────────────────────────
export interface StatusStyle {
  label: string;
  badgeClass: string;   // Tailwind classes for Badge
  dotColor: string;     // For optional status dot
}

const STATUS_STYLES: Record<OperationalStatus, Omit<StatusStyle, 'label'>> = {
  'Pending Payment': {
    badgeClass: 'border-amber-500/30 text-amber-500 bg-amber-500/5',
    dotColor: 'bg-amber-500',
  },
  Releasing: {
    badgeClass: 'border-blue-500/30 text-blue-500 bg-blue-500/5',
    dotColor: 'bg-blue-500',
  },
  'Pending Release': {
    badgeClass: 'border-orange-500/30 text-orange-500 bg-orange-500/5',
    dotColor: 'bg-orange-500',
  },
  Completed: {
    badgeClass: 'border-trade-buy/30 text-trade-buy bg-trade-buy/5',
    dotColor: 'bg-trade-buy',
  },
  Cancelled: {
    badgeClass: 'border-destructive/30 text-destructive bg-destructive/5',
    dotColor: 'bg-destructive',
  },
  Expired: {
    badgeClass: 'border-muted-foreground/30 text-muted-foreground bg-muted-foreground/5',
    dotColor: 'bg-muted-foreground',
  },
  'Under Appeal': {
    badgeClass: 'border-purple-500/30 text-purple-500 bg-purple-500/5',
    dotColor: 'bg-purple-500',
  },
};

export function getStatusStyle(status: OperationalStatus): StatusStyle {
  const style = STATUS_STYLES[status] || STATUS_STYLES['Pending Payment'];
  return { ...style, label: status };
}
