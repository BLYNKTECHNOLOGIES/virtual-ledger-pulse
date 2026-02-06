const STORAGE_KEY = 'lastOrderDefaults';

interface OrderDefaults {
  wallet_id?: string;
  product_id?: string;
  price_per_unit?: string;
}

export function getLastOrderDefaults(): OrderDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLastOrderDefaults(defaults: Partial<OrderDefaults>) {
  try {
    const current = getLastOrderDefaults();
    const updated = { ...current };
    if (defaults.wallet_id) updated.wallet_id = defaults.wallet_id;
    if (defaults.product_id) updated.product_id = defaults.product_id;
    if (defaults.price_per_unit) updated.price_per_unit = defaults.price_per_unit;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail
  }
}
