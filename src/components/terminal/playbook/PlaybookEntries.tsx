// Playbook entries (approvers): search, filter and open an entry to edit it.
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { BookOpen, Loader2, Search } from 'lucide-react';
import { filterEntries, isExpired, istShort, scopeSummary, type EntryFilter, type EntrySort, type EntryStatus, type Scope } from '@/lib/copilot/playbookAdmin';
import { useCopilotEntries } from '@/hooks/useCopilotAdmin';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { Pill, StatusPill } from './PlaybookBits';

const FILTERS: Array<{ value: EntryFilter; label: string }> = [
  { value: 'active', label: 'In use' },
  { value: 'approved', label: 'Approved' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'conflicts', label: 'In conflict' },
  { value: 'retired', label: 'Retired' },
  { value: 'all', label: 'All' },
];

export function PlaybookEntries({ onOpen }: { onOpen: (entryId: string) => void }) {
  const { data: rows = [], isLoading, error } = useCopilotEntries(true);
  const { nameFor } = useExchangeAccount();
  const [filter, setFilter] = useState<EntryFilter>('active');
  const [sort, setSort] = useState<EntrySort>('used');
  const [query, setQuery] = useState('');
  const list = useMemo(() => filterEntries(rows, filter, query, sort), [rows, filter, query, sort]);
  const conflicts = rows.filter((r) => r.conflict_open && r.status !== 'retired').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics and replies" className="h-9 pl-8 text-sm" aria-label="Search the Playbook" />
        </div>
        <SegmentedControl<EntryFilter> size="sm" options={FILTERS.map((f) => ({ ...f, label: f.value === 'conflicts' && conflicts ? `In conflict (${conflicts})` : f.label }))}
          value={filter} onValueChange={setFilter} aria-label="Which entries" className="max-w-full overflow-x-auto" />
        <div className="flex items-center gap-2 lg:ml-auto">
          <span className="text-xs text-muted-foreground">Sort</span>
          <Select value={sort} onValueChange={(v) => setSort(v as EntrySort)}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label="Sort entries"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="used" className="text-xs">Most used</SelectItem>
              <SelectItem value="recent" className="text-xs">Recently changed</SelectItem>
              <SelectItem value="title" className="text-xs">A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
      ) : !list.length ? (
        <Card className="border-border bg-card">
          <CardContent className="py-2">
            <EmptyState icon={BookOpen} title={rows.length ? 'No entries match' : 'The Playbook is empty'}
              description={rows.length ? 'Try another filter or search.' : 'Replies you send or approve in order chats are saved here automatically.'} />
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{list.length} {list.length === 1 ? 'entry' : 'entries'}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onOpen(e.id)} className="flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusPill status={e.status as EntryStatus} conflict={e.conflict_open && e.status !== 'retired'} expired={isExpired(e)} />
                    <span className="min-w-0 max-w-full flex-1 truncate text-sm font-medium text-foreground">{e.title}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">used {e.use_count}×</span>
                  </div>
                  <p className="line-clamp-2 break-words text-xs leading-snug text-muted-foreground">{e.reply_en || e.reply_hi}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Pill>{scopeSummary(e.scope as Scope, nameFor)}</Pill>
                    <span>{e.questions} {e.questions === 1 ? 'phrasing' : 'phrasings'}</span>
                    <span>· {[e.reply_en && 'English', e.reply_hi && 'Hindi'].filter(Boolean).join(' + ')}</span>
                    {(e.reply_en_auto || e.reply_hi_auto) && <span>· auto-translated part</span>}
                    <span>· v{e.version} · changed {istShort(e.updated_at)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
