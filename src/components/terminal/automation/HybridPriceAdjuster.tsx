import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Blend, Save } from 'lucide-react';
import { useHybridPriceAdjuster, useUpdateHybridPriceAdjuster } from '@/hooks/useHybridPriceAdjuster';
import { useToast } from '@/hooks/use-toast';
import { Field, InlineNotice, Panel, SectionHead, UNIT } from './automationUi';

export function HybridPriceAdjuster() {
  const adjusterQuery = useHybridPriceAdjuster();
  const { data: adjuster = 0, isLoading } = adjusterQuery;
  // A failed read shows 0 (the default) — say so instead of letting it look like the stored value.
  const readFailed = adjusterQuery.isError && adjusterQuery.data === undefined;
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
    <Panel labelledBy="hy-title">
      <SectionHead
        icon={<Blend />}
        title="Hybrid price difference adjuster"
        titleId="hy-title"
        description="This value is subtracted from the calculated floating ratio when using Hybrid Adjust in Ads Manager."
      />
      <div className="space-y-3 px-4 py-3">
        {readFailed && (
          // Save upserts the setting, so a save now replaces whatever is stored.
          <InlineNotice tone="danger" title="Couldn't load the saved settings">
            The value below is the default, not what is saved. Saving replaces the stored value.
          </InlineNotice>
        )}
        <Field label="Adjuster Value" htmlFor="hy-adjuster" hint="Percentage points of the floating ratio.">
          <div className="flex flex-wrap items-center gap-2">
            {/* unit next to the box, not inside it (spin buttons) */}
            <div className="flex items-center gap-1.5">
              <Input
                id="hy-adjuster"
                type="number"
                step="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="0.3"
                disabled={isLoading}
                className="h-8 w-32 text-sm t-mono tabular-nums placeholder:font-sans"
              />
              <span aria-hidden="true" className={UNIT}>%</span>
            </div>
            <Button size="sm" className="h-8 gap-1.5 px-3 text-xs [&_svg]:size-3.5" onClick={handleSave} disabled={updateAdjuster.isPending}>
              <Save />
              Save
            </Button>
          </div>
        </Field>
        <InlineNotice tone="info">
          For example, if the calculated ratio is 105.3% and adjuster is 0.3, the final ratio will be 105.0%.
        </InlineNotice>
      </div>
    </Panel>
  );
}
