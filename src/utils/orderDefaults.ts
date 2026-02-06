const STORAGE_KEY = 'lastOrderDefaults';

type OrderType = 'sales' | 'purchase';

interface OrderDefaults {
  wallet_id?: string;
  product_id?: string;
  price_per_unit?: string;
  price_per_unit_sales?: string;
  price_per_unit_purchase?: string;
}

export function getLastOrderDefaults(orderType?: OrderType): OrderDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const defaults: OrderDefaults = raw ? JSON.parse(raw) : {};
    // Override price_per_unit with the type-specific value if requested
    if (orderType === 'sales' && defaults.price_per_unit_sales) {
      defaults.price_per_unit = defaults.price_per_unit_sales;
    } else if (orderType === 'purchase' && defaults.price_per_unit_purchase) {
      defaults.price_per_unit = defaults.price_per_unit_purchase;
    }
    return defaults;
  } catch {
    return {};
  }
}

export function saveLastOrderDefaults(defaults: Partial<OrderDefaults>, orderType?: OrderType) {
  try {
    const current = getLastOrderDefaults();
    const updated = { ...current };
    if (defaults.wallet_id) updated.wallet_id = defaults.wallet_id;
    if (defaults.product_id) updated.product_id = defaults.product_id;
    if (defaults.price_per_unit) {
      if (orderType === 'sales') {
        updated.price_per_unit_sales = defaults.price_per_unit;
      } else if (orderType === 'purchase') {
        updated.price_per_unit_purchase = defaults.price_per_unit;
      } else {
        updated.price_per_unit = defaults.price_per_unit;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail
  }
}
