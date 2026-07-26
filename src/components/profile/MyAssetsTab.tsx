import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Laptop, PackageOpen } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  employeeId: string;
}

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
    return <p className="text-muted-foreground text-sm py-8 text-center">Loading assets…</p>;
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <PackageOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No assets assigned</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            You don't have any company assets on record. If you've been issued a
            device that isn't listed, please contact HR/IT.
          </p>
        </CardContent>
      </Card>
    );
  }

  const active = data.filter((r: any) => !r.return_date);
  const past = data.filter((r: any) => r.return_date);

  const AssetRow = ({ r }: { r: any }) => {
    const a = r.asset || {};
    return (
      <div className="border border-border rounded-lg p-4 bg-card flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Laptop className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground truncate">{a.name || 'Unnamed asset'}</p>
            <p className="text-xs text-muted-foreground">
              {a.asset_type || 'Asset'}{a.serial_number ? ` · SN ${a.serial_number}` : ''}
            </p>
            {r.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.notes}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0">
          {a.condition && (
            <Badge variant="outline" className="capitalize">{a.condition}</Badge>
          )}
          <Badge variant={r.return_date ? 'secondary' : 'default'} className="capitalize">
            {r.return_date ? 'Returned' : (r.status || 'Assigned')}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {r.assigned_date ? format(new Date(r.assigned_date), 'dd MMM yyyy') : '—'}
            {r.return_date && ` → ${format(new Date(r.return_date), 'dd MMM yyyy')}`}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currently assigned ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No active assignments.</p>
          ) : (
            active.map((r: any) => <AssetRow key={r.id} r={r} />)
          )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Previously held ({past.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {past.map((r: any) => <AssetRow key={r.id} r={r} />)}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Need to return or report an issue with an asset? Contact HR/IT — asset movements are recorded by HR.
      </p>
    </div>
  );
}
