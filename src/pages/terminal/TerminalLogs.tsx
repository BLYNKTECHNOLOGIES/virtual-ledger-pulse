import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollText, Search, User, Clock, Tag, FileText } from 'lucide-react';
import { useAdActionLogs, getAdActionLabel, AdActionTypes, AdActionLogEntry } from '@/hooks/useAdActionLog';
import { format } from 'date-fns';

function ActionBadge({ actionType }: { actionType: string }) {
  const colorMap: Record<string, string> = {
    [AdActionTypes.AD_CREATED]: 'bg-success/15 text-success border-success/30',
    [AdActionTypes.AD_UPDATED]: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    [AdActionTypes.AD_STATUS_CHANGED]: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    [AdActionTypes.AD_BULK_STATUS_CHANGED]: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
    [AdActionTypes.AD_BULK_LIMITS_UPDATED]: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
    [AdActionTypes.AD_BULK_FLOATING_UPDATED]: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30',
    [AdActionTypes.AD_REST_STARTED]: 'bg-red-500/15 text-red-500 border-red-500/30',
    [AdActionTypes.AD_REST_ENDED]: 'bg-green-500/15 text-green-500 border-green-500/30',
  };

  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${colorMap[actionType] || 'bg-muted text-muted-foreground'}`}>
      {getAdActionLabel(actionType)}
    </Badge>
  );
}

function formatDetails(entry: AdActionLogEntry): string[] {
  const lines: string[] = [];
  const d = entry.ad_details || {};
  const m = entry.metadata || {};

  if (d.tradeType) lines.push(`Type: ${d.tradeType}`);
  if (d.asset) lines.push(`Asset: ${d.asset}`);
  if (d.price !== undefined) lines.push(`Price: ₹${d.price}`);
  if (d.priceType !== undefined) lines.push(`Price Mode: ${d.priceType === 1 ? 'Fixed' : 'Floating'}`);
  if (d.priceFloatingRatio !== undefined) lines.push(`Float Ratio: ${d.priceFloatingRatio}%`);
  if (d.initAmount !== undefined) lines.push(`Quantity: ${d.initAmount}`);
  if (d.minSingleTransAmount !== undefined) lines.push(`Min: ₹${d.minSingleTransAmount}`);
  if (d.maxSingleTransAmount !== undefined) lines.push(`Max: ₹${d.maxSingleTransAmount}`);
  if (d.autoReplyMsg) lines.push(`Auto Reply: "${d.autoReplyMsg.substring(0, 50)}…"`);
  if (d.remarks) lines.push(`Remarks: "${d.remarks.substring(0, 50)}…"`);

  // Status changes
  if (m.fromStatus !== undefined && m.toStatus !== undefined) {
    const statusLabel = (s: number) => s === 1 ? 'Online' : s === 2 ? 'Private' : s === 3 ? 'Offline' : `${s}`;
    lines.push(`${statusLabel(m.fromStatus)} → ${statusLabel(m.toStatus)}`);
  }
  if (m.advNos) lines.push(`Ads: ${Array.isArray(m.advNos) ? m.advNos.join(', ') : m.advNos}`);
  if (m.adsCount) lines.push(`${m.adsCount} ads affected`);
  if (m.deactivatedCount !== undefined) lines.push(`${m.deactivatedCount} ads deactivated`);

  // Payment methods
  if (d.tradeMethods && Array.isArray(d.tradeMethods)) {
    lines.push(`Pay Methods: ${d.tradeMethods.map((m: any) => m.tradeMethodName || m.identifier).join(', ')}`);
  }

  return lines;
}

export default function TerminalLogs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const { data: logs, isLoading } = useAdActionLogs({ limit: 500 });

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesUser = (log.user_name || '').toLowerCase().includes(q);
        const matchesAdv = (log.adv_no || '').toLowerCase().includes(q);
        const matchesAction = getAdActionLabel(log.action_type).toLowerCase().includes(q);
        const matchesDetails = JSON.stringify(log.ad_details).toLowerCase().includes(q);
        if (!matchesUser && !matchesAdv && !matchesAction && !matchesDetails) return false;
      }
      return true;
    });
  }, [logs, searchQuery, actionFilter]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <ScrollText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Action Logs</h1>
          <p className="text-xs text-muted-foreground">Complete history of all ad-related actions</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by user, ad number, details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {Object.values(AdActionTypes).map(type => (
                  <SelectItem key={type} value={type}>{getAdActionLabel(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Log entries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No action logs found</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                <div className="space-y-1">
                  {filteredLogs.map((log) => {
                    const details = formatDetails(log);
                    return (
                      <div key={log.id} className="relative pl-8 py-2.5 hover:bg-muted/30 rounded-md transition-colors group">
                        {/* Timeline dot */}
                        <div className="absolute left-[5px] top-4 w-[13px] h-[13px] rounded-full border-2 bg-background border-primary/60 group-hover:border-primary transition-colors" />

                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <ActionBadge actionType={log.action_type} />
                              {log.adv_no && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  #{log.adv_no}
                                </span>
                              )}
                            </div>

                            {/* Details */}
                            {details.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                {details.map((d, i) => (
                                  <span key={i} className="text-[11px] text-muted-foreground">
                                    {d}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* User and time */}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <User className="h-2.5 w-2.5" />
                                {log.user_name || log.user_id}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />
                                {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm:ss a')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
