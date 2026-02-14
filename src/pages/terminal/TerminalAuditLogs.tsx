import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollText, RefreshCw, Search, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';

interface AuditLog {
  id: string;
  order_reference: string;
  action_type: string;
  performed_by: string;
  performed_by_name?: string;
  target_user_id: string;
  target_user_name?: string;
  previous_value: any;
  new_value: any;
  jurisdiction_layer: string;
  notes: string;
  created_at: string;
}

export default function TerminalAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('terminal_assignment_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!data) { setLogs([]); return; }

      const userIds = new Set<string>();
      data.forEach(d => {
        if (d.performed_by) userIds.add(d.performed_by);
        if (d.target_user_id) userIds.add(d.target_user_id);
      });

      const { data: users } = await supabase
        .from('users')
        .select('id, username, first_name, last_name')
        .in('id', Array.from(userIds));

      const usersMap = new Map<string, string>();
      (users || []).forEach(u => {
        usersMap.set(u.id, u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username);
      });

      setLogs(data.map(d => ({
        ...d,
        performed_by_name: usersMap.get(d.performed_by) || d.performed_by,
        target_user_name: d.target_user_id ? usersMap.get(d.target_user_id) || d.target_user_id : undefined,
      })));
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const filteredLogs = logs.filter(log => {
    if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (log.order_reference || '').includes(q) ||
        (log.performed_by_name || '').toLowerCase().includes(q) ||
        (log.target_user_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'order_assigned': return <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20">Assigned</Badge>;
      case 'order_unassigned': return <Badge className="text-[9px] bg-muted text-muted-foreground border-border">Unassigned</Badge>;
      case 'order_reassigned': return <Badge className="text-[9px] bg-accent text-accent-foreground border-border">Reassigned</Badge>;
      case 'auto_assigned': return <Badge className="text-[9px] bg-primary/20 text-primary border-primary/30">Auto</Badge>;
      default: return <Badge variant="outline" className="text-[9px]">{action}</Badge>;
    }
  };

  return (
    <TerminalPermissionGate permissions={['terminal_orders_view']}>
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ScrollText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Assignment Audit Logs</h1>
              <p className="text-xs text-muted-foreground">Track all order assignment and reassignment actions</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={fetchLogs}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search order or user..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-8 text-xs w-36">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="order_assigned">Assigned</SelectItem>
              <SelectItem value="order_unassigned">Unassigned</SelectItem>
              <SelectItem value="order_reassigned">Reassigned</SelectItem>
              <SelectItem value="auto_assigned">Auto-Assigned</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-[10px]">{filteredLogs.length} entries</Badge>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px]">Timestamp</TableHead>
                    <TableHead className="text-[10px]">Order Ref</TableHead>
                    <TableHead className="text-[10px]">Action</TableHead>
                    <TableHead className="text-[10px]">Performed By</TableHead>
                    <TableHead className="text-[10px]">Target User</TableHead>
                    <TableHead className="text-[10px]">Layer</TableHead>
                    <TableHead className="text-[10px]">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-muted/30 rounded animate-pulse" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                        No audit logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map(log => (
                      <TableRow key={log.id} className="text-xs">
                        <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}
                        </TableCell>
                        <TableCell className="font-mono text-[10px]">{(log.order_reference || '').slice(-8)}</TableCell>
                        <TableCell>{getActionBadge(log.action_type)}</TableCell>
                        <TableCell className="text-xs">{log.performed_by_name}</TableCell>
                        <TableCell className="text-xs">{log.target_user_name || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]">{log.jurisdiction_layer || '—'}</Badge></TableCell>
                        <TableCell className="text-[10px] text-muted-foreground max-w-[150px] truncate">{log.notes || '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </TerminalPermissionGate>
  );
}
