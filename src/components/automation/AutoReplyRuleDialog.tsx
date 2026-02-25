import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateAutoReplyRule, useUpdateAutoReplyRule, AutoReplyRule, TRIGGER_LABELS } from '@/hooks/useAutomation';

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
  const handleSubmit = () => {
    if (!form.name || !form.message_template) return;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Create'} Auto-Reply Rule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Rule Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Welcome message for new orders" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Trigger Event</Label>
              <Select value={form.trigger_event} onValueChange={v => setForm({ ...form, trigger_event: v as AutoReplyRule['trigger_event'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trade Type (optional)</Label>
              <Select value={form.trade_type || 'ALL'} onValueChange={v => setForm({ ...form, trade_type: (v === 'ALL' ? '' : v) as 'BUY' | 'SELL' | 'SMALL_BUY' | 'SMALL_SELL' | '' })}>
                <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="BUY">Buy Orders</SelectItem>
                  <SelectItem value="SELL">Sell Orders</SelectItem>
                  <SelectItem value="SMALL_BUY">Small Buy</SelectItem>
                  <SelectItem value="SMALL_SELL">Small Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Message Template</Label>
            <Textarea
              value={form.message_template}
              onChange={e => setForm({ ...form, message_template: e.target.value })}
              placeholder="Type your auto-reply message..."
              rows={4}
            />
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {TEMPLATE_VARS.map(v => (
                <Button key={v.value} variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => insertVar(v.value)}>
                  + {v.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Delay (seconds)</Label>
              <Input type="number" min={0} value={form.delay_seconds} onChange={e => setForm({ ...form, delay_seconds: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground mt-1">Wait before sending (0 = instant)</p>
            </div>
            <div>
              <Label>Priority</Label>
              <Input type="number" min={0} value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground mt-1">Lower = runs first</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            <Label>Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createRule.isPending || updateRule.isPending}>
            {isEditing ? 'Update' : 'Create'} Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
