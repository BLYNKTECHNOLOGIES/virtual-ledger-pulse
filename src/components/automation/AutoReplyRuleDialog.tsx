import { useState, useEffect, useId, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateAutoReplyRule, useUpdateAutoReplyRule, AutoReplyRule, TRIGGER_LABELS } from '@/hooks/useAutomation';
import { FIELD_ERROR, Field, HINT, INVALID, LABEL, SWITCH, UNIT } from '@/components/terminal/automation/automationUi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule?: AutoReplyRule | null;
}

const TEMPLATE_VARS = [
  { label: 'Order ID', value: '{{orderNumber}}' },
  { label: 'Amount', value: '{{amount}}' },
  { label: 'Asset', value: '{{asset}}' },
  { label: 'Counterparty', value: '{{counterparty}}' },
];

const getDefaultForm = (rule?: AutoReplyRule | null) => ({
  name: rule?.name || '',
  trigger_event: (rule?.trigger_event || 'order_received') as AutoReplyRule['trigger_event'],
  trade_type: (rule?.trade_type || '') as 'BUY' | 'SELL' | 'SMALL_BUY' | 'SMALL_SELL' | '',
  message_template: rule?.message_template || '',
  delay_seconds: rule?.delay_seconds || 0,
  is_active: rule?.is_active ?? true,
  priority: rule?.priority || 0,
});

/** Dialog footer buttons (same size on every Automation dialog). */
const FOOTER_BTN = 'h-9 px-4 text-sm';

