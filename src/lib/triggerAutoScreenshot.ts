import { supabase } from '@/integrations/supabase/client';

export function triggerAutoScreenshot(orderNumber: string, paidAtIso = new Date().toISOString()) {
  return supabase.functions.invoke('payer-auto-screenshot', {
    body: { orderNumber, paidAtIso },
  }).catch((error) => {
    console.warn('auto-screenshot invoke failed', { orderNumber, error });
    return null;
  });
}

// Force the auto-reply engine to process a single order immediately, bypassing
// the cron poll (which can miss orders that complete within seconds).
export function triggerAutoReplyForOrder(orderNumber: string, triggerEvent: string = 'payment_marked') {
  return supabase.functions.invoke('auto-reply-engine', {
    body: { orderNumber, triggerEvent },
  }).catch((error) => {
    console.warn('auto-reply invoke failed', { orderNumber, error });
    return null;
  });
}