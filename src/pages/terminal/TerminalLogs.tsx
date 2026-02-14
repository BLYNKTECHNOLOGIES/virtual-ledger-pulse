import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollText, Search, User, Clock } from 'lucide-react';
import {
  useAdActionLogs, getAdActionLabel, AdActionTypes, AdActionLogEntry,
  ACTION_CATEGORIES, CATEGORY_LABELS, getActionCategory,
  type ActionCategory,
} from '@/hooks/useAdActionLog';
import { format } from 'date-fns';

const CATEGORY_BADGE_COLORS: Record<ActionCategory, string> = {
  ads: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  orders: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  automations: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  assets: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
};

const ACTION_BADGE_COLORS: Record<string, string> = {
  // Ads
  [AdActionTypes.AD_CREATED]: 'bg-success/15 text-success border-success/30',
  [AdActionTypes.AD_UPDATED]: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  [AdActionTypes.AD_STATUS_CHANGED]: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  [AdActionTypes.AD_BULK_STATUS_CHANGED]: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  [AdActionTypes.AD_BULK_LIMITS_UPDATED]: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  [AdActionTypes.AD_BULK_FLOATING_UPDATED]: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30',
  [AdActionTypes.AD_REST_STARTED]: 'bg-red-500/15 text-red-500 border-red-500/30',
  [AdActionTypes.AD_REST_ENDED]: 'bg-green-500/15 text-green-500 border-green-500/30',
  // Orders
  [AdActionTypes.ORDER_MARKED_PAID]: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  [AdActionTypes.ORDER_RELEASED]: 'bg-success/15 text-success border-success/30',
  [AdActionTypes.ORDER_CANCELLED]: 'bg-red-500/15 text-red-500 border-red-500/30',
  [AdActionTypes.ORDER_VERIFIED]: 'bg-teal-500/15 text-teal-500 border-teal-500/30',
  // Automations
  [AdActionTypes.AUTO_PAY_TOGGLED]: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  [AdActionTypes.AUTO_PAY_MINUTES_CHANGED]: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  [AdActionTypes.SMALL_SALES_TOGGLED]: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30',
  [AdActionTypes.SMALL_SALES_RANGE_CHANGED]: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30',
  [AdActionTypes.AUTO_REPLY_RULE_CREATED]: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  [AdActionTypes.AUTO_REPLY_RULE_UPDATED]: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  [AdActionTypes.AUTO_REPLY_RULE_TOGGLED]: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  [AdActionTypes.AUTO_REPLY_RULE_DELETED]: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  [AdActionTypes.SCHEDULE_CREATED]: 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30',
  [AdActionTypes.SCHEDULE_UPDATED]: 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30',
  [AdActionTypes.SCHEDULE_TOGGLED]: 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30',
  [AdActionTypes.SCHEDULE_DELETED]: 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30',
  // Assets
  [AdActionTypes.SPOT_TRADE_EXECUTED]: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  [AdActionTypes.SPOT_TRADE_FAILED]: 'bg-red-500/15 text-red-500 border-red-500/30',
};

function ActionBadge({ actionType }: { actionType: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${ACTION_BADGE_COLORS[actionType] || 'bg-muted text-muted-foreground'}`}>
      {getAdActionLabel(actionType)}
    </Badge>
  );
}

function CategoryBadge({ category }: { category: ActionCategory }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${CATEGORY_BADGE_COLORS[category]}`}>
      {CATEGORY_LABELS[category]}
    </Badge>
  );
}

