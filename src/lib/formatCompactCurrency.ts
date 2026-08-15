/**
 * Display-layer number formatting for financial KPI tiles.
 * Never rounds underlying data — only how it is rendered.
 */

/** Exact Indian-format rupee string, e.g. ₹11,47,832.40 */
export function formatExactINR(amount: number, decimals = 2): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}₹${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Compact Indian-format rupee string, e.g. ₹11.48 L / ₹1.60 Cr / ₹88.27 K */
export function formatCompactINR(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(2)} K`;
  return `${sign}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Exact USDT string with 4 decimals, e.g. 933.7547 USDT */
export function formatExactUSDT(amount: number, decimals = 4): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} USDT`;
}

/** Compact USDT headline, e.g. 11.43 USDT / 1.20 K USDT */
export function formatCompactUSDT(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)} M USDT`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)} K USDT`;
  return `${sign}${abs.toFixed(2)} USDT`;
}

/**
 * Step the headline type scale down as the string gets longer so a value
 * never has to be clipped.
 */
export function valueTypeScale(value: string): string {
  const len = value.length;
  if (len <= 10) return "text-2xl xl:text-3xl";
  if (len <= 14) return "text-xl xl:text-2xl";
  return "text-lg xl:text-xl";
}
