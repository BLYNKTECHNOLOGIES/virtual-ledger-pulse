import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAutoPricingLogs, AutoPricingLog, AutoPricingRule } from '@/hooks/useAutoPricingRules';
import { format } from 'date-fns';

interface AutoPricingLogsProps {
  ruleId?: string;
  rules: AutoPricingRule[];
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-success/20 text-success',
  error: 'bg-destructive/20 text-destructive',
  skipped: 'bg-warning/20 text-warning',
  no_change: 'bg-muted text-muted-foreground',
};

export function AutoPricingLogs({ ruleId: initialRuleId, rules }: AutoPricingLogsProps) {
  const [filterRuleId, setFilterRuleId] = useState(initialRuleId || 'all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterZone, setFilterZone] = useState('all');
  const activeRuleId = filterRuleId === 'all' ? undefined : filterRuleId;
  const { data: logs = [], isLoading } = useAutoPricingLogs(activeRuleId, 200);

  const filteredLogs = logs.filter(l => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    if (filterZone !== 'all') {
      // Zone of the book the cycle competed in; falls back to our ad's own zone.
      const zone = (l.competitor_zone || l.ad_zone || 'p2p').toLowerCase() === 'block' ? 'block' : 'p2p';
      if (zone !== filterZone) return false;
    }
    return true;
  });
  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r.name]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base sm:text-lg">Auto-Pricing Logs</CardTitle>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={filterRuleId} onValueChange={setFilterRuleId}>
              <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
                <SelectValue placeholder="All Rules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rules</SelectItem>
                {rules.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger className="w-full sm:w-[120px] h-8 text-xs">
                <SelectValue placeholder="All Zones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Zones</SelectItem>
                <SelectItem value="p2p">P2P zone</SelectItem>
                <SelectItem value="block">Block zone</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[120px] h-8 text-xs col-span-2 sm:col-span-1">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
                <SelectItem value="no_change">No Change</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No logs found</div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Merchant</TableHead>

                  <TableHead>Competitor ₹</TableHead>
                  <TableHead>Market Ref</TableHead>
                  <TableHead>Dev%</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Guards</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'dd MMM HH:mm:ss')}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{ruleMap[log.rule_id] || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{log.asset || '—'}</Badge></TableCell>
                    <TableCell className="t-mono text-xs">{log.ad_number ? `…${log.ad_number.slice(-6)}` : '—'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px]">{log.competitor_zone === 'block' ? 'Block' : 'P2P'}</Badge>
                      {log.competitor_badges?.length ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">{log.competitor_badges.join('/')}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.competitor_merchant || '—'}
                      {(log.competitor_identity || log.competitor_vip_level != null) && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {log.competitor_identity === 'BLOCK_MERCHANT' ? 'Block merchant'
                            : log.competitor_identity === 'MASS_MERCHANT' ? 'Mass merchant' : ''}
                          {log.competitor_vip_level != null && log.competitor_vip_level > 0 ? ` VIP${log.competitor_vip_level}` : ''}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs">{log.competitor_price ? `₹${Number(log.competitor_price).toLocaleString('en-IN')}` : '—'}</TableCell>
                    <TableCell className="text-xs">{log.market_reference_price ? `₹${Number(log.market_reference_price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</TableCell>
                    <TableCell className="text-xs">{log.deviation_from_market_pct != null ? `${Number(log.deviation_from_market_pct).toFixed(2)}%` : '—'}</TableCell>
                    <TableCell className="text-xs font-medium">
                      {log.applied_price ? `₹${Number(log.applied_price).toLocaleString('en-IN')}` :
                       log.applied_ratio ? `${Number(log.applied_ratio).toFixed(4)}%` : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] ${STATUS_COLORS[log.status] || ''}`}>
                        {log.skipped_reason || log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {log.was_capped && <Badge variant="outline" className="text-[10px] px-1">Capped</Badge>}
                        {log.was_rate_limited && <Badge variant="outline" className="text-[10px] px-1">Rate-Ltd</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
