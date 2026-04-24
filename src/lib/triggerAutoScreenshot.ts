import { supabase } from '@/integrations/supabase/client';

export function triggerAutoScreenshot(orderNumber: string, paidAtIso = new Date().toISOString()) {
  return supabase.functions.invoke('payer-auto-screenshot', {
    body: { orderNumber, paidAtIso },
  }).catch((error) => {
    console.warn('auto-screenshot invoke failed', { orderNumber, error });
    return null;
  });
}