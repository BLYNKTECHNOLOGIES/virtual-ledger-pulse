import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Bot,
  Plus,
  Edit,
  Trash2,
  Calendar,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  FileDown,
  Timer,
  Package,
} from 'lucide-react';
import {
  useAutoReplyRules,
  useAutoReplyLogs,
  useUpdateAutoReplyRule,
  useDeleteAutoReplyRule,
  useMerchantSchedules,
  useUpdateMerchantSchedule,
  useDeleteMerchantSchedule,
  AutoReplyRule,
  MerchantSchedule,
  TRIGGER_LABELS,
  DAY_LABELS,
} from '@/hooks/useAutomation';
import { AutoReplyRuleDialog } from '@/components/automation/AutoReplyRuleDialog';
import { ScheduleDialog } from '@/components/automation/ScheduleDialog';
import { format } from 'date-fns';
import { CompletedOrdersExport } from '@/components/terminal/automation/CompletedOrdersExport';
import { AutoPaySettings } from '@/components/terminal/automation/AutoPaySettings';
import { SmallSalesConfig } from '@/components/terminal/automation/SmallSalesConfig';
import { SmallBuysConfig } from '@/components/terminal/automation/SmallBuysConfig';
import { ShoppingCart } from 'lucide-react';

const TRIGGER_COLORS: Record<string, string> = {
  order_received: 'bg-primary/20 text-primary',
  payment_marked: 'bg-success/20 text-success',
  payment_pending: 'bg-warning/20 text-warning',
  order_cancelled: 'bg-destructive/20 text-destructive',
  order_appealed: 'bg-destructive/20 text-destructive',
  timer_breach: 'bg-warning/20 text-warning',
};

const ACTION_COLORS: Record<string, string> = {
  go_online: 'bg-success/20 text-success',
  go_offline: 'bg-destructive/20 text-destructive',
  take_rest: 'bg-warning/20 text-warning',
};

const ACTION_LABELS: Record<string, string> = {
  go_online: 'Go Online',
  go_offline: 'Go Offline',
  take_rest: 'Take Rest',
};

export default function TerminalAutomation() {
  const [activeTab, setActiveTab] = useState('auto-reply');
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MerchantSchedule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'rule' | 'schedule'; id: string } | null>(null);

  const { data: rules = [], isLoading: rulesLoading } = useAutoReplyRules();
  const { data: logs = [], isLoading: logsLoading } = useAutoReplyLogs();
  const { data: schedules = [], isLoading: schedulesLoading } = useMerchantSchedules();
  const toggleRule = useUpdateAutoReplyRule();
  const deleteRule = useDeleteAutoReplyRule();
  const toggleSchedule = useUpdateMerchantSchedule();
  const deleteSchedule = useDeleteMerchantSchedule();

  const handleDeleteConfirm = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'rule') deleteRule.mutate(deleteConfirm.id);
    else deleteSchedule.mutate(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const handleEditRule = (rule: AutoReplyRule) => { setEditingRule(rule); setRuleDialogOpen(true); };
  const handleCreateRule = () => { setEditingRule(null); setRuleDialogOpen(true); };
  const handleEditSchedule = (s: MerchantSchedule) => { setEditingSchedule(s); setScheduleDialogOpen(true); };
  const handleCreateSchedule = () => { setEditingSchedule(null); setScheduleDialogOpen(true); };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Automation</h1>
            <p className="text-xs text-muted-foreground">Auto-reply workflows & merchant scheduling</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="auto-reply" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Auto-Reply Rules
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Merchant Schedule
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Execution Log
          </TabsTrigger>
          <TabsTrigger value="auto-pay" className="gap-1.5">
            <Timer className="h-3.5 w-3.5" />
            Auto-Pay
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5">
            <FileDown className="h-3.5 w-3.5" />
            Export Orders
          </TabsTrigger>
          <TabsTrigger value="small-sales" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Small Sales
          </TabsTrigger>
          <TabsTrigger value="small-buys" className="gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" />
            Small Buys
          </TabsTrigger>
        </TabsList>

        {/* ═══ AUTO-REPLY RULES ═══ */}
        <TabsContent value="auto-reply" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={handleCreateRule}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Rule
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {rulesLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No auto-reply rules configured</p>
                  <p className="text-xs mt-1">Create rules to automatically respond to order events</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Active</TableHead>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Trade Type</TableHead>
                      <TableHead>Delay</TableHead>
                      <TableHead>Message Preview</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={(v) => toggleRule.mutate({ id: rule.id, is_active: v })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TRIGGER_COLORS[rule.trigger_event] || ''}>
                            {TRIGGER_LABELS[rule.trigger_event]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rule.trade_type ? (
                            <Badge variant="outline">
                              {rule.trade_type === 'SMALL_BUY' ? 'Small Buy' : rule.trade_type === 'SMALL_SELL' ? 'Small Sale' : rule.trade_type}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">All</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {rule.delay_seconds > 0 ? (
                            <span className="text-xs flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {rule.delay_seconds}s
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Instant</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="text-xs truncate text-muted-foreground">{rule.message_template}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditRule(rule)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteConfirm({ type: 'rule', id: rule.id })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ MERCHANT SCHEDULES ═══ */}
        <TabsContent value="schedules" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={handleCreateSchedule}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Schedule
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {schedulesLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : schedules.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No schedules configured</p>
                  <p className="text-xs mt-1">Create schedules to automate online/offline timing</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Active</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead>Time Window</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map(s => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Switch
                            checked={s.is_active}
                            onCheckedChange={(v) => toggleSchedule.mutate({ id: s.id, is_active: v })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{DAY_LABELS[s.day_of_week]}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={ACTION_COLORS[s.action] || ''}>
                            {ACTION_LABELS[s.action]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditSchedule(s)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteConfirm({ type: 'schedule', id: s.id })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ EXECUTION LOG ═══ */}
        <TabsContent value="logs" className="mt-4">
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
        </TabsContent>

        {/* ═══ AUTO-PAY ═══ */}
        <TabsContent value="auto-pay" className="mt-4">
          <AutoPaySettings />
        </TabsContent>

        {/* ═══ EXPORT ORDERS ═══ */}
        <TabsContent value="export" className="mt-4">
          <CompletedOrdersExport />
        </TabsContent>

        {/* ═══ SMALL SALES CONFIG ═══ */}
        <TabsContent value="small-sales" className="mt-4">
          <SmallSalesConfig />
        </TabsContent>

        {/* ═══ SMALL BUYS CONFIG ═══ */}
        <TabsContent value="small-buys" className="mt-4">
          <SmallBuysConfig />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AutoReplyRuleDialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen} editingRule={editingRule} />
      <ScheduleDialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen} editingSchedule={editingSchedule} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.type === 'rule' ? 'Rule' : 'Schedule'}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
