// Copilot · Rephrase for the order chat's message box (approvers, and the operators an approver picked): React glue for
// RephraseController (src/lib/copilot/rephraseController.ts), which decides when to ask and what the strip shows.
// Nothing is sent from here: take() hands the rewrite to the box.
import { useEffect, useRef, useState } from 'react';
import { copilotRephrase, type OrderHint } from '@/hooks/useCopilotPlaybook';
import { IDLE, RephraseController, type RephraseView } from '@/lib/copilot/rephraseController';

export type { RephraseView } from '@/lib/copilot/rephraseController';

export function useRephrase(o: {
  enabled: boolean;
  auto: boolean;
  orderNumber: string;
  exchangeAccountId?: string | null;
  hint: OrderHint;
  /** What is in the message box now. */
  text: string;
}) {
  const [view, setView] = useState<RephraseView>(IDLE);
  const ctl = useRef<RephraseController | null>(null);
  if (!ctl.current) ctl.current = new RephraseController(copilotRephrase, setView);
  const c = ctl.current;
  c.hint = o.hint;
  useEffect(() => () => c.dispose(), [c]);
  // Settings first (a new chat starts from nothing), then the box's text.
  useEffect(() => {
    c.configure({ enabled: o.enabled, auto: o.auto, orderNumber: o.orderNumber, exchangeAccountId: o.exchangeAccountId ?? null });
  }, [c, o.enabled, o.auto, o.orderNumber, o.exchangeAccountId]);
  useEffect(() => { c.setText(o.text); }, [c, o.text, o.enabled, o.auto, o.orderNumber]);
  return { view, ask: c.ask, another: c.another, switchLang: c.switchLang, dismiss: c.dismiss, take: c.take, untake: c.untake, markPlaced: c.markPlaced };
}