export function AutoReplyRuleDialog({ open, onOpenChange, editingRule }: Props) {
  const createRule = useCreateAutoReplyRule();
  const updateRule = useUpdateAutoReplyRule();
  const isEditing = !!editingRule;

  const [form, setForm] = useState(getDefaultForm(editingRule));

  useEffect(() => {
    if (open) {
      setForm(getDefaultForm(editingRule));
    }
  }, [open, editingRule]);

  // Presentation only: after a refused Create/Update click, say which field is missing (what is saved and when is unchanged).
  const [triedSubmit, setTriedSubmit] = useState(false);
  useEffect(() => {
    if (open) setTriedSubmit(false);
  }, [open, editingRule]);
  const nameRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const nameMissing = triedSubmit && !form.name;
  const messageMissing = triedSubmit && !form.message_template;

  const handleSubmit = () => {
    if (!form.name || !form.message_template) {
      setTriedSubmit(true);
      (form.name ? messageRef : nameRef).current?.focus();
      return;
    }

    const payload = {
      name: form.name,
      trigger_event: form.trigger_event,
      trade_type: form.trade_type || null,
      message_template: form.message_template,
      delay_seconds: form.delay_seconds,
      is_active: form.is_active,
      priority: form.priority,
    };

    if (isEditing) {
      updateRule.mutate({ id: editingRule.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      createRule.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const insertVar = (varStr: string) => {
    setForm({ ...form, message_template: form.message_template + varStr });
  };

  const saving = createRule.isPending || updateRule.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* rounded-[12px] (not rounded-xl): the global phone CSS pads `.rounded-xl[class*=shadow] > div:first-child`, which indented the title. */}
      <DialogContent className="max-w-lg rounded-[12px] border-border bg-card">
        <DialogHeader className="space-y-1 pr-8 text-left sm:text-left">
          <DialogTitle className="text-base font-semibold leading-6">{isEditing ? 'Edit' : 'Create'} Auto-Reply Rule</DialogTitle>
          <DialogDescription className="text-xs leading-5">Sends this message in the order chat when the selected event happens.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Rule Name" htmlFor={id('name')} error={nameMissing ? 'Enter a rule name' : undefined} errorId={id('name-error')}>
            <Input
              id={id('name')}
              ref={nameRef}
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Welcome message for new orders"
              aria-invalid={nameMissing || undefined}
              aria-describedby={nameMissing ? id('name-error') : undefined}
              className={INVALID}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trigger Event" htmlFor={id('trigger')}>
              <Select value={form.trigger_event} onValueChange={v => setForm({ ...form, trigger_event: v as AutoReplyRule['trigger_event'] })}>
                <SelectTrigger id={id('trigger')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={<>Trade Type <span className="font-normal text-muted-foreground">(optional)</span></>} htmlFor={id('trade')}>
              <Select value={form.trade_type || 'ALL'} onValueChange={v => setForm({ ...form, trade_type: (v === 'ALL' ? '' : v) as 'BUY' | 'SELL' | 'SMALL_BUY' | 'SMALL_SELL' | '' })}>
                <SelectTrigger id={id('trade')}><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="BUY">Buy Orders</SelectItem>
                  <SelectItem value="SELL">Sell Orders</SelectItem>
                  <SelectItem value="SMALL_BUY">Small Buy</SelectItem>
                  <SelectItem value="SMALL_SELL">Small Sale</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="min-w-0 space-y-1.5">
            <label htmlFor={id('message')} className={LABEL}>Message Template</label>
            <Textarea
              id={id('message')}
              ref={messageRef}
              value={form.message_template}
              onChange={e => setForm({ ...form, message_template: e.target.value })}
              placeholder="Type your auto-reply message..."
              rows={4}
              className={`min-h-[96px] resize-y ${INVALID}`}
              aria-invalid={messageMissing || undefined}
              aria-describedby={[messageMissing ? id('message-error') : null, id('vars-hint')].filter(Boolean).join(' ')}
            />
            {messageMissing && <p id={id('message-error')} className={FIELD_ERROR}>Enter a message</p>}
            <div role="group" aria-label="Insert a variable" className="flex flex-wrap gap-1.5 pt-0.5">
              {TEMPLATE_VARS.map(v => (
                <Button
                  key={v.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md px-2.5 text-xs shadow-none"
                  title={`Adds ${v.value} at the end of the message`}
                  onClick={() => insertVar(v.value)}
                >
                  + {v.label}
                </Button>
              ))}
            </div>
            <p id={id('vars-hint')} className={HINT}>Variables are added at the end of the message.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Delay (seconds)" htmlFor={id('delay')} hint={<span id={id('delay-hint')}>Wait before sending (0 = instant)</span>}>
              <div className="flex items-center gap-2">
                <Input
                  id={id('delay')}
                  type="number"
                  min={0}
                  value={form.delay_seconds}
                  onChange={e => setForm({ ...form, delay_seconds: Number(e.target.value) })}
                  aria-describedby={id('delay-hint')}
                  className="w-28 tabular-nums"
                />
                <span aria-hidden="true" className={UNIT}>s</span>
              </div>
            </Field>
            <Field label="Priority" htmlFor={id('priority')} hint={<span id={id('priority-hint')}>Lower = runs first</span>}>
              <Input
                id={id('priority')}
                type="number"
                min={0}
                value={form.priority}
                onChange={e => setForm({ ...form, priority: Number(e.target.value) })}
                aria-describedby={id('priority-hint')}
                className="w-28 tabular-nums"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <div className="min-w-0">
              <label htmlFor={id('active')} className="text-sm font-medium text-foreground">Active</label>
              <p id={id('active-hint')} className={HINT}>Only active rules are sent.</p>
            </div>
            <Switch
              id={id('active')}
              checked={form.is_active}
              onCheckedChange={v => setForm({ ...form, is_active: v })}
              aria-describedby={id('active-hint')}
              className={SWITCH}
            />
          </div>
        </div>

        {/* Footer stays reachable: it sticks to the bottom of the dialog's scroll area on short screens. */}
        <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t border-border bg-card px-4 py-3 sm:flex sm:justify-end md:-bottom-6 md:-mx-6 md:-mb-6 md:px-6 md:py-4">
          <Button type="button" variant="outline" className={FOOTER_BTN} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className={FOOTER_BTN} onClick={handleSubmit} disabled={createRule.isPending || updateRule.isPending} loading={saving}>
            {isEditing ? 'Update' : 'Create'} Rule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
