// Copilot Playbook page (Copilot approvers only): inbox, questions (replies by situation), stats and settings.
// copilot_my_access decides what is shown; the tables' access rules return nothing to anyone else.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, BookOpen, Inbox, Loader2, Settings2, ShieldCheck } from 'lucide-react';
import { useCopilotAccess } from '@/hooks/useCopilotPlaybook';
import { PlaybookInbox } from '@/components/terminal/playbook/PlaybookInbox';
import { PlaybookQuestions } from '@/components/terminal/playbook/PlaybookQuestions';
import { PlaybookQuestionSheet, type SheetTarget } from '@/components/terminal/playbook/PlaybookQuestionSheet';
import { PlaybookStats } from '@/components/terminal/playbook/PlaybookStats';
import { CopilotPlaybookSettings } from '@/components/terminal/automation/CopilotPlaybookSettings';

const TABS = ['inbox', 'entries', 'stats', 'settings'] as const;
type Tab = typeof TABS[number];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function TerminalPlaybook() {
  const { data: access, isLoading } = useCopilotAccess();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'inbox';
  const [target, setTarget] = useState<SheetTarget | null>(null);
  const setTab = useCallback((t: string) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
  }, [setParams]);
  const openEntry = useCallback((id: string) => setTarget({ entryId: id }), []);
  // ?entry=<id> (from a chat's "Saved to Playbook" toast) opens that reply's question.
  useEffect(() => {
    const id = params.get('entry');
    if (!id || !UUID_RE.test(id)) return;
    setTarget({ entryId: id });
    setParams((p) => { const n = new URLSearchParams(p); n.delete('entry'); return n; }, { replace: true });
  }, [params, setParams]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!access?.is_approver) {
    return (
      <div className="p-4 md:p-6">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            The Playbook is managed by the Copilot approvers.
          </CardContent>
        </Card>
      </div>
    );
  }

  const open = access.open_inbox ?? 0;
  const approved = access.approved_entries ?? 0;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2"><BookOpen className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Playbook</h1>
          <p className="text-xs text-muted-foreground">
            The replies the Copilot offers first, without AI, chosen by the chat's situation · {approved} approved{approved < 50 ? ` of the first 50` : ''}{open ? ` · ${open} to review` : ''}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto">
          <TabsTrigger value="inbox" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" />Inbox
            {open > 0 && <span className="ml-0.5 min-w-[18px] rounded-full bg-trade-pending/15 px-1 text-[10px] font-bold tabular-nums text-trade-pending">{open}</span>}
          </TabsTrigger>
          <TabsTrigger value="entries" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Questions</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Stats</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" />Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4"><PlaybookInbox onEditEntry={openEntry} paused={!!target} /></TabsContent>
        <TabsContent value="entries" className="mt-4"><PlaybookQuestions onOpen={setTarget} /></TabsContent>
        <TabsContent value="stats" className="mt-4"><PlaybookStats onOpenEntry={openEntry} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><CopilotPlaybookSettings /></TabsContent>
      </Tabs>

      <PlaybookQuestionSheet target={target} onOpenChange={(o) => { if (!o) setTarget(null); }} />
    </div>
  );
}
