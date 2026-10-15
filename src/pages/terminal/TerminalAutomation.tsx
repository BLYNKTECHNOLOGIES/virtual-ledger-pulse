import { useEffect, useRef, useState } from 'react';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import { useTerminalUserPrefs } from '@/hooks/useTerminalUserPrefs';
import { Button, buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
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
  Pencil,
  Trash2,
  Calendar,
  MessageSquare,
  Clock,
  AlertTriangle,
  FileDown,
  Timer,
  Package,
  Blend,
  Crosshair,
  Image as ImageIcon,
  Sparkles,
  ChevronDown,
  Check,
  type LucideIcon,
} from 'lucide-react';
import {
  useAutoReplyRules,
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
import { CompletedOrdersExport } from '@/components/terminal/automation/CompletedOrdersExport';
import { AutoPaySettings } from '@/components/terminal/automation/AutoPaySettings';
import { AutoReplyExecutionLog } from '@/components/terminal/automation/AutoReplyExecutionLog';
import { SmallOrdersConfig } from '@/components/terminal/automation/SmallOrdersConfig';
import { HybridPriceAdjuster } from '@/components/terminal/automation/HybridPriceAdjuster';
import { AutoPricingRules } from '@/components/terminal/automation/AutoPricingRules';
import { AutoScreenshotConfig } from '@/components/terminal/automation/AutoScreenshotConfig';
import { CopilotPlaybookSettings } from '@/components/terminal/automation/CopilotPlaybookSettings';
import {
  Chip,
  CONFIRM_CANCEL,
  CONFIRM_CONTENT,
  CONFIRM_DELETE_DARK,
  CONFIRM_DESC,
  CONFIRM_FOOTER,
  CONFIRM_HEADER,
  CONFIRM_TITLE,
  ICON_BTN,
  ICON_BTN_DANGER,
  NUM,
  Panel,
  PanelHead,
  PanelState,
  SEG_LIST,
  SEG_TRIGGER,
  ShimmerRows,
  SideChip,
  SWITCH,
  TD,
  TH,
  type Tone,
} from '@/components/terminal/automation/automationUi';

// Chip tone by meaning (text carries the information; colour only supports it).
const TRIGGER_TONE: Record<string, Tone> = {
  order_received: 'primary',
  payment_marked: 'success',
  order_released: 'success',
  payment_pending: 'warning',
  order_cancelled: 'danger',
  order_appealed: 'danger',
  timer_breach: 'warning',
};

const ACTION_TONE: Record<string, Tone> = {
  go_online: 'success',
  go_offline: 'danger',
  take_rest: 'warning',
};

const ACTION_LABELS: Record<string, string> = {
  go_online: 'Go Online',
  go_offline: 'Go Offline',
  take_rest: 'Take Rest',
};

const AUTOMATION_TABS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'auto-reply', label: 'Auto-Reply Rules', icon: MessageSquare },
  { value: 'schedules', label: 'Merchant Schedule', icon: Calendar },
  { value: 'auto-pay', label: 'Auto-Pay', icon: Timer },
  { value: 'export', label: 'Export Orders', icon: FileDown },
  { value: 'small-orders', label: 'Small Orders', icon: Package },
  { value: 'hybrid', label: 'Hybrid Pricing', icon: Blend },
  { value: 'auto-pricing', label: 'Auto Pricing', icon: Crosshair },
  { value: 'auto-screenshot', label: 'Auto Screenshot', icon: ImageIcon },
  { value: 'ai-copilot', label: 'AI Copilot', icon: Sparkles },
];

/* ── Presentation helpers (rows render as a table on wide panels and as a stacked list on narrow ones;
 *    both keep the same text order: switch · name · trigger · trade · delay · message · actions) ── */

/** Small primary button in panel heads. */
const HEAD_BTN = 'h-8 gap-1.5 px-3 text-xs [&_svg]:size-3.5';

const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message ?? '') : '');
const ruleLabel = (r: AutoReplyRule) => (r.name?.trim() ? r.name : 'Untitled rule');
const scheduleLabel = (s: MerchantSchedule) => (s.name?.trim() ? s.name : 'Untitled schedule');
const hhmm = (t?: string | null) => t?.slice(0, 5);

