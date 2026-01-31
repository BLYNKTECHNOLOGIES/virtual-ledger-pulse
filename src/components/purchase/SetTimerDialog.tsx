import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BuyOrder } from '@/lib/buy-order-types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Timer, Clock } from 'lucide-react';

interface SetTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: BuyOrder | null;
  onSuccess: () => void;
}

const PRESET_TIMES = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
];

export function SetTimerDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
}: SetTimerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(30);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    const minutes = customMinutes ? parseInt(customMinutes) : selectedPreset;
    if (!minutes || minutes <= 0) {
      toast({
        title: 'Invalid Time',
        description: 'Please enter a valid wait time',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const timerEndAt = new Date();
      timerEndAt.setMinutes(timerEndAt.getMinutes() + minutes);

      const { error } = await supabase
        .from('purchase_orders')
        .update({ 
          order_status: 'added_to_bank',
          timer_end_at: timerEndAt.toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      toast({
        title: 'Timer Set',
        description: `Order moved to Added to Bank with ${minutes} minute timer`,
      });

      setCustomMinutes('');
      setSelectedPreset(30);
      
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-orange-500" />
            Set Wait Time
          </DialogTitle>
          <DialogDescription>
            Set how long to wait before the order can be marked as paid. 
            Alerts will trigger at 5 min and 1 min before time ends.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label>Quick Select</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_TIMES.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant={selectedPreset === preset.value && !customMinutes ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedPreset(preset.value);
                    setCustomMinutes('');
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom_minutes">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Custom Time (minutes)
              </div>
            </Label>
            <Input
              id="custom_minutes"
              type="number"
              placeholder="Enter custom minutes"
              value={customMinutes}
              onChange={(e) => {
                setCustomMinutes(e.target.value);
                if (e.target.value) {
                  setSelectedPreset(null);
                }
              }}
              min={1}
              max={120}
            />
          </div>

          <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>🔔</span>
              <span>You'll receive alerts at 5 min and 1 min before timer ends</span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Start Timer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
