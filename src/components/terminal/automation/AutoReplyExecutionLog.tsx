import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Zap } from 'lucide-react';
import { useAutoReplyLogs, TRIGGER_LABELS } from '@/hooks/useAutomation';
import { format } from 'date-fns';

const TRIGGER_COLORS: Record<string, string> = {
  order_received: 'bg-primary/20 text-primary',
  payment_marked: 'bg-success/20 text-success',
  payment_pending: 'bg-warning/20 text-warning',
  order_cancelled: 'bg-destructive/20 text-destructive',
  order_appealed: 'bg-destructive/20 text-destructive',
  timer_breach: 'bg-warning/20 text-warning',
};

export function AutoReplyExecutionLog() {
  const { data: logs = [], isLoading: logsLoading } = useAutoReplyLogs();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Execution Log</CardTitle>
      </CardHeader>
      <CardContent>
        {logsLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No executions yet</p>
            <p className="text-xs mt-1">Logs will appear here when auto-reply rules are triggered</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {log.status === 'sent' && <CheckCircle className="h-4 w-4 text-success" />}
                      {log.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
                      {log.status === 'skipped' && <AlertTriangle className="h-4 w-4 text-warning" />}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={TRIGGER_COLORS[log.trigger_event] || ''}>
                        {TRIGGER_LABELS[log.trigger_event] || log.trigger_event}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">…{log.order_number.slice(-8)}</TableCell>
                    <TableCell className="max-w-[250px]">
                      <p className="text-xs truncate text-muted-foreground">{log.message_sent}</p>
                      {log.error_message && <p className="text-xs text-destructive mt-0.5">{log.error_message}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(log.executed_at), 'dd MMM HH:mm:ss')}
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