/** Error-state hint: the server message (as data), then what to do next. */
function ReadErrorHint({ error }: { error: unknown }) {
  const message = errorText(error);
  return (
    <>
      {message ? <span className="t-mono block text-[11px] leading-4">{message}</span> : null}
      <span className={`block ${message ? 'mt-1' : ''}`}>Reload the page to try again.</span>
    </>
  );
}

/** Head-row chip for users whose role can't change anything in the list (display only; the controls keep their own state). */
function ViewOnlyChip({ title, spaced }: { title: string; spaced: boolean }) {
  return (
    <Chip title={title} className={`align-middle font-sans ${spaced ? 'ml-2' : ''}`}>
      View only
    </Chip>
  );
}

function TriggerChip({ event }: { event: string }) {
  const label = TRIGGER_LABELS[event];
  if (!label) {
    // Legacy / unknown trigger: show the stored value instead of an empty pill.
    return <Chip mono tone="neutral" title="Not one of the current trigger events">{event || '—'}</Chip>;
  }
  return <Chip tone={TRIGGER_TONE[event] ?? 'neutral'}>{label}</Chip>;
}

function TradeType({ value }: { value: AutoReplyRule['trade_type'] }) {
  if (!value) return <span className="whitespace-nowrap text-xs text-muted-foreground" title="All trade types">All</span>;
  const small = value === 'SMALL_BUY' || value === 'SMALL_SELL';
  // Word labels ("Small Buy") in the UI face; codes (BUY / SELL) stay mono like the Orders list.
  return <SideChip side={value} mono={!small}>{value === 'SMALL_BUY' ? 'Small Buy' : value === 'SMALL_SELL' ? 'Small Sale' : value}</SideChip>;
}

