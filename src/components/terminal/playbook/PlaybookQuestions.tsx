// Playbook questions (approvers): each with its replies by situation. Search, filter, and open one to edit it.
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { BookOpen, Languages, Loader2, Search } from 'lucide-react';
import { filterTopics, hasOutdatedCopy, isExpired, istShort, replyLabel, type EntrySort, type Scope, type TopicFilter } from '@/lib/copilot/playbookAdmin';
import { stagesSummary } from '@/lib/copilot/situations';
import { useCopilotSituations, useCopilotTopics, type EntryRow } from '@/hooks/useCopilotAdmin';
import { Pill } from './PlaybookBits';

const FILTERS: Array<{ value: TopicFilter; label: string }> = [
  { value: 'active', label: 'In use' },
  { value: 'approved', label: 'Approved' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'conflicts', label: 'In conflict' },
  { value: 'outdated', label: 'Outdated copy' },
  { value: 'retired', label: 'Retired' },
  { value: 'all', label: 'All' },
];

function ReplyChip({ e, label }: { e: EntryRow; label: string }) {
  const tone = e.conflict_open && e.status !== 'retired' ? 'red' : e.status === 'approved' ? 'green' : e.status === 'tentative' ? (isExpired(e) ? 'muted' : 'amber') : 'muted';
  return (
    <Pill tone={tone} className={e.status === 'retired' ? 'line-through opacity-60' : ''} title={`${e.status}${hasOutdatedCopy(e) ? ' · a language copy is out of date' : ''}`}>
      {label}{hasOutdatedCopy(e) && <Languages className="h-2.5 w-2.5" />}
    </Pill>
  );
}

export function PlaybookQuestions({ onOpen }: { onOpen: (target: { entryId?: string; topicId?: string }) => void }) {
  const { data: rows = [], isLoading, error } = useCopilotTopics(true);
  const { data: situations } = useCopilotSituations();
  const [filter, setFilter] = useState<TopicFilter>('active');
  const [sort, setSort] = useState<EntrySort>('used');
  const [query, setQuery] = useState('');
  const list = useMemo(() => filterTopics(rows, filter, query, sort), [rows, filter, query, sort]);
  const count = (f: TopicFilter) => filterTopics(rows, f, '', 'title').length;
  const conflicts = count('conflicts');
  const outdated = count('outdated');

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions and replies" className="h-9 pl-8 text-sm" aria-label="Search the Playbook" />
        </div>
        <SegmentedControl size="sm"
          options={FILTERS.filter((f) => f.value !== 'outdated' || outdated > 0).map((f) => ({
            ...f, label: f.value === 'conflicts' && conflicts ? `In conflict (${conflicts})` : f.value === 'outdated' ? `Outdated copy (${outdated})` : f.label,
          }))}
          value={filter} onValueChange={(v) => setFilter(v as TopicFilter)} aria-label="Which questions" className="max-w-full overflow-x-auto" />
        <div className="flex items-center gap-2 lg:ml-auto">
          <span className="text-xs text-muted-foreground">Sort</span>
          <Select value={sort} onValueChange={(v) => setSort(v as EntrySort)}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label="Sort questions"><SelectValue /></SelectTrigger>
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
            <EmptyState icon={BookOpen} title={rows.length ? 'No questions match' : 'The Playbook is empty'}
              description={rows.length ? 'Try another filter or search.' : 'Replies you send or approve in order chats are saved here automatically.'} />
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{list.length} {list.length === 1 ? 'question' : 'questions'}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {list.map((t) => {
              const shown = filter === 'retired' || filter === 'all' ? t.replies : t.replies.filter((e) => e.status !== 'retired');
              const first = shown.find((e) => e.status === 'approved') ?? shown[0];
              const uses = t.replies.reduce((n, e) => n + e.use_count, 0);
              const changed = t.replies.reduce((m, e) => (e.updated_at > m ? e.updated_at : m), t.updated_at);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => onOpen({ topicId: t.id, entryId: first?.id })}
                    className="flex w-full min-w-0 flex-col gap-1.5 px-3 py-2.5 text-left hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 max-w-full flex-1 truncate text-sm font-medium text-foreground">{t.title}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">used {uses}×</span>
                    </div>
                    {first && <p className="line-clamp-2 break-words text-xs leading-snug text-muted-foreground">{first.reply_en || first.reply_hi}</p>}
                    <div className="flex flex-wrap items-center gap-1">
                      {shown.map((e) => <ReplyChip key={e.id} e={e} label={replyLabel(e.scope as Scope, (codes) => stagesSummary(codes, situations))} />)}
                      <span className="text-[10px] text-muted-foreground">· {t.phrasings} {t.phrasings === 1 ? 'phrasing' : 'phrasings'} · changed {istShort(changed)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
