import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateMerchantSchedule, useUpdateMerchantSchedule, MerchantSchedule, DAY_LABELS } from '@/hooks/useAutomation';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSchedule?: MerchantSchedule | null;
}

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Create'} Schedule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Schedule Name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Weekday Trading Hours" />
          </div>

          <div>
            <Label className="mb-2 block">Days of Week</Label>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    form.selectedDays.includes(i)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {label.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Time</Label>
              <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <Label>End Time</Label>
              <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Action</Label>
            <Select value={form.action} onValueChange={v => setForm({ ...form, action: v as MerchantSchedule['action'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="go_online">Go Online (activate ads)</SelectItem>
                <SelectItem value="go_offline">Go Offline (deactivate ads)</SelectItem>
                <SelectItem value="take_rest">Take Rest (1hr pause)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            <Label>Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createSchedule.isPending || updateSchedule.isPending || form.selectedDays.length === 0}>
            {isEditing ? 'Update' : 'Create'} Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
