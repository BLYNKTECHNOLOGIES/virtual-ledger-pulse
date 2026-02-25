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
  const activeRuleId = filterRuleId === 'all' ? undefined : filterRuleId;
  const { data: logs = [], isLoading } = useAutoPricingLogs(activeRuleId, 200);

  const filteredLogs = filterStatus === 'all' ? logs : logs.filter(l => l.status === filterStatus);
  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r.name]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Auto-Pricing Logs</CardTitle>
          <div className="flex gap-2">
            <Select value={filterRuleId} onValueChange={setFilterRuleId}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All Rules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rules</SelectItem>
                {rules.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Ad</TableHead>
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
                    <TableCell className="font-mono text-xs">{log.ad_number ? `…${log.ad_number.slice(-6)}` : '—'}</TableCell>
                    <TableCell className="text-xs">{log.competitor_merchant || '—'}</TableCell>
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
