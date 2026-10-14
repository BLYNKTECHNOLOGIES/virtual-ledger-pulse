import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Laptop, PackageOpen, Smartphone, Monitor, KeyRound, Package, History } from 'lucide-react';
import { SectionBlock, StatusPill, ProfileEmptyState, ProfileSkeleton } from './primitives';
import { fmtDay, humanize } from './format';

interface Props {
  employeeId: string;
}

const iconFor = (type?: string | null) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('phone') || t.includes('mobile')) return Smartphone;
  if (t.includes('monitor') || t.includes('screen') || t.includes('desktop')) return Monitor;
  if (t.includes('key') || t.includes('card') || t.includes('access')) return KeyRound;
  if (t.includes('laptop')) return Laptop;
  return Package;
};

/**
 * Read-only list of company assets currently or previously assigned to the
 * employee. Sourced from `hr_asset_assignments` joined with `hr_assets`.
 * Employees can see device, serial, dates and condition — HR retains all
 * mutation rights (transfer, return, retire).
 */
export default function MyAssetsTab({ employeeId }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['my_assets', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_asset_assignments')
        .select('id, assigned_date, return_date, status, notes, asset:hr_assets(name, asset_type, serial_number, condition)')
        .eq('employee_id', employeeId)
        .order('assigned_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  if (isLoading) {
    return <ProfileSkeleton rows={3} />;
  }

  if (data.length === 0) {
    return (
      <ProfileEmptyState
        icon={PackageOpen}
        title="No assets assigned"
        description="You don't have any company assets on record. If you've been issued a device that isn't listed, please contact HR/IT."
      />
    );
  }

  const active = data.filter((r: any) => !r.return_date);
  const past = data.filter((r: any) => r.return_date);

  const AssetRow = ({ r }: { r: any }) => {
    const a = r.asset || {};
    const Icon = iconFor(a.asset_type);
    return (
      <li className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">{a.name || 'Unnamed asset'}</p>
            <p className="text-xs text-muted-foreground">
              {a.asset_type ? humanize(a.asset_type) : 'Asset'}{a.serial_number ? <> · SN <span className="font-mono">{a.serial_number}</span></> : ''}
            </p>
            {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0 sm:justify-end">
          {a.condition && <StatusPill tone="neutral">{humanize(a.condition)}</StatusPill>}
          <StatusPill tone={r.return_date ? 'neutral' : 'info'}>{r.return_date ? 'Returned' : humanize(r.status || 'Assigned')}</StatusPill>
          <span className="text-xs text-muted-foreground">
            {r.assigned_date ? fmtDay(r.assigned_date) : '—'}
            {r.return_date && ` → ${fmtDay(r.return_date)}`}
          </span>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <SectionBlock icon={Laptop} title="With you now" actions={<span className="t-secondary">{active.length}</span>} flush>
        {active.length === 0 ? (
          <p className="px-3.5 py-4 text-sm text-muted-foreground">No active assignments.</p>
        ) : (
          <ul className="divide-y divide-border">{active.map((r: any) => <AssetRow key={r.id} r={r} />)}</ul>
        )}
      </SectionBlock>

      {past.length > 0 && (
        <SectionBlock icon={History} title="Previously held" actions={<span className="t-secondary">{past.length}</span>} flush>
          <ul className="divide-y divide-border">{past.map((r: any) => <AssetRow key={r.id} r={r} />)}</ul>
        </SectionBlock>
      )}

      <p className="text-xs text-muted-foreground">
        Need to return or report an issue with an asset? Contact HR/IT — asset movements are recorded by HR.
      </p>
    </div>
  );
}
