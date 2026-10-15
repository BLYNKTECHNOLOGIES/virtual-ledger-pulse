// Where a reply applies: side, situation (a tree: a group covers its steps, including steps added later), client,
// order size and Binance account. An empty group means "any".
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';
import { cleanScope, LEGACY_STATUS_GROUP, optionChecked, SCOPE_GROUPS, toggleScope, type Scope } from '@/lib/copilot/playbookAdmin';
import { situationTree, stagesSummary, toggleStage, unknownStages, type SituationRow } from '@/lib/copilot/situations';

interface Props {
  scope: Scope;
  onChange: (scope: Scope) => void;
  situations: SituationRow[] | undefined;
  accounts: Array<{ id: string; account_name: string }>;
  idPrefix: string;
}

function Option({ id, checked, disabled, onToggle, children, hint }: { id: string; checked: boolean; disabled?: boolean; onToggle: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={id} title={hint} className={`flex cursor-pointer items-center gap-2 text-xs ${disabled ? 'cursor-default text-muted-foreground' : 'text-foreground'}`}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onToggle} />
      {children}
    </label>
  );
}

export function ScopeEditor({ scope, onChange, situations, accounts, idPrefix }: Props) {
  const sides = (scope.sides ?? []) as Array<'BUY' | 'SELL'>;
  const stages = scope.stages ?? [];
  const tree = situationTree(situations, sides.length ? sides : null);
  const unknown = unknownStages(stages, situations);
  const inTree = (c: string) => tree.some((g) => g.group?.code === c || g.items.some((i) => i.code === c));
  const offTree = situations?.length ? stages.filter((c) => !unknown.includes(c) && !inTree(c)) : [];
  const setStages = (next: string[]) => onChange(cleanScope({ ...scope, stages: next }));
  const sideGroup = SCOPE_GROUPS.find((g) => g.key === 'sides')!;
  const otherGroups = SCOPE_GROUPS.filter((g) => g.key !== 'sides');

  return (
    <div className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-foreground">{sideGroup.label}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {sideGroup.options.map((o) => (
            <Option key={o.values[0]} id={`${idPrefix}-side-${o.values[0]}`} checked={optionChecked(scope, 'sides', o.values)}
              onToggle={() => onChange(toggleScope(scope, 'sides', o.values))}>{o.label}</Option>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-foreground">Situation <span className="font-normal text-muted-foreground">— what the client is waiting for</span></legend>
        <p className="text-[11px] text-muted-foreground">Now: <span className="text-foreground">{stagesSummary(stages, situations)}</span>. A group covers all its steps, including steps added later.</p>
        {unknown.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />This reply still uses a situation that no longer exists ({unknown.join(', ')}). Pick one below; it is never offered there.
          </p>
        )}
        <div className="space-y-2.5">
          {tree.map((g) => (
            <div key={g.group?.code ?? 'common'} className="space-y-1.5">
              {g.group ? (
                <Option id={`${idPrefix}-st-${g.group.code}`} checked={stages.includes(g.group.code)} onToggle={() => setStages(toggleStage(stages, g.group!.code))}
                  hint={g.group.description}>
                  <span className="font-medium">{g.group.label}</span><span className="text-muted-foreground">(any step)</span>
                </Option>
              ) : <p className="text-[11px] font-medium text-muted-foreground">Either side</p>}
              <div className={`flex flex-wrap gap-x-4 gap-y-2 ${g.group ? 'pl-6' : ''}`}>
                {g.items.map((s) => {
                  const viaGroup = !!g.group && stages.includes(g.group.code);
                  return (
                    <Option key={s.code} id={`${idPrefix}-st-${s.code}`} checked={viaGroup || stages.includes(s.code)} disabled={viaGroup}
                      onToggle={() => setStages(toggleStage(stages, s.code))} hint={s.description}>
                      {s.label}
                    </Option>
                  );
                })}
              </div>
            </div>
          ))}
          {!tree.length && <p className="text-[11px] text-muted-foreground">Loading situations…</p>}
        </div>
        {offTree.length > 0 && (
          <p className="text-[11px] text-muted-foreground">Also chosen, for the other side: {stagesSummary(offTree, situations)}.</p>
        )}
      </fieldset>

      {otherGroups.map((g) => (
        <fieldset key={g.key} className="space-y-1.5">
          <legend className="text-xs font-medium text-foreground">{g.label}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {g.options.map((o) => (
              <Option key={o.values[0]} id={`${idPrefix}-${g.key}-${o.values[0]}`} checked={optionChecked(scope, g.key, o.values)}
                onToggle={() => onChange(toggleScope(scope, g.key, o.values))}>{o.label}</Option>
            ))}
          </div>
        </fieldset>
      ))}

      {!!scope.statuses?.length && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-foreground">{LEGACY_STATUS_GROUP.label}</legend>
          <p className="text-[11px] text-muted-foreground">Saved before situations existed. Untick to rely on the situation instead.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGACY_STATUS_GROUP.options.filter((o) => optionChecked(scope, 'statuses', o.values)).map((o) => (
              <Option key={o.values[0]} id={`${idPrefix}-status-${o.values[0]}`} checked onToggle={() => onChange(toggleScope(scope, 'statuses', o.values))}>{o.label}</Option>
            ))}
          </div>
        </fieldset>
      )}

      {accounts.length > 1 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-foreground">Binance account</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {accounts.map((a) => (
              <Option key={a.id} id={`${idPrefix}-acc-${a.id}`} checked={optionChecked(scope, 'account_ids', [a.id])}
                onToggle={() => onChange(toggleScope(scope, 'account_ids', [a.id]))}>{a.account_name}</Option>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
