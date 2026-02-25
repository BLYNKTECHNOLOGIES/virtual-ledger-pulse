import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Blend, Save } from 'lucide-react';
import { useHybridPriceAdjuster, useUpdateHybridPriceAdjuster } from '@/hooks/useHybridPriceAdjuster';
import { useToast } from '@/hooks/use-toast';

export function HybridPriceAdjuster() {
  const { data: adjuster = 0, isLoading } = useHybridPriceAdjuster();
  const updateAdjuster = useUpdateHybridPriceAdjuster();
  const { toast } = useToast();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!isLoading) setValue(String(adjuster));
  }, [adjuster, isLoading]);

  const handleSave = () => {
    const num = parseFloat(value);
    if (isNaN(num)) {
      toast({ title: 'Invalid value', variant: 'destructive' });
      return;
    }
    updateAdjuster.mutate(num, {
      onSuccess: () => toast({ title: 'Hybrid adjuster saved', description: `Set to ${num}` }),
      onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Blend className="h-4 w-4 text-primary" />
          Hybrid Price Difference Adjuster
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          This value is subtracted from the calculated floating ratio when using Hybrid Adjust in Ads Manager.
          For example, if the calculated ratio is 105.3% and adjuster is 0.3, the final ratio will be 105.0%.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">Adjuster Value</Label>
            <Input
              type="number"
              step="0.01"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0.3"
              disabled={isLoading}
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={updateAdjuster.isPending}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
