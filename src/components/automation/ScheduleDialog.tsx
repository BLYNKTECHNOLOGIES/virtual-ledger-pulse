import { useState, useId } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateMerchantSchedule, useUpdateMerchantSchedule, MerchantSchedule, DAY_LABELS } from '@/hooks/useAutomation';
import { Field, HINT, LABEL, SWITCH } from '@/components/terminal/automation/automationUi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSchedule?: MerchantSchedule | null;
}

/** Dialog footer buttons (same size on every Automation dialog). */
const FOOTER_BTN = 'h-9 px-4 text-sm';

export function ScheduleDialog({ open, onOpenChange, editingSchedule }: Props) {
  const createSchedule = useCreateMerchantSchedule();
  const updateSchedule = useUpdateMerchantSchedule();
  const isEditing = !!editingSchedule;

  const [form, setForm] = useState({
    name: editingSchedule?.name || 'Default Schedule',
    selectedDays: editingSchedule ? [editingSchedule.day_of_week] : [] as number[],
    start_time: editingSchedule?.start_time || '09:00',
    end_time: editingSchedule?.end_time || '18:00',
    action: editingSchedule?.action || 'go_online',
    is_active: editingSchedule?.is_active ?? true,
  });

  useState(() => {
    if (open) {
      setForm({
        name: editingSchedule?.name || 'Default Schedule',
        selectedDays: editingSchedule ? [editingSchedule.day_of_week] : [],
        start_time: editingSchedule?.start_time || '09:00',
        end_time: editingSchedule?.end_time || '18:00',
        action: editingSchedule?.action || 'go_online',
        is_active: editingSchedule?.is_active ?? true,
      });
    }
  });

  const toggleDay = (day: number) => {
    setForm(prev => ({
      ...prev,
      selectedDays: prev.selectedDays.includes(day)
        ? prev.selectedDays.filter(d => d !== day)
        : [...prev.selectedDays, day],
    }));
  };

  const handleSubmit = async () => {
    if (form.selectedDays.length === 0) return;

    if (isEditing) {
      updateSchedule.mutate({
        id: editingSchedule.id,
        name: form.name,
        day_of_week: form.selectedDays[0],
        start_time: form.start_time,
        end_time: form.end_time,
        action: form.action as any,
        is_active: form.is_active,
      }, { onSuccess: () => onOpenChange(false) });
    } else {
      // Create one schedule entry per selected day
      for (const day of form.selectedDays) {
        await new Promise<void>((resolve, reject) => {
          createSchedule.mutate({
            name: form.name,
            day_of_week: day,
            start_time: form.start_time,
            end_time: form.end_time,
            action: form.action as any,
            is_active: form.is_active,
          }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
      }
      onOpenChange(false);
    }
  };

  // ── Presentation only (derived from the form above; nothing here changes what is saved) ──
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const noDays = form.selectedDays.length === 0;
  const daysHint = noDays
    ? 'Select at least one day'
    : !isEditing && form.selectedDays.length > 1
      ? 'One schedule is created for each selected day.'
      : null;
  const overnight = !!form.start_time && !!form.end_time && form.end_time.slice(0, 5) < form.start_time.slice(0, 5);
  const saving = createSchedule.isPending || updateSchedule.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* rounded-[12px] (not rounded-xl): the global phone CSS pads `.rounded-xl[class*=shadow] > div:first-child`, which indented the title. */}
      <DialogContent className="rounded-[12px] border-border bg-card md:max-w-md">
        <DialogHeader className="space-y-1 pr-8 text-left sm:text-left">
          <DialogTitle className="text-base font-semibold leading-6">{isEditing ? 'Edit' : 'Create'} Schedule</DialogTitle>
          <DialogDescription className="text-xs leading-5">Pick the days, the time window and the action for this schedule.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Schedule Name" htmlFor={id('name')}>
            <Input id={id('name')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Weekday Trading Hours" />
          </Field>

          <div className="space-y-1.5">
            <p id={id('days-label')} className={LABEL}>Days of Week</p>
            <div
              role="group"
              aria-labelledby={id('days-label')}
              aria-describedby={daysHint ? id('days-hint') : undefined}
              className="grid grid-cols-7 gap-1.5"
            >
              {DAY_LABELS.map((label, i) => {
                const on = form.selectedDays.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    aria-pressed={on}
                    title={label}
                    className={`h-9 min-w-0 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-transparent text-foreground hover:bg-secondary'
                    }`}
                  >
                    {label.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            {daysHint && <p id={id('days-hint')} className={HINT}>{daysHint}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Time" htmlFor={id('start')}>
              <Input id={id('start')} type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="tabular-nums" />
            </Field>
            <Field label="End Time" htmlFor={id('end')} hint={overnight ? <span id={id('end-hint')}>Ends the next day (+1d)</span> : undefined}>
              <Input
                id={id('end')}
                type="time"
                value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })}
                aria-describedby={overnight ? id('end-hint') : undefined}
                className="tabular-nums"
              />
            </Field>
          </div>

          <Field label="Action" htmlFor={id('action')}>
            <Select value={form.action} onValueChange={v => setForm({ ...form, action: v as MerchantSchedule['action'] })}>
              <SelectTrigger id={id('action')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="go_online">Go Online (activate ads)</SelectItem>
                <SelectItem value="go_offline">Go Offline (deactivate ads)</SelectItem>
                <SelectItem value="take_rest">Take Rest (1hr pause)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <div className="min-w-0">
              <label htmlFor={id('active')} className="text-sm font-medium text-foreground">Active</label>
              <p id={id('active-hint')} className={HINT}>When off, this schedule is ignored.</p>
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
          <Button
            type="button"
            className={FOOTER_BTN}
            onClick={handleSubmit}
            disabled={createSchedule.isPending || updateSchedule.isPending || form.selectedDays.length === 0}
            loading={saving}
            aria-describedby={noDays ? id('days-hint') : undefined}
          >
            {isEditing ? 'Update' : 'Create'} Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
