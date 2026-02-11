import { Button } from '@/components/ui/button';

const periods = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '1 Year', value: '1y' },
] as const;

export type TimePeriod = (typeof periods)[number]['value'];

interface Props {
  value: TimePeriod;
  onChange: (v: TimePeriod) => void;
}

export function getTimestampsForPeriod(period: TimePeriod) {
  const now = Date.now();

  switch (period) {
    case '7d':
      return { startTimestamp: now - 7 * 24 * 60 * 60 * 1000, endTimestamp: now };
    case '30d':
      return { startTimestamp: now - 30 * 24 * 60 * 60 * 1000, endTimestamp: now };
    case '1y':
      return { startTimestamp: now - 365 * 24 * 60 * 60 * 1000, endTimestamp: now };
  }
}

export function TimePeriodFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
      {periods.map((p) => (
        <Button
          key={p.value}
          variant={value === p.value ? 'default' : 'ghost'}
          size="sm"
          className={`h-7 text-xs px-3 ${
            value === p.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => onChange(p.value)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
