// Pure quick-reply templating. Replaces {amount} {orderNo} {name} {upi} tokens
// with live order values at insert time. Unknown/empty tokens are left intact so
// operators can spot and fill them manually. No side effects.

export interface TemplateOrderValues {
  amount?: number | string | null;
  orderNo?: string | null;
  name?: string | null;
  upi?: string | null;
}

export function fillTemplate(text: string, values: TemplateOrderValues): string {
  if (!text) return text;
  const map: Record<string, string | undefined> = {
    amount: values.amount === null || values.amount === undefined || values.amount === ''
      ? undefined
      : Number(values.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    orderNo: values.orderNo || undefined,
    name: values.name || undefined,
    upi: values.upi || undefined,
  };
  return text.replace(/\{(amount|orderNo|name|upi)\}/g, (whole, key: string) => {
    const v = map[key];
    return v !== undefined ? v : whole;
  });
}
