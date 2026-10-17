// Playbook stats (approvers): how much the Playbook covers, how the two draft models compare, and AI spend.
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { modelLabel } from '@/lib/copilot/copilotText';
import { ACTION_LABEL, CAUSE_LABEL, inr, istShort, pct, rankModels } from '@/lib/copilot/playbookAdmin';
import { situationLabel } from '@/lib/copilot/situations';
import { useCopilotSituations, useCopilotStats, useUserNames, userLabel } from '@/hooks/useCopilotAdmin';

function Kpi({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
      {children}
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PlaybookStats({ onOpenEntry }: { onOpenEntry: (entryId: string) => void }) {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data: s, isLoading, error } = useCopilotStats(Number(days), true);
  const { data: users = [] } = useUserNames();
  const { data: situations } = useCopilotSituations();
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const models = useMemo(() => rankModels(s?.models ?? []), [s?.models]);

  if (isLoading) return <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (error || !s) return <p className="py-8 text-center text-sm text-destructive">{(error as Error)?.message ?? 'Could not load stats'}</p>;

  const approved = s.entries.approved;
  const spendPct = s.spend.limit_inr > 0 ? Math.min(100, (s.spend.month_inr / s.spend.limit_inr) * 100) : 100;
  // Every day of this month so far (IST), so quiet days show as gaps rather than disappearing.
  const spentByDay = new Map(s.spend.by_day.map((d) => [d.day, Number(d.inr)]));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const monthDays = Array.from({ length: Number(today.slice(8, 10)) }, (_, i) => {
    const day = `${today.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
    return { day, inr: spentByDay.get(day) ?? 0 };
  });
  const maxDay = Math.max(0.01, ...monthDays.map((d) => d.inr));
  const learned = Object.entries(s.learning.by_action).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Coverage, models and saves over the last {s.days} days; spend for this month (IST).</p>
        <SegmentedControl size="sm" value={days} onValueChange={(v) => setDays(v as '7' | '30' | '90')} aria-label="Period"
          options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Approved replies" value={String(approved)} sub={approved >= 50 ? 'Enough to plan replies for operators' : `${50 - approved} more before operators can be considered`}>
          <Progress value={Math.min(100, (approved / 50) * 100)} className="mt-1 h-1.5" />
        </Kpi>
        <Kpi label="Questions answered from the Playbook" value={pct(s.coverage.approved, s.coverage.questions)}
          sub={s.coverage.questions ? `${s.coverage.approved} of ${s.coverage.questions} client questions had an approved reply · target 80%` : 'No client questions yet in this period'} />
        <Kpi label="Tentative · conflicts" value={`${s.entries.tentative} · ${s.entries.conflicts}`}
          sub={`${s.entries.expired} trial${s.entries.expired === 1 ? '' : 's'} ended unused · ${s.entries.retired} retired${s.entries.questions != null ? ` · ${s.entries.questions} questions` : ''}${s.entries.outdated_copies ? ` · ${s.entries.outdated_copies} out-of-date language cop${s.entries.outdated_copies === 1 ? 'y' : 'ies'}` : ''}`} />
        <Kpi label="AI spend this month" value={inr(s.spend.month_inr)} sub={`of ${inr(s.spend.limit_inr)} · alerts at ${s.spend.alert_pcts.join('% and ')}%`}>
          <Progress value={spendPct} className="mt-1 h-1.5" />
        </Kpi>
      </div>

      {s.situations && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Situations</CardTitle>
            <CardDescription className="text-xs">
              How often you changed the situation the Copilot worked out for a chat — {s.situations.corrected} change{s.situations.corrected === 1 ? '' : 's'} in {s.situations.checked} suggestion{s.situations.checked === 1 ? '' : 's'} ({pct(s.situations.corrected, s.situations.checked)}). Frequent changes show where the detection should learn a new pattern.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!s.situations.changes.length ? <p className="text-xs text-muted-foreground">No changes in this period.</p> : (
              <ul className="space-y-1 text-xs">
                {s.situations.changes.map((c) => (
                  <li key={`${c.detected}-${c.set}`} className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="tabular-nums font-semibold text-foreground">{c.n}×</span>
                    <span className="text-muted-foreground">{c.detected ? situationLabel(c.detected, situations) : 'Unknown'}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-foreground">{situationLabel(c.set, situations)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Draft models compared</CardTitle>
          <CardDescription className="text-xs">“Taken” = sent or approved. Unedited = taken word for word — the clearest sign of a good draft. After a few weeks, keep the better model.</CardDescription>
        </CardHeader>
        <CardContent>
          {!models.length ? <p className="text-xs text-muted-foreground">No AI drafts in this period.</p> : (<>
            <ul className="space-y-2 sm:hidden">
              {models.map((m) => (
                <li key={m.model} className="rounded-md border border-border bg-secondary/20 p-2.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">{modelLabel(m.model)}</span>
                    <span className="tabular-nums text-muted-foreground">{inr(m.cost_inr)}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-1 tabular-nums text-muted-foreground">
                    <span>Drafts <b className="font-semibold text-foreground">{m.drafts}</b></span>
                    <span>Taken <b className="font-semibold text-foreground">{m.takenPct}</b></span>
                    <span>Unedited <b className="font-semibold text-foreground">{m.uneditedPct}</b></span>
                    <span>Rejected {m.rejected}</span>
                    <span>Held back {m.held_back}</span>
                    <span>{m.avg_latency_ms ? `${(m.avg_latency_ms / 1000).toFixed(1)} s` : '—'}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[34rem] text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Model</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Drafts</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Taken</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Unedited</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Rejected</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Held back</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Avg time</th>
                    <th className="py-1.5 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.model} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{modelLabel(m.model)}{m.new_policy > 0 && <span className="ml-1 text-[10px] font-normal text-warning">{m.new_policy} new-policy</span>}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.drafts}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.used + m.approved} <span className="text-muted-foreground">({m.takenPct})</span></td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold text-foreground">{m.unedited} <span className="font-normal text-muted-foreground">({m.uneditedPct})</span></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.rejected}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.held_back}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.avg_latency_ms ? `${(m.avg_latency_ms / 1000).toFixed(1)} s` : '—'}</td>
                      <td className="py-2 text-right tabular-nums">{inr(m.cost_inr)}{m.costPerTaken != null && <div className="text-[10px] text-muted-foreground">{inr(m.costPerTaken, 1)} per taken</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}
          {s.model_errors > 0 && <p className="mt-2 text-[11px] text-warning">{s.model_errors} draft request{s.model_errors === 1 ? '' : 's'} failed (timeout or error) in this period.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">AI spend by day (this month)</CardTitle>
            <CardDescription className="text-xs">
              {Object.entries(s.spend.by_purpose).length
                ? Object.entries(s.spend.by_purpose).map(([k, v]) => `${({ draft: 'drafts', redraft: 'redrafts', embed: 'matching', judge: 'saving and AI picks', translate: 'translation', seed: 'seed' } as Record<string, string>)[k] ?? k} ${inr(Number(v), 2)}`).join(' · ')
                : 'Nothing spent yet this month.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!s.spend.by_day.length ? <p className="text-xs text-muted-foreground">No AI calls this month.</p> : (
              <div className="flex h-36 items-stretch gap-0.5" role="img" aria-label={`AI spend per day this month, highest ${inr(maxDay, 2)}`}>
                {monthDays.map((d, i) => (
                  <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.day}: ${inr(d.inr, 2)}`}>
                    <div className="flex w-full flex-1 items-end justify-center">
                      <div className={`w-full max-w-5 rounded-t ${d.inr > 0 ? 'bg-primary/70' : 'bg-muted'}`} style={{ height: d.inr > 0 ? `${Math.max(4, (d.inr / maxDay) * 100)}%` : '2px' }} />
                    </div>
                    <span className="h-3 text-[9px] leading-3 tabular-nums text-muted-foreground">{i === 0 || (i + 1) % 5 === 0 || i === monthDays.length - 1 ? Number(d.day.slice(8)) : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Saved to the Playbook</CardTitle>
            <CardDescription className="text-xs">
              {learned.length ? learned.map(([k, n]) => `${ACTION_LABEL[k] ?? k}: ${n}`).join(' · ') : 'Nothing saved in this period.'}
              {s.learning.undone > 0 && ` · undone: ${s.learning.undone}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!s.recent.length ? <p className="text-xs text-muted-foreground">Sends and approvals in order chats appear here.</p> : (
              <ul className="space-y-1.5">
                {s.recent.slice(0, 12).map((r) => (
                  <li key={r.id} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs">
                    <span className="shrink-0 tabular-nums text-muted-foreground">{istShort(r.at)}</span>
                    {r.entry_id ? (
                      <button type="button" onClick={() => onOpenEntry(r.entry_id!)} className={`min-w-0 truncate text-left font-medium hover:underline ${r.undone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {r.title ?? 'Reply'}
                      </button>
                    ) : <span className="text-muted-foreground">Removed reply</span>}
                    <span className="text-muted-foreground">— {ACTION_LABEL[r.action] ?? r.action}, {CAUSE_LABEL[r.cause] ?? r.cause} by {userLabel(userById.get(r.user_id), r.user_id)}{r.undone ? ' (undone)' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
