import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import {
  Settings, Bell, Monitor, MessageSquare, Wifi, Volume2, VolumeX,
  Plus, Pencil, Trash2, GripVertical, Check, X, Loader2, Shield,
} from 'lucide-react';

// ─── Per-user preferences (localStorage) ───
const PREFS_KEY = 'terminal_user_prefs';

interface UserPrefs {
  soundEnabled: boolean;
  desktopNotifications: boolean;
  chatSoundEnabled: boolean;
  orderAlertSound: boolean;
  tableDensity: 'compact' | 'normal' | 'comfortable';
  numberFormat: 'en-IN' | 'en-US';
  autoRefreshInterval: number; // seconds
}

const DEFAULT_PREFS: UserPrefs = {
  soundEnabled: true,
  desktopNotifications: true,
  chatSoundEnabled: true,
  orderAlertSound: true,
  tableDensity: 'compact',
  numberFormat: 'en-IN',
  autoRefreshInterval: 30,
};

function loadPrefs(): UserPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_PREFS };
}

function savePrefs(prefs: UserPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ─── Quick Reply type ───
interface QuickReply {
  id: string;
  label: string;
  message_text: string;
  trade_type: string | null;
  order_type: string | null;
  sort_order: number;
  is_active: boolean;
}

// ─── Quick Reply Editor Dialog ───
function QuickReplyDialog({
  open, onOpenChange, reply, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reply: QuickReply | null;
  onSave: (data: Partial<QuickReply>) => void;
}) {
  const [label, setLabel] = useState('');
  const [messageText, setMessageText] = useState('');
  const [tradeType, setTradeType] = useState<string>('all');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (reply) {
      setLabel(reply.label);
      setMessageText(reply.message_text);
      setTradeType(reply.trade_type || 'all');
      setIsActive(reply.is_active);
    } else {
      setLabel('');
      setMessageText('');
      setTradeType('all');
      setIsActive(true);
    }
  }, [reply, open]);

  const handleSave = () => {
    onSave({
      id: reply?.id,
      label,
      message_text: messageText,
      trade_type: tradeType === 'all' ? null : tradeType,
      is_active: isActive,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm">{reply ? 'Edit' : 'Add'} Quick Reply</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[11px]">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Payment Reminder" className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-[11px]">Message Text</Label>
            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Enter the quick reply message..."
              className="text-xs mt-1 min-h-[80px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Trade Type</Label>
              <Select value={tradeType} onValueChange={setTradeType}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="BUY">Buy Orders</SelectItem>
                  <SelectItem value="SELL">Sell Orders</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label className="text-[11px]">{isActive ? 'Active' : 'Inactive'}</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!label.trim() || !messageText.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Settings Page ───
export default function TerminalSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<UserPrefs>(loadPrefs);
  const [editReply, setEditReply] = useState<QuickReply | null>(null);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Save prefs on change
  const updatePref = useCallback(<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  }, []);

  // Quick Replies query
  const { data: quickReplies = [], isLoading: repliesLoading } = useQuery({
    queryKey: ['p2p-quick-replies-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('p2p_quick_replies')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data || []) as QuickReply[];
    },
  });

  // Quick Reply CRUD
  const handleSaveReply = async (replyData: Partial<QuickReply>) => {
    try {
      if (replyData.id) {
        const { error } = await supabase
          .from('p2p_quick_replies')
          .update({
            label: replyData.label!,
            message_text: replyData.message_text!,
            trade_type: replyData.trade_type,
            is_active: replyData.is_active,
          })
          .eq('id', replyData.id);
        if (error) throw error;
        toast({ title: 'Quick reply updated' });
      } else {
        const maxOrder = quickReplies.reduce((m, r) => Math.max(m, r.sort_order), 0);
        const { error } = await supabase
          .from('p2p_quick_replies')
          .insert({
            label: replyData.label!,
            message_text: replyData.message_text!,
            trade_type: replyData.trade_type,
            is_active: replyData.is_active ?? true,
            sort_order: maxOrder + 1,
          });
        if (error) throw error;
        toast({ title: 'Quick reply added' });
      }
      queryClient.invalidateQueries({ queryKey: ['p2p-quick-replies-all'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-quick-replies'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteReply = async (id: string) => {
    try {
      const { error } = await supabase.from('p2p_quick_replies').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Quick reply deleted' });
      queryClient.invalidateQueries({ queryKey: ['p2p-quick-replies-all'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-quick-replies'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleReplyActive = async (reply: QuickReply) => {
    try {
      const { error } = await supabase
        .from('p2p_quick_replies')
        .update({ is_active: !reply.is_active })
        .eq('id', reply.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['p2p-quick-replies-all'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-quick-replies'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Proxy health check
  useEffect(() => {
    let cancelled = false;
    const checkProxy = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('binance-ads', {
          body: { action: 'getReferencePrice', assets: ['USDT'], tradeType: 'BUY' },
        });
        if (!cancelled) {
          setProxyStatus(data?.success ? 'online' : 'offline');
        }
      } catch {
        if (!cancelled) setProxyStatus('offline');
      }
    };
    checkProxy();
    return () => { cancelled = true; };
  }, []);

  // Desktop notification permission request
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      toast({ title: 'Not supported', description: 'Your browser does not support desktop notifications.', variant: 'destructive' });
      return;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      toast({ title: 'Notifications enabled' });
      updatePref('desktopNotifications', true);
    } else {
      toast({ title: 'Permission denied', description: 'Please enable notifications in your browser settings.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px]">
      <div>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> Terminal Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Configure your terminal preferences and manage templates</p>
      </div>

      {/* ─── Notification Preferences ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" /> Notification Preferences
          </CardTitle>
          <CardDescription className="text-[11px]">Per-user settings stored locally</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <SettingRow
            label="Sound Alerts"
            description="Play sounds for order events and alerts"
            icon={prefs.soundEnabled ? Volume2 : VolumeX}
          >
            <Switch checked={prefs.soundEnabled} onCheckedChange={(v) => updatePref('soundEnabled', v)} />
          </SettingRow>

          <Separator className="bg-border/50" />

          <SettingRow
            label="Desktop Notifications"
            description="Show browser push notifications for new orders"
            icon={Monitor}
          >
            <div className="flex items-center gap-2">
              {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={requestNotificationPermission}>
                  Enable
                </Button>
              )}
              <Switch checked={prefs.desktopNotifications} onCheckedChange={(v) => updatePref('desktopNotifications', v)} />
            </div>
          </SettingRow>

          <Separator className="bg-border/50" />

          <SettingRow
            label="Chat Message Sounds"
            description="Play sound when new chat messages arrive"
            icon={MessageSquare}
          >
            <Switch checked={prefs.chatSoundEnabled} onCheckedChange={(v) => updatePref('chatSoundEnabled', v)} />
          </SettingRow>

          <Separator className="bg-border/50" />

          <SettingRow
            label="Order Alert Sound"
            description="Buzzer alert for new incoming orders"
            icon={Bell}
          >
            <Switch checked={prefs.orderAlertSound} onCheckedChange={(v) => updatePref('orderAlertSound', v)} />
          </SettingRow>
        </CardContent>
      </Card>

      {/* ─── Display Preferences ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" /> Display Preferences
          </CardTitle>
          <CardDescription className="text-[11px]">Customize how data is shown in the terminal</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <SettingRow label="Table Density" description="Row spacing in order & ad tables">
            <Select value={prefs.tableDensity} onValueChange={(v) => updatePref('tableDensity', v as any)}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          <Separator className="bg-border/50" />

          <SettingRow label="Number Format" description="Currency and number display format">
            <Select value={prefs.numberFormat} onValueChange={(v) => updatePref('numberFormat', v as any)}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="en-IN">Indian (₹1,00,000)</SelectItem>
                <SelectItem value="en-US">US ($100,000)</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          <Separator className="bg-border/50" />

          <SettingRow label="Auto-Refresh Interval" description="How often to poll Binance for updates">
            <Select value={String(prefs.autoRefreshInterval)} onValueChange={(v) => updatePref('autoRefreshInterval', Number(v))}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">60 seconds</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </CardContent>
      </Card>

      {/* ─── Quick Reply Management ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" /> Quick Reply Templates
              </CardTitle>
              <CardDescription className="text-[11px]">Manage chat quick reply templates for all operators</CardDescription>
            </div>
            <Button
              size="sm"
              className="h-7 text-[10px] gap-1"
              onClick={() => { setEditReply(null); setReplyDialogOpen(true); }}
            >
              <Plus className="h-3 w-3" /> Add Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {repliesLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : quickReplies.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No quick replies configured</p>
          ) : (
            <div className="space-y-1.5">
              {quickReplies.map((reply) => (
                <div
                  key={reply.id}
                  className="flex items-center gap-2 py-2 px-2.5 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors group"
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-foreground truncate">{reply.label}</p>
                      {reply.trade_type && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0">
                          {reply.trade_type}
                        </Badge>
                      )}
                      {!reply.is_active && (
                        <Badge variant="secondary" className="text-[8px] px-1 py-0">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{reply.message_text}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleToggleReplyActive(reply)}
                      title={reply.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {reply.is_active ? <Check className="h-3 w-3 text-trade-buy" /> : <X className="h-3 w-3 text-muted-foreground" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => { setEditReply(reply); setReplyDialogOpen(true); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-trade-sell hover:text-trade-sell"
                      onClick={() => handleDeleteReply(reply.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── System Info ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" /> System Status
          </CardTitle>
          <CardDescription className="text-[11px]">Connection health and infrastructure info</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">Binance Proxy</p>
              <p className="text-[10px] text-muted-foreground">API relay via Lightsail VPS</p>
            </div>
            <Badge
              variant={proxyStatus === 'online' ? 'default' : proxyStatus === 'offline' ? 'destructive' : 'secondary'}
              className="text-[10px]"
            >
              {proxyStatus === 'checking' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {proxyStatus === 'online' ? '● Online' : proxyStatus === 'offline' ? '● Offline' : 'Checking...'}
            </Badge>
          </div>

          <Separator className="bg-border/50" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">WebSocket Relay</p>
              <p className="text-[10px] text-muted-foreground">Chat relay at relay.rewarnd.com</p>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              <Shield className="h-3 w-3 mr-1" /> Configured
            </Badge>
          </div>

          <Separator className="bg-border/50" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">Edge Functions</p>
              <p className="text-[10px] text-muted-foreground">Supabase serverless backend</p>
            </div>
            <Badge variant="secondary" className="text-[10px]">Active</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Reply Dialog */}
      <QuickReplyDialog
        open={replyDialogOpen}
        onOpenChange={setReplyDialogOpen}
        reply={editReply}
        onSave={handleSaveReply}
      />
    </div>
  );
}

// ─── Reusable Setting Row ───
function SettingRow({
  label, description, icon: Icon, children,
}: {
  label: string;
  description: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
        <div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
