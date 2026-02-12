/**
 * Formats a number with up to `maxDecimals` significant decimal places,
 * removing trailing zeros but keeping at least 2 decimals.
 * For very small numbers (like SHIB price), preserves all significant digits.
 */
export function formatSmartDecimal(value: number | string, maxDecimals: number = 9): string {
  const num = Number(value);
  if (isNaN(num)) return '0';
  
  // For zero, return simple format
  if (num === 0) return '0.00';
  
  // Use toFixed with max decimals then strip trailing zeros
  const fixed = num.toFixed(maxDecimals);
  
  // Remove trailing zeros but keep at least 2 decimal places
  const parts = fixed.split('.');
  if (!parts[1]) return fixed;
  
  // Find last non-zero digit position, minimum 2
  let lastNonZero = parts[1].length - 1;
  while (lastNonZero > 1 && parts[1][lastNonZero] === '0') {
    lastNonZero--;
  }
  
  return parts[0] + '.' + parts[1].substring(0, lastNonZero + 1);
}
