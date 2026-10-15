import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle, Zap } from 'lucide-react';
import { useAutoReplyLogs, TRIGGER_LABELS, type AutoReplyLog } from '@/hooks/useAutomation';
import { format } from 'date-fns';
import { Chip, NUM, Panel, PanelHead, PanelState, SCROLL_BOX, ShimmerRows, TD, TH, TH_STICKY, type Tone } from './automationUi';

// Chip tone by meaning (same mapping as the rules list).
const TRIGGER_TONE: Record<string, Tone> = {
  order_received: 'primary',
  payment_marked: 'success',
  order_released: 'success',
  payment_pending: 'warning',
  order_cancelled: 'danger',
  order_appealed: 'danger',
  timer_breach: 'warning',
};

const STATUS: Record<string, { label: string; tone: Tone; icon: ReactNode }> = {
  sent: { label: 'Sent', tone: 'success', icon: <CheckCircle2 aria-hidden="true" /> },
  failed: { label: 'Failed', tone: 'danger', icon: <XCircle aria-hidden="true" /> },
  skipped: { label: 'Skipped', tone: 'neutral', icon: <MinusCircle aria-hidden="true" /> },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS[status];
  if (!s) return <Chip tone="neutral">{status}</Chip>;
  return (
    <Chip tone={s.tone}>
      {s.icon}
      {s.label}
    </Chip>
  );
}

function TriggerChip({ event }: { event: string }) {
  const label = TRIGGER_LABELS[event];
  if (!label) return <Chip mono tone="neutral" title="Not one of the current trigger events">{event}</Chip>;
  return <Chip tone={TRIGGER_TONE[event] ?? 'neutral'}>{label}</Chip>;
}

/** "…12345678" (last 8 digits) with the full order number on hover. Keep it the element's own text. */
function OrderRef({ orderNumber, className }: { orderNumber: string; className?: string }) {
  return <span className={`${NUM} ${className ?? ''}`} title={orderNumber}>…{orderNumber.slice(-8)}</span>;
}

const errorTone = (log: AutoReplyLog) => (log.status === 'failed' ? 'text-trade-sell' : 'text-muted-foreground');
const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message ?? '') : '');

export function AutoReplyExecutionLog() {
  const { data, isLoading: logsLoading, isError, error } = useAutoReplyLogs();
  const logs = data ?? [];
  const readFailed = isError && !data;
  const errorMessage = errorText(error);

  return (
    <Panel labelledBy="au-log-title">
      <PanelHead
        icon={<Zap />}
        title="Execution log"
        titleId="au-log-title"
        // Count + poll cadence (useAutoReplyLogs: latest 50, refetchInterval 30 s). No count at 0 or while loading/failed:
        // the empty / error state says it.
        meta={logs.length > 0 ? (
          <>
            <span title="The 50 most recent executions, newest first">{`${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}`}</span>
            <span> · refreshes every 30 s</span>
          </>
        ) : undefined}
      />
      {logsLoading ? (
        <ShimmerRows label="Loading execution log…" />
      ) : readFailed ? (
        <PanelState
          tone="danger"
          icon={<AlertTriangle />}
          title="Couldn't load the execution log"
          hint={
            <>
              {errorMessage ? <span className="t-mono block text-[11px] leading-4">{errorMessage}</span> : null}
              <span className={`block ${errorMessage ? 'mt-1' : ''}`}>Retrying every 30 s.</span>
            </>
          }
        />
      ) : logs.length === 0 ? (
        <PanelState
          icon={<Zap />}
          title="No executions yet"
          hint="Logs will appear here when auto-reply rules are triggered"
        />
      ) : (
        <>
          {/* Stacked rows — narrow panels. Text order matches the table: status · trigger · order · message · error · time.
              The first column has a fixed width (fits "Skipped" and "…12345678"), so trigger chips and messages line up
              from row to row; an unusually long raw status only widens its own row. */}
          <ul className="divide-y divide-border @[52rem]:hidden">
            {logs.map((log) => {
              const time = new Date(log.executed_at);
              return (
                <li key={log.id} className="grid grid-cols-[minmax(4.75rem,auto)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5">
                  <span className="col-start-1 row-start-1 flex"><StatusChip status={log.status} /></span>
                  <span className="col-start-2 row-start-1 flex min-w-0"><TriggerChip event={log.trigger_event} /></span>
                  <OrderRef orderNumber={log.order_number} className="col-start-1 row-start-2 self-start text-[11px] leading-4 text-foreground" />
                  <span className="col-start-2 col-end-4 row-start-2 line-clamp-2 break-words text-xs leading-4 text-foreground" title={log.message_sent}>{log.message_sent}</span>
                  {log.error_message && (
                    <span className={`col-span-3 row-start-3 line-clamp-2 break-words text-[11px] leading-4 ${errorTone(log)}`} title={log.error_message}>{log.error_message}</span>
                  )}
                  <span className={`${NUM} col-start-3 row-start-1 text-[11px] text-muted-foreground`} title={format(time, 'dd MMM yyyy, HH:mm:ss')}>
                    {format(time, 'dd MMM HH:mm:ss')}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Table — wide panels: real scroll box with a sticky header (the old ScrollArea clipped rows). */}
          <div role="region" aria-label="Execution log entries" tabIndex={0} className={`${SCROLL_BOX} hidden max-h-[30rem] @[52rem]:block`}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th scope="col" className={`${TH} ${TH_STICKY} pl-4`}>Status</th>
                  <th scope="col" className={`${TH} ${TH_STICKY}`}>Trigger</th>
                  <th scope="col" className={`${TH} ${TH_STICKY}`}>Order</th>
                  <th scope="col" className={`${TH} ${TH_STICKY}`}>Message</th>
                  <th scope="col" className={`${TH} ${TH_STICKY} pr-4 text-right`}>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const time = new Date(log.executed_at);
                  return (
                    <tr key={log.id}>
                      <td className={`${TD} pl-4`}><StatusChip status={log.status} /></td>
                      <td className={TD}><TriggerChip event={log.trigger_event} /></td>
                      <td className={TD}><OrderRef orderNumber={log.order_number} className="text-foreground" /></td>
                      <td className={`${TD} w-full max-w-0`}>
                        <div className="truncate text-foreground" title={log.message_sent}>{log.message_sent}</div>
                        {log.error_message && (
                          <div className={`mt-0.5 line-clamp-2 break-words text-[11px] leading-4 ${errorTone(log)}`} title={log.error_message}>{log.error_message}</div>
                        )}
                      </td>
                      <td className={`${TD} ${NUM} pr-4 text-right text-muted-foreground`} title={format(time, 'dd MMM yyyy, HH:mm:ss')}>
                        {format(time, 'dd MMM HH:mm:ss')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