function DelayText({ seconds }: { seconds: number }) {
  if (seconds > 0) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-foreground ${NUM}`} title="Delay before sending">
        <Clock aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
        {seconds}s
      </span>
    );
  }
  return <span className="whitespace-nowrap text-xs text-muted-foreground">Instant</span>;
}

function TimeWindow({ start, end }: { start?: string | null; end?: string | null }) {
  const a = hhmm(start);
  const b = hhmm(end);
  const overnight = !!a && !!b && b < a;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`${NUM} text-xs text-foreground`}>{a} – {b}</span>
      {overnight && (
        <>
          <Chip tone="outline" mono aria-hidden="true" title="Ends the next day">+1d</Chip>
          <span className="sr-only">ends the next day</span>
        </>
      )}
    </span>
  );
}

export default function TerminalAutomation() {
  const { userId, hasPermission, isTerminalAdmin } = useTerminalAuth();
  const [prefs, setPref] = useTerminalUserPrefs(userId, 'automation', { activeTab: 'auto-reply' as string });
  const activeTab = prefs.activeTab;
  const setActiveTab = (v: string) => setPref('activeTab', v);
  const isMobile = useIsMobile();
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Mobile gesture: swipe right opens the tab-selection menu; swipe left/right also
  // steps between tabs so the whole tab set is reachable on a phone.
  const onTouchStart = (e: React.TouchEvent) => {
    // Don't hijack swipes that begin inside a horizontally scrollable region
    // (e.g. the logs table) — those belong to the scroll container.
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      const style = window.getComputedStyle(el);
      if (
        el.scrollWidth > el.clientWidth + 4 &&
        (style.overflowX === 'auto' || style.overflowX === 'scroll')
      ) {
        touchStart.current = null;
        return;
      }
      el = el.parentElement;
    }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || !touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 45) return;
    if (dx > 0) {
      // Swipe right → reveal the tab-selection menu.
      setTabMenuOpen(true);
    } else {
      // Swipe left → advance to the next tab.
      const idx = AUTOMATION_TABS.findIndex((tb) => tb.value === activeTab);
      const next = AUTOMATION_TABS[(idx + 1) % AUTOMATION_TABS.length];
      setActiveTab(next.value);
    }
  };

  // Presentation only: the tab strip fades at its right edge, and also at its left edge once it is scrolled
  // (tablet widths); keep the active tab clear of both fades.
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [tabStripScrolled, setTabStripScrolled] = useState(false);
  useEffect(() => {
    const strip = tabStripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const tab = strip.querySelector<HTMLElement>('[role=tab][data-state=active]');
    if (!tab) return;
    const s = strip.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    const fade = 40;
    const left = strip.scrollLeft > 0 ? s.left + fade : s.left;
    if (t.left < left) strip.scrollLeft -= left - t.left;
    else if (t.right > s.right - fade) strip.scrollLeft += t.right - (s.right - fade);
  }, [activeTab]);

  // Granular permission checks
  const canManageAutoReply = hasPermission('terminal_autoreply_manage') || isTerminalAdmin;
  const canToggleAutoReply = hasPermission('terminal_autoreply_toggle') || isTerminalAdmin;
  const canManagePricing = hasPermission('terminal_pricing_manage') || isTerminalAdmin;
  const canTogglePricing = hasPermission('terminal_pricing_toggle') || isTerminalAdmin;
  const canDeletePricing = hasPermission('terminal_pricing_delete') || isTerminalAdmin;
  const canToggleAutopay = hasPermission('terminal_autopay_toggle') || isTerminalAdmin;
  const canConfigureAutopay = hasPermission('terminal_autopay_configure') || isTerminalAdmin;
  const canDestructive = hasPermission('terminal_destructive') || isTerminalAdmin;
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MerchantSchedule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'rule' | 'schedule'; id: string } | null>(null);

  const { data: rulesData, isLoading: rulesLoading, isError: rulesIsError, error: rulesError } = useAutoReplyRules();
  const { data: schedulesData, isLoading: schedulesLoading, isError: schedulesIsError, error: schedulesError } = useMerchantSchedules();
  const rules = rulesData ?? [];
  const schedules = schedulesData ?? [];
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

  // Presentation only: the confirm keeps showing what it was about while it fades out.
  const lastDeleteRef = useRef(deleteConfirm);
  useEffect(() => { if (deleteConfirm) lastDeleteRef.current = deleteConfirm; }, [deleteConfirm]);
  const deleteTarget = deleteConfirm ?? lastDeleteRef.current;
  const deleteRuleItem = deleteTarget?.type === 'rule' ? rules.find((r) => r.id === deleteTarget.id) : undefined;
  const deleteScheduleItem = deleteTarget?.type === 'schedule' ? schedules.find((s) => s.id === deleteTarget.id) : undefined;
  const deleteDescription = deleteRuleItem
    ? `${deleteRuleItem.name?.trim() ? `“${deleteRuleItem.name}”` : 'This rule'} will be removed. This action cannot be undone.`
    : deleteScheduleItem
      ? `${deleteScheduleItem.name?.trim() ? `“${deleteScheduleItem.name}”` : 'This schedule'} (${DAY_LABELS[deleteScheduleItem.day_of_week] ?? 'day ' + deleteScheduleItem.day_of_week}, ${hhmm(deleteScheduleItem.start_time)} – ${hhmm(deleteScheduleItem.end_time)}) will be removed. This action cannot be undone.`
      : 'This action cannot be undone.';

  const currentTab = AUTOMATION_TABS.find((t) => t.value === activeTab) ?? AUTOMATION_TABS[0];
  const CurrentIcon = currentTab.icon;

  const showRuleActions = canManageAutoReply || canDestructive;
  const showScheduleActions = canManageAutoReply || canDestructive;
  // Display only: the role can't switch, edit, add or delete anything in the list (row switches are disabled and
  // there are no row buttons), so the head says so instead of leaving greyed-out switches unexplained.
  const rulesViewOnly = !canToggleAutoReply && !canManageAutoReply && !canDestructive;
  const schedulesViewOnly = !canManageAutoReply && !canDestructive;
  const activeRuleCount = rules.filter((r) => r.is_active).length;
  const activeScheduleCount = schedules.filter((s) => s.is_active).length;

  // Row switches save as soon as they are flipped, so they are named by aria-label only (no <label> to mis-click).
  const ruleSwitch = (rule: AutoReplyRule) => (
    <Switch
      checked={rule.is_active}
      onCheckedChange={(v) => toggleRule.mutate({ id: rule.id, is_active: v })}
      disabled={!canToggleAutoReply}
      aria-label={`Active: ${ruleLabel(rule)}`}
      className={SWITCH}
    />
  );
  const ruleActions = (rule: AutoReplyRule) => (
    <>
      {canManageAutoReply && (
        <button type="button" className={ICON_BTN} onClick={() => handleEditRule(rule)} aria-label={`Edit rule ${ruleLabel(rule)}`} title="Edit rule">
          <Pencil aria-hidden="true" />
        </button>
      )}
      {canDestructive && (
        <button type="button" className={ICON_BTN_DANGER} onClick={() => setDeleteConfirm({ type: 'rule', id: rule.id })} aria-label={`Delete rule ${ruleLabel(rule)}`} title="Delete rule">
          <Trash2 aria-hidden="true" />
        </button>
      )}
    </>
  );
  const scheduleSwitch = (s: MerchantSchedule) => (
    <Switch
      checked={s.is_active}
      onCheckedChange={(v) => toggleSchedule.mutate({ id: s.id, is_active: v })}
      disabled={!canManageAutoReply}
      aria-label={`Active: ${scheduleLabel(s)}`}
      className={SWITCH}
    />
  );
  const scheduleActions = (s: MerchantSchedule) => (
    <>
      {canManageAutoReply && (
        <button type="button" className={ICON_BTN} onClick={() => handleEditSchedule(s)} aria-label={`Edit schedule ${scheduleLabel(s)}`} title="Edit schedule">
          <Pencil aria-hidden="true" />
        </button>
      )}
      {canDestructive && (
        <button type="button" className={ICON_BTN_DANGER} onClick={() => setDeleteConfirm({ type: 'schedule', id: s.id })} aria-label={`Delete schedule ${scheduleLabel(s)}`} title="Delete schedule">
          <Trash2 aria-hidden="true" />
        </button>
      )}
    </>
  );
  const nameText = (label: string, untitled: boolean) =>
    untitled ? <span className="italic text-muted-foreground">{label}</span> : label;

  return (
    <TerminalPermissionGate permissions={['terminal_pricing_view']}>
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg border border-primary/20 shrink-0">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight text-foreground">Automation</h1>
            <p className="mt-0.5 text-xs text-muted-foreground [html.terminal-light_&]:text-foreground/80">Rules and engines that act on orders, chats and ad prices</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* Desktop / tablet: one-row segmented tab strip; scrolls sideways when it doesn't fit (right edge fades, and
            the left edge too once scrolled). Hidden through its wrapper: the global phone CSS forces every
            [role=tablist] to display:flex. */}
        <div className="hidden md:block">
          <div
            ref={tabStripRef}
            onScroll={(e) => setTabStripScrolled(e.currentTarget.scrollLeft > 1)}
            data-scrolled={tabStripScrolled ? 'true' : undefined}
            className="-mx-1 -my-1 overflow-x-auto px-1 py-1 pr-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-mask-image:linear-gradient(to_right,#000_calc(100%_-_2.5rem),transparent)] [mask-image:linear-gradient(to_right,#000_calc(100%_-_2.5rem),transparent)] data-[scrolled=true]:[-webkit-mask-image:linear-gradient(to_right,transparent,#000_2.5rem,#000_calc(100%_-_2.5rem),transparent)] data-[scrolled=true]:[mask-image:linear-gradient(to_right,transparent,#000_2.5rem,#000_calc(100%_-_2.5rem),transparent)]"
          >
            <TabsList aria-label="Automation sections" className={`${SEG_LIST} w-max max-w-none justify-start`}>
              {AUTOMATION_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className={`${SEG_TRIGGER} max-w-none shrink-0`}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        {/* Mobile: a single dropdown selector — tap or swipe right to open,
            picking a tab opens it and closes the menu. */}
        <div className="md:hidden">
          <DropdownMenu open={tabMenuOpen} onOpenChange={setTabMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 w-full justify-between gap-2 rounded-lg border-input bg-surface-subtle px-3 text-sm font-medium text-foreground shadow-none">
                <span className="flex min-w-0 items-center gap-2">
                  <CurrentIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{currentTab.label}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[60vh] overflow-y-auto">
              {AUTOMATION_TABS.map(({ value, label, icon: Icon }) => {
                const current = value === activeTab;
                return (
                  <DropdownMenuItem
                    key={value}
                    onSelect={() => { setActiveTab(value); setTabMenuOpen(false); }}
                    aria-current={current ? 'true' : undefined}
                    className={`min-h-10 gap-2 ${current ? 'bg-secondary/60 font-medium text-foreground' : ''}`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1">{label}</span>
                    {current && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>


        {/* ═══ AUTO-REPLY RULES ═══ */}
        <TabsContent value="auto-reply" className="mt-4 space-y-4">
          <Panel labelledBy="au-rules-title">
            <PanelHead
              icon={<MessageSquare />}
              title="Auto-reply rules"
              titleId="au-rules-title"
              meta={rules.length > 0 || rulesViewOnly ? (
                <>
                  {rules.length > 0 && (
                    <>
                      {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
                      <span className="hidden @[26rem]:inline"> · {activeRuleCount} active</span>
                    </>
                  )}
                  {rulesViewOnly && <ViewOnlyChip spaced={rules.length > 0} title="Your role can't switch, edit, add or delete auto-reply rules" />}
                </>
              ) : undefined}
              actions={canManageAutoReply ? (
                <Button size="sm" className={HEAD_BTN} onClick={handleCreateRule}>
                  <Plus aria-hidden="true" />
                  New Rule
                </Button>
              ) : undefined}
            />
            {rulesLoading ? (
              <ShimmerRows label="Loading auto-reply rules…" />
            ) : rulesIsError && !rulesData ? (
              <PanelState
                tone="danger"
                icon={<AlertTriangle />}
                title="Couldn't load auto-reply rules"
                hint={<ReadErrorHint error={rulesError} />}
              />
            ) : rules.length === 0 ? (
              <PanelState
                icon={<MessageSquare />}
                title="No auto-reply rules configured"
                hint="Create rules to automatically respond to order events"
              />
            ) : (
              <>
                {/* Stacked rows — narrow panels */}
                <ul className="divide-y divide-border @[52rem]:hidden">
                  {rules.map((rule) => {
                    const untitled = !rule.name?.trim();
                    return (
                      <li key={rule.id} className="flex items-start gap-3 px-3 py-3">
                        <div className="flex h-8 shrink-0 items-center">{ruleSwitch(rule)}</div>
                        <div className="min-w-0 flex-1 space-y-1.5 pt-1">
                          <div className="break-words text-sm font-medium leading-5 text-foreground">{nameText(ruleLabel(rule), untitled)}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="sr-only">Trigger:</span>
                            <TriggerChip event={rule.trigger_event} />
                            <span className="sr-only">Trade type:</span>
                            <TradeType value={rule.trade_type} />
                            <span className="sr-only">Delay:</span>
                            <DelayText seconds={rule.delay_seconds} />
                          </div>
                          <div className="line-clamp-2 break-words text-xs leading-4 text-muted-foreground @[36rem]:line-clamp-1" title={rule.message_template}>{rule.message_template}</div>
                        </div>
                        {showRuleActions && <div className="-mr-1 flex shrink-0 items-center gap-0.5">{ruleActions(rule)}</div>}
                      </li>
                    );
                  })}
                </ul>

                {/* Table — wide panels */}
                <div className="hidden @[52rem]:block">
                  <table className="w-full table-fixed text-xs">
                    <colgroup>
                      <col className="w-16" />
                      <col className="w-[24%]" />
                      <col className="w-40" />
                      <col className="w-28" />
                      <col className="w-20" />
                      <col />
                      {showRuleActions && <col className="w-24" />}
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col" className={`${TH} pl-4`}>Active</th>
                        <th scope="col" className={TH}>Rule name</th>
                        <th scope="col" className={TH}>Trigger</th>
                        <th scope="col" className={TH}>Trade type</th>
                        <th scope="col" className={TH}>Delay</th>
                        <th scope="col" className={TH}>Message preview</th>
                        {showRuleActions && <th scope="col" className={`${TH} pr-4 text-right`}><span className="sr-only">Actions</span></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule) => {
                        const untitled = !rule.name?.trim();
                        return (
                          <tr key={rule.id}>
                            <td className={`${TD} pl-4`}>{ruleSwitch(rule)}</td>
                            <td className={TD}>
                              <div className="break-words font-medium leading-5 text-foreground">{nameText(ruleLabel(rule), untitled)}</div>
                            </td>
                            <td className={TD}><TriggerChip event={rule.trigger_event} /></td>
                            <td className={TD}><TradeType value={rule.trade_type} /></td>
                            <td className={TD}><DelayText seconds={rule.delay_seconds} /></td>
                            <td className={TD}>
                              <div className="truncate text-muted-foreground" title={rule.message_template}>{rule.message_template}</div>
                            </td>
                            {showRuleActions && (
                              <td className={`${TD} pr-3`}>
                                <div className="flex items-center justify-end gap-0.5">{ruleActions(rule)}</div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>

          {/* Execution Log inline */}
          <AutoReplyExecutionLog />
        </TabsContent>

        {/* ═══ MERCHANT SCHEDULES ═══ */}
        <TabsContent value="schedules" className="mt-4 space-y-4">
          <Panel labelledBy="au-schedules-title">
            <PanelHead
              icon={<Calendar />}
              title="Merchant schedule"
              titleId="au-schedules-title"
              meta={schedules.length > 0 || schedulesViewOnly ? (
                <>
                  {schedules.length > 0 && (
                    <>
                      {schedules.length} {schedules.length === 1 ? 'schedule' : 'schedules'}
                      <span className="hidden @[26rem]:inline"> · {activeScheduleCount} active</span>
                    </>
                  )}
                  {schedulesViewOnly && <ViewOnlyChip spaced={schedules.length > 0} title="Your role can't switch, edit, add or delete schedules" />}
                </>
              ) : undefined}
              actions={canManageAutoReply ? (
                <Button size="sm" className={HEAD_BTN} onClick={handleCreateSchedule}>
                  <Plus aria-hidden="true" />
                  New Schedule
                </Button>
              ) : undefined}
            />
            {schedulesLoading ? (
              <ShimmerRows label="Loading schedules…" />
            ) : schedulesIsError && !schedulesData ? (
              <PanelState
                tone="danger"
                icon={<AlertTriangle />}
                title="Couldn't load schedules"
                hint={<ReadErrorHint error={schedulesError} />}
              />
            ) : schedules.length === 0 ? (
              <PanelState
                icon={<Calendar />}
                title="No schedules configured"
                hint="Create schedules to automate online/offline timing"
              />
            ) : (
              <>
                {/* Stacked rows — narrow panels */}
                <ul className="divide-y divide-border @[52rem]:hidden">
                  {schedules.map((s) => {
                    const untitled = !s.name?.trim();
                    return (
                      <li key={s.id} className="flex items-start gap-3 px-3 py-3">
                        <div className="flex h-8 shrink-0 items-center">{scheduleSwitch(s)}</div>
                        <div className="min-w-0 flex-1 space-y-1.5 pt-1">
                          <div className="break-words text-sm font-medium leading-5 text-foreground">{nameText(scheduleLabel(s), untitled)}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Chip tone="outline">{DAY_LABELS[s.day_of_week]}</Chip>
                            <TimeWindow start={s.start_time} end={s.end_time} />
                            <span className="sr-only">Action:</span>
                            <Chip tone={ACTION_TONE[s.action] ?? 'neutral'}>{ACTION_LABELS[s.action] ?? s.action}</Chip>
                          </div>
                        </div>
                        {showScheduleActions && <div className="-mr-1 flex shrink-0 items-center gap-0.5">{scheduleActions(s)}</div>}
                      </li>
                    );
                  })}
                </ul>

                {/* Table — wide panels. The name column is capped so Day / Time / Action stay next to the name on wide
                    screens; the Action column takes the remaining width (the row buttons stay at the right edge). */}
                <div className="hidden @[52rem]:block">
                  <table className="w-full table-fixed text-xs">
                    <colgroup>
                      <col className="w-16" />
                      <col className="w-[32%]" />
                      <col className="w-32" />
                      <col className="w-44" />
                      <col />
                      {showScheduleActions && <col className="w-24" />}
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col" className={`${TH} pl-4`}>Active</th>
                        <th scope="col" className={TH}>Name</th>
                        <th scope="col" className={TH}>Day</th>
                        <th scope="col" className={TH}>Time window</th>
                        <th scope="col" className={TH}>Action</th>
                        {showScheduleActions && <th scope="col" className={`${TH} pr-4 text-right`}><span className="sr-only">Actions</span></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map((s) => {
                        const untitled = !s.name?.trim();
                        return (
                          <tr key={s.id}>
                            <td className={`${TD} pl-4`}>{scheduleSwitch(s)}</td>
                            <td className={TD}>
                              <div className="break-words font-medium leading-5 text-foreground">{nameText(scheduleLabel(s), untitled)}</div>
                            </td>
                            <td className={TD}><Chip tone="outline">{DAY_LABELS[s.day_of_week]}</Chip></td>
                            <td className={TD}><TimeWindow start={s.start_time} end={s.end_time} /></td>
                            <td className={TD}><Chip tone={ACTION_TONE[s.action] ?? 'neutral'}>{ACTION_LABELS[s.action] ?? s.action}</Chip></td>
                            {showScheduleActions && (
                              <td className={`${TD} pr-3`}>
                                <div className="flex items-center justify-end gap-0.5">{scheduleActions(s)}</div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
        </TabsContent>

        {/* ═══ AUTO-PAY ═══ */}
        <TabsContent value="auto-pay" className="mt-4">
          <AutoPaySettings canToggle={canToggleAutopay} canConfigure={canConfigureAutopay} />
        </TabsContent>

        {/* ═══ EXPORT ORDERS ═══ */}
        <TabsContent value="export" className="mt-4">
          <CompletedOrdersExport />
        </TabsContent>

        {/* ═══ SMALL ORDERS (Sales + Buys) ═══ */}
        <TabsContent value="small-orders" className="mt-4">
          <SmallOrdersConfig />
        </TabsContent>

        {/* ═══ HYBRID PRICING ═══ */}
        <TabsContent value="hybrid" className="mt-4">
          <HybridPriceAdjuster />
        </TabsContent>

        {/* ═══ AUTO PRICING ═══ */}
        <TabsContent value="auto-pricing" className="mt-4">
          <AutoPricingRules canManage={canManagePricing} canToggle={canTogglePricing} canDelete={canDeletePricing} />
        </TabsContent>

        {/* ═══ AUTO SCREENSHOT ═══ */}
        <TabsContent value="auto-screenshot" className="mt-4">
          <AutoScreenshotConfig canManage={canManagePricing} />
        </TabsContent>

        {/* ═══ AI COPILOT ═══ */}
        <TabsContent value="ai-copilot" className="mt-4">
          <CopilotPlaybookSettings />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AutoReplyRuleDialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen} editingRule={editingRule} />
      <ScheduleDialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen} editingSchedule={editingSchedule} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className={CONFIRM_CONTENT}>
          <AlertDialogHeader className={CONFIRM_HEADER}>
            <AlertDialogTitle className={CONFIRM_TITLE}>
              Delete {deleteTarget?.type === 'rule' ? 'Rule' : 'Schedule'}?
            </AlertDialogTitle>
            <AlertDialogDescription className={CONFIRM_DESC}>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={CONFIRM_FOOTER}>
            <AlertDialogCancel className={CONFIRM_CANCEL}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className={`${buttonVariants({ variant: 'destructive' })} ${CONFIRM_DELETE_DARK}`}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TerminalPermissionGate>
  );
}