function formatDetails(entry: AdActionLogEntry): string[] {
  const lines: string[] = [];
  const d = entry.ad_details || {};
  const m = entry.metadata || {};
  const cat = getActionCategory(entry.action_type);

  if (cat === 'ads') {
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
    if (m.fromStatus !== undefined && m.toStatus !== undefined) {
      const statusLabel = (s: number) => s === 1 ? 'Online' : s === 2 ? 'Private' : s === 3 ? 'Offline' : `${s}`;
      lines.push(`${statusLabel(m.fromStatus)} → ${statusLabel(m.toStatus)}`);
    }
    if (m.advNos) lines.push(`Ads: ${Array.isArray(m.advNos) ? m.advNos.join(', ') : m.advNos}`);
    if (m.adsCount) lines.push(`${m.adsCount} ads affected`);
    if (m.deactivatedCount !== undefined) lines.push(`${m.deactivatedCount} ads deactivated`);
    if (d.tradeMethods && Array.isArray(d.tradeMethods)) {
      lines.push(`Pay Methods: ${d.tradeMethods.map((pm: any) => pm.tradeMethodName || pm.identifier).join(', ')}`);
    }
  } else if (cat === 'orders') {
    if (d.orderNumber) lines.push(`Order: …${String(d.orderNumber).slice(-8)}`);
    if (m.authType) lines.push(`Auth: ${m.authType}`);
    if (m.reason) lines.push(`Reason: ${m.reason}`);
  } else if (cat === 'automations') {
    if (d.is_active !== undefined) lines.push(`Active: ${d.is_active ? 'Yes' : 'No'}`);
    if (d.is_enabled !== undefined) lines.push(`Enabled: ${d.is_enabled ? 'Yes' : 'No'}`);
    if (d.minutes_before_expiry !== undefined) lines.push(`Minutes: ${d.minutes_before_expiry}`);
    if (d.min_amount !== undefined) lines.push(`Min: ₹${d.min_amount}`);
    if (d.max_amount !== undefined) lines.push(`Max: ₹${d.max_amount}`);
    if (d.name) lines.push(`Name: ${d.name}`);
    if (d.trigger_event) lines.push(`Trigger: ${d.trigger_event}`);
    if (d.action) lines.push(`Action: ${d.action}`);
    if (d.ruleId) lines.push(`Rule: …${String(d.ruleId).slice(-6)}`);
    if (d.scheduleId) lines.push(`Schedule: …${String(d.scheduleId).slice(-6)}`);
  } else if (cat === 'assets') {
    if (d.symbol) lines.push(`Symbol: ${d.symbol}`);
    if (d.side) lines.push(`Side: ${d.side}`);
    if (d.quantity) lines.push(`Qty: ${d.quantity}`);
    if (m.price) lines.push(`Price: ${m.price}`);
    if (m.executedQty) lines.push(`Filled: ${m.executedQty}`);
    if (m.error) lines.push(`Error: ${m.error}`);
  }

  return lines;
}

export default function TerminalLogs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const { data: logs, isLoading } = useAdActionLogs({ limit: 500 });

  // Available actions based on selected category
  const availableActions = useMemo(() => {
    if (categoryFilter === 'all') return Object.values(AdActionTypes);
    return ACTION_CATEGORIES[categoryFilter as ActionCategory] || [];
  }, [categoryFilter]);

  // Reset action filter when category changes
  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setActionFilter('all');
  };

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      // Category filter
      if (categoryFilter !== 'all') {
        const logCat = getActionCategory(log.action_type);
        if (logCat !== categoryFilter) return false;
      }
      // Action filter
      if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;
      // Search
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
  }, [logs, searchQuery, categoryFilter, actionFilter]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <ScrollText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Action Logs</h1>
          <p className="text-xs text-muted-foreground">Complete history of all terminal actions</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by user, order, details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={categoryFilter} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(Object.keys(CATEGORY_LABELS) as ActionCategory[]).map(cat => (
                  <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {availableActions.map(type => (
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
                    const cat = getActionCategory(log.action_type);
                    return (
                      <div key={log.id} className="relative pl-8 py-2.5 hover:bg-muted/30 rounded-md transition-colors group">
                        {/* Timeline dot */}
                        <div className="absolute left-[5px] top-4 w-[13px] h-[13px] rounded-full border-2 bg-background border-primary/60 group-hover:border-primary transition-colors" />

                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {cat && <CategoryBadge category={cat} />}
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
