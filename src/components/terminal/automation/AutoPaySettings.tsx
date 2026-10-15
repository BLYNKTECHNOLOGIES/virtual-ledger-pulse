import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Timer, CheckCircle2, XCircle, AlertTriangle, Hourglass, Clock, MinusCircle, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { logAdAction, AdActionTypes } from "@/hooks/useAdActionLog";
import {
  Chip,
  HINT,
  InlineNotice,
  NUM,
  Panel,
  PanelHead,
  PanelState,
  SCROLL_BOX,
  SectionHead,
  SettingRow,
  ShimmerRows,
  SWITCH,
  TD,
  TH,
  TH_STICKY,
  UNIT,
  type Tone,
} from "./automationUi";

interface AutoPaySettingsProps {
  canToggle?: boolean;
  canConfigure?: boolean;
}

/** "release_overdue" → "Release overdue" (the raw code stays in the chip's title). */
const humanize = (code: string) => {
  const s = code.replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";
};

/** Auto-pay log status → chip (word + icon; colour only supports the word). */
const LOG_STATUS: Record<string, { label: string; tone: Tone; icon: ReactNode }> = {
  success: { label: "Success", tone: "success", icon: <CheckCircle2 /> },
  failed: { label: "Failed", tone: "danger", icon: <XCircle /> },
  warning: { label: "Warning", tone: "warning", icon: <AlertTriangle /> },
  unverified_success: { label: "Unverified", tone: "warning", icon: <AlertTriangle /> },
  pending: { label: "Pending", tone: "info", icon: <Clock /> },
  skipped: { label: "Skipped", tone: "neutral", icon: <MinusCircle /> },
};
const logStatus = (status: string) => {
  const s = String(status ?? "");
  return LOG_STATUS[s] ?? { label: humanize(s), tone: "neutral" as Tone, icon: <Timer /> };
};

/** Release-deadline check status → chip. Same colour meaning as before, with readable words. */
const RELEASE_STATUS: Record<string, { label: string; tone: Tone }> = {
  resolved: { label: "Resolved", tone: "success" },
  overdue: { label: "Overdue", tone: "warning" },
  release_overdue: { label: "Release overdue", tone: "warning" },
  complaint_window_closing: { label: "Complaint window closing", tone: "warning" },
  already_appeal: { label: "In appeal", tone: "warning" },
  complaint_window_expired: { label: "Complaint window expired", tone: "danger" },
  detail_unavailable: { label: "Detail unavailable", tone: "danger" },
  error: { label: "Error", tone: "danger" },
};
const releaseStatus = (status: string) => {
  const s = String(status ?? "");
  return RELEASE_STATUS[s] ?? { label: humanize(s), tone: "neutral" as Tone };
};

/** Decision / error text colour follows the row's status (a successful row is never red). */
const detailTone = (status: string) =>
  status === "failed" ? "text-trade-sell" : status === "warning" || status === "unverified_success" ? "text-warning" : "text-muted-foreground";

/** Binance timestamp cell content: the time, or the existing "missing" wording. */
const stamp = (value: string | null | undefined, missing: string) =>
  value ? <span className={NUM}>{format(new Date(value), "dd MMM HH:mm:ss")}</span> : <span className="whitespace-nowrap text-muted-foreground">{missing}</span>;

/** Hint of a failed log read: the server's message (mono), then the retry line. Both logs poll every 30 s. */
const failHint = (err: unknown) => {
  const message = String((err as Error | null)?.message ?? "").trim();
  return (
    <>
      {message && <p className="t-mono text-[11px] leading-4 [overflow-wrap:anywhere]">{message}</p>}
      <p className={message ? "mt-1" : undefined}>Retrying every 30 s.</p>
    </>
  );
};

/** Long tables scroll inside a capped box only on wide panels; on narrow panels they flow with the page and only scroll
 *  sideways, so a vertical swipe on a phone moves the page instead of getting trapped in the table. */
const FLOW_ON_NARROW = "max-h-none";

