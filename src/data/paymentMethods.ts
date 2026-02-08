// Allowed payment methods for Buy Ads (whitelisted from Binance)
// These are the only methods operators can manually select for BUY ads.
// For SELL ads, methods are fetched live from Binance account.

export interface PaymentMethodConfig {
  identifier: string; // Binance identifier key
  label: string; // Display name
  binancePayType: string; // Binance payType value
  colorAccent: string; // HSL accent color for left border/icon tint
  bgColor: string; // Background highlight when selected
  iconLabel: string; // Short icon text when no SVG available
  sortOrder: number; // Visual ordering to match Binance
}

// Binance identifiers mapped from actual API responses
export const ALLOWED_BUY_PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    identifier: 'ExpressUPI',
    label: 'Express UPI',
    binancePayType: 'ExpressUPI',
    colorAccent: '142 71% 45%', // green
    bgColor: 'hsl(142 71% 45% / 0.08)',
    iconLabel: 'UPI',
    sortOrder: 1,
  },
  {
    identifier: 'UPI',
    label: 'UPI',
    binancePayType: 'UPI',
    colorAccent: '142 71% 45%', // green
    bgColor: 'hsl(142 71% 45% / 0.08)',
    iconLabel: 'UPI',
    sortOrder: 2,
  },
  {
    identifier: 'IMPS',
    label: 'IMPS',
    binancePayType: 'IMPS',
    colorAccent: '24 95% 53%', // orange
    bgColor: 'hsl(24 95% 53% / 0.08)',
    iconLabel: 'IMPS',
    sortOrder: 3,
  },
  {
    identifier: 'SpecificBank',
    label: 'NEFT / Bank Transfer India',
    binancePayType: 'SpecificBank',
    colorAccent: '217 91% 60%', // blue
    bgColor: 'hsl(217 91% 60% / 0.08)',
    iconLabel: 'NEFT',
    sortOrder: 4,
  },
  {
    identifier: 'Paytm',
    label: 'Paytm',
    binancePayType: 'Paytm',
    colorAccent: '199 89% 48%', // paytm blue
    bgColor: 'hsl(199 89% 48% / 0.08)',
    iconLabel: 'PTM',
    sortOrder: 5,
  },
  {
    identifier: 'PhonePe',
    label: 'PhonePe',
    binancePayType: 'PhonePe',
    colorAccent: '270 68% 50%', // purple
    bgColor: 'hsl(270 68% 50% / 0.08)',
    iconLabel: 'PPe',
    sortOrder: 6,
  },
  {
    identifier: 'GooglePay',
    label: 'Google Pay (GPay)',
    binancePayType: 'GooglePay',
    colorAccent: '217 89% 61%', // google blue
    bgColor: 'hsl(217 89% 61% / 0.08)',
    iconLabel: 'GPay',
    sortOrder: 7,
  },
  {
    identifier: 'DigitalRupee',
    label: 'Digital eRupee',
    binancePayType: 'DigitalRupee',
    colorAccent: '38 92% 50%', // gold
    bgColor: 'hsl(38 92% 50% / 0.08)',
    iconLabel: 'e₹',
    sortOrder: 8,
  },
  {
    identifier: 'LightningUPI',
    label: 'Lightning UPI',
    binancePayType: 'LightningUPI',
    colorAccent: '48 96% 53%', // yellow
    bgColor: 'hsl(48 96% 53% / 0.08)',
    iconLabel: '⚡UPI',
    sortOrder: 9,
  },
];

// Quick lookup by identifier
export const PAYMENT_METHOD_MAP = new Map(
  ALLOWED_BUY_PAYMENT_METHODS.map(m => [m.identifier, m])
);

// Also create map by payType for matching Binance API responses
export const PAYMENT_METHOD_BY_PAYTYPE = new Map(
  ALLOWED_BUY_PAYMENT_METHODS.map(m => [m.binancePayType, m])
);

/**
 * Resolve a payment method config from a Binance trade method object.
 * Tries identifier first, then payType.
 */
export function resolvePaymentMethod(payTypeOrIdentifier: string): PaymentMethodConfig | undefined {
  return PAYMENT_METHOD_MAP.get(payTypeOrIdentifier) || PAYMENT_METHOD_BY_PAYTYPE.get(payTypeOrIdentifier);
}