export function AutoPaySettings({ canToggle = true, canConfigure = true }: AutoPaySettingsProps) {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["auto-pay-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("p2p_auto_pay_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: settings, isLoading } = settingsQuery;

  const logsQuery = useQuery({
    queryKey: ["auto-pay-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("p2p_auto_pay_log")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });
  const { data: logs = [], isLoading: logsLoading } = logsQuery;

  const releaseQuery = useQuery({
    queryKey: ["release-deadline-monitor-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("p2p_release_deadline_monitor_log" as any)
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });
  const { data: releaseLogs = [], isLoading: releaseLogsLoading } = releaseQuery;

  // Read failures (no data at all) are shown as errors, not as "off" / "nothing yet".
  const settingsFailed = settingsQuery.isError && !settingsQuery.data;
  const logsFailed = logsQuery.isError && !logsQuery.data;
  const releaseFailed = releaseQuery.isError && !releaseQuery.data;

  const overdueReleaseCount = releaseLogs.filter((log: any) => ["overdue", "release_overdue", "complaint_window_closing", "complaint_window_expired"].includes(log.status)).length;
  const awaitingReleaseCount = logs.filter((log: any) => {
    if (!log.confirm_pay_end_time || !["success", "unverified_success"].includes(log.status)) return false;
    return new Date(log.confirm_pay_end_time).getTime() > Date.now();
  }).length;

  const updateSettings = useMutation({
    mutationFn: async (updates: { is_active?: boolean; minutes_before_expiry?: number }) => {
      if (!settings?.id) {
        // Insert if no row
        const { error } = await supabase.from("p2p_auto_pay_settings").insert({
          is_active: updates.is_active ?? false,
          minutes_before_expiry: updates.minutes_before_expiry ?? 3,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("p2p_auto_pay_settings")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", settings.id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["auto-pay-settings"] });
      toast.success("Auto-pay settings updated");
      if ('is_active' in variables) {
        logAdAction({ actionType: AdActionTypes.AUTO_PAY_TOGGLED, adDetails: { is_active: variables.is_active } });
      }
      if ('minutes_before_expiry' in variables) {
        logAdAction({ actionType: AdActionTypes.AUTO_PAY_MINUTES_CHANGED, adDetails: { minutes_before_expiry: variables.minutes_before_expiry } });
      }
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  const [localMinutes, setLocalMinutes] = useState<string>("");

  const currentMinutes = localMinutes || String(settings?.minutes_before_expiry || 3);

  if (isLoading) {
    // No headings while the settings load (same as before) — just placeholder rows.
    return (
      <div className="space-y-4">
        <Panel label="Auto-Pay settings">
          <ShimmerRows rows={3} label="Loading Auto-Pay settings…" />
        </Panel>
      </div>
    );
  }

  const autoPayOn = !!settings?.is_active;

  return (
    <div className="space-y-4">
      {/* ── Settings ── */}
      <Panel labelledBy="ap-settings-title">
        <SectionHead
          icon={<Timer />}
          title="Auto-Pay before expiry"
          titleId="ap-settings-title"
          // The state in words (the switch alone shows it by colour). Not shown after a failed read: the state is unknown.
          aside={settingsFailed ? undefined : <Chip tone={autoPayOn ? "success" : "neutral"}>{autoPayOn ? "Enabled" : "Disabled"}</Chip>}
        />
        {settingsFailed && (
          <div className="px-4 pt-3">
            {/* A save after a failed read inserts a row, which the one-row settings table rejects. */}
            <InlineNotice tone="danger" title="Couldn't load the saved settings">
              The values below are defaults, not what is saved. Changes can't be saved until the settings load.
            </InlineNotice>
          </div>
        )}
        <div className="divide-y divide-border">
          {/* Named with aria-labelledby, not <label for>: the switch saves immediately, so clicking its text must not flip it. */}
          <SettingRow
            label="Enable Auto-Pay"
            labelId="ap-enable-label"
            description={
              <>
                Automatically mark BUY orders as paid when they reach the final minutes before expiry
                {!canToggle && <span className="block">View only — your role can't switch Auto-Pay on or off.</span>}
              </>
            }
          >
            <Switch
              id="ap-enable"
              aria-labelledby="ap-enable-label"
              className={SWITCH}
              checked={settings?.is_active ?? false}
              onCheckedChange={(v) => updateSettings.mutate({ is_active: v })}
              disabled={!canToggle}
            />
          </SettingRow>

          {settings?.is_active && (
            <>
              <SettingRow
                label="Minutes before expiry"
                htmlFor="ap-minutes"
                description={
                  <>
                    Saved when you leave the field.
                    {!canConfigure && <span className="block">View only — your role can't change the timing.</span>}
                  </>
                }
              >
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  {/* "min" sits outside the box: an overlaid suffix would push the native spin buttons under the
                      input's centre, where a plain click lands. */}
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="ap-minutes"
                      type="number"
                      min={1}
                      max={30}
                      value={currentMinutes}
                      onChange={(e) => setLocalMinutes(e.target.value)}
                      onBlur={() => {
                        const val = Math.max(1, Math.min(30, parseInt(currentMinutes) || 3));
                        setLocalMinutes(String(val));
                        updateSettings.mutate({ minutes_before_expiry: val });
                      }}
                      aria-describedby="ap-minutes-hint"
                      className="h-8 w-20 text-sm t-mono tabular-nums"
                      disabled={!canConfigure}
                    />
                    <span aria-hidden="true" className={UNIT}>min</span>
                  </div>
                  <span id="ap-minutes-hint" className={HINT}>1–30 min</span>
                </div>
              </SettingRow>
              <div className="px-4 py-3">
                <InlineNotice tone="warning">
                  Orders will be marked as paid when less than <strong className="font-semibold text-foreground">{currentMinutes} minutes</strong> remain before expiry.
                  This runs every 60 seconds via the automation engine.
                </InlineNotice>
              </div>
            </>
          )}
        </div>
      </Panel>

      {/* ── Release deadline monitoring ── */}
      <Panel labelledBy="ap-release-title">
        <PanelHead
          icon={<Hourglass />}
          title="Release deadline monitoring"
          titleId="ap-release-title"
          actions={
            <>
              {!logsLoading && !logsFailed && (
                <Chip tone="neutral" title="Marked-paid orders whose seller release deadline has not passed yet">
                  {awaitingReleaseCount} deadline pending
                </Chip>
              )}
              {overdueReleaseCount > 0 && (
                <Chip tone="warning" title="Checks that are overdue, release overdue, or have a complaint window closing or expired">
                  {overdueReleaseCount} overdue
                </Chip>
              )}
            </>
          }
        />
        <p className="border-b border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
          Monitoring checks marked-paid orders from the last 48 hours and skips orders already resolved or in appeal. Refreshes
          every 30 s.
        </p>
        {releaseLogsLoading ? (
          <ShimmerRows rows={3} label="Loading release deadline checks…" />
        ) : releaseFailed ? (
          <PanelState tone="danger" icon={<AlertTriangle />} title="Couldn't load the release checks" hint={failHint(releaseQuery.error)} />
        ) : releaseLogs.length === 0 ? (
          <PanelState
            icon={<Hourglass />}
            title="No overdue release checks yet"
            hint="Checks appear after marked-paid orders pass Binance seller release deadline"
          />
        ) : (
          <div className={`${SCROLL_BOX} ${FLOW_ON_NARROW} @[52rem]:max-h-[20rem]`} tabIndex={0} role="region" aria-label="Release deadline checks">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className={`${TH} ${TH_STICKY} pl-4`}>Order</th>
                  <th className={`${TH} ${TH_STICKY}`}>Status</th>
                  <th className={`${TH} ${TH_STICKY} text-right`}>Overdue</th>
                  <th className={`${TH} ${TH_STICKY}`}>Binance Paid</th>
                  <th className={`${TH} ${TH_STICKY}`}>Release Deadline</th>
                  <th className={`${TH} ${TH_STICKY}`}>Complaint Cutoff</th>
                  <th className={`${TH} ${TH_STICKY} pr-4`}>Checked</th>
                </tr>
              </thead>
              <tbody>
                {releaseLogs.map((log: any) => {
                  const st = releaseStatus(log.status);
                  return (
                    <tr key={log.id}>
                      <td className={`${TD} ${NUM} pl-4 text-foreground`} title={log.order_number ?? undefined}>…{log.order_number?.slice(-8)}</td>
                      <td className={TD}>
                        <Chip tone={st.tone} title={log.message ? `${log.status} — ${log.message}` : log.status}>{st.label}</Chip>
                        {log.live_order_status && <div className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">Binance: {log.live_order_status}</div>}
                      </td>
                      <td className={`${TD} ${NUM} text-right text-foreground`}>{log.minutes_overdue != null ? `${Number(log.minutes_overdue).toFixed(1)} min` : "—"}</td>
                      <td className={TD}>{stamp(log.notify_pay_time, "Not returned by Binance")}</td>
                      <td className={TD}>{stamp(log.confirm_pay_end_time, "Not returned by Binance")}</td>
                      <td className={TD}>{stamp(log.complain_freeze_time, "Not returned by Binance")}</td>
                      <td className={`${TD} ${NUM} pr-4 text-muted-foreground`}>{format(new Date(log.checked_at), "dd MMM HH:mm:ss")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Execution log ── */}
      <Panel labelledBy="ap-log-title">
        <PanelHead
          icon={<ScrollText />}
          title="Auto-Pay log"
          titleId="ap-log-title"
          meta={
            !logsLoading && !logsFailed ? (
              <>
                <span title="The 50 most recent executions, newest first">{`${logs.length} ${logs.length === 1 ? "entry" : "entries"}`}</span>
                <span> · refreshes every 30 s</span>
              </>
            ) : undefined
          }
        />
        {logsLoading ? (
          <ShimmerRows rows={4} label="Loading the Auto-Pay log…" />
        ) : logsFailed ? (
          <PanelState tone="danger" icon={<AlertTriangle />} title="Couldn't load the Auto-Pay log" hint={failHint(logsQuery.error)} />
        ) : logs.length === 0 ? (
          <PanelState
            icon={<Timer />}
            title="No auto-pay executions yet"
            hint="Logs will appear when auto-pay triggers on active BUY orders"
          />
        ) : (
          <div className={`${SCROLL_BOX} ${FLOW_ON_NARROW} @[52rem]:max-h-[28rem]`} tabIndex={0} role="region" aria-label="Auto-Pay log entries">
            {/* Details (the reason) follows Status and Order, so on phones and tablets it is on screen without scrolling
                past the timestamp columns. */}
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className={`${TH} ${TH_STICKY} pl-4`}>Status</th>
                  <th className={`${TH} ${TH_STICKY}`}>Order</th>
                  <th className={`${TH} ${TH_STICKY}`}>Details</th>
                  <th className={`${TH} ${TH_STICKY} text-right`}>Min Remaining</th>
                  <th className={`${TH} ${TH_STICKY}`}>Binance Paid</th>
                  <th className={`${TH} ${TH_STICKY}`}>Release Deadline</th>
                  <th className={`${TH} ${TH_STICKY}`}>Complaint Cutoff</th>
                  <th className={`${TH} ${TH_STICKY} pr-4`}>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => {
                  const st = logStatus(log.status);
                  const detail = log.error_message ? `${log.decision_reason ? `${log.decision_reason}: ` : ""}${log.error_message}` : null;
                  return (
                    <tr key={log.id}>
                      <td className={`${TD} pl-4`}>
                        <Chip tone={st.tone} title={log.status ?? undefined}>
                          {st.icon}
                          {st.label}
                        </Chip>
                      </td>
                      <td className={`${TD} ${NUM} text-foreground`} title={log.order_number ?? undefined}>…{log.order_number?.slice(-8)}</td>
                      <td className={TD}>
                        {log.error_message ? (
                          <p
                            className={`line-clamp-3 min-w-[9.5rem] max-w-[22rem] whitespace-normal text-xs leading-4 [overflow-wrap:anywhere] @[36rem]:min-w-[14rem] @[52rem]:line-clamp-2 ${detailTone(log.status)}`}
                            title={detail ?? undefined}
                          >
                            {log.decision_reason ? `${log.decision_reason}: ` : ""}{log.error_message}
                          </p>
                        ) : (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">{log.decision_reason || "—"}</span>
                        )}
                      </td>
                      <td className={`${TD} ${NUM} text-right text-foreground`}>
                        {log.minutes_remaining != null ? `${parseFloat(log.minutes_remaining).toFixed(1)} min` : "—"}
                      </td>
                      <td className={TD}>{stamp(log.notify_pay_time, "Not returned by Binance")}</td>
                      <td className={TD}>{stamp(log.confirm_pay_end_time, "—")}</td>
                      <td className={TD}>{stamp(log.complain_freeze_time, "Not returned by Binance")}</td>
                      <td className={`${TD} ${NUM} pr-4 text-muted-foreground`}>
                        {format(new Date(log.executed_at), "dd MMM HH:mm:ss")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
