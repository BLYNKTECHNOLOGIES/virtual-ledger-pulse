import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Megaphone, Pin, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionBlock, StatusPill, ProfileSkeleton } from './primitives';
import { fmtAgo, humanize } from './format';

const READ_KEY = 'ess.announcements.read.v1';

function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveRead(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* no-op */
  }
}

/**
 * Phase 7 (ESS) — Company News.
 * Full history view of published, non-expired announcements for the
 * employee. Complements <AnnouncementsBanner /> which shows only the
 * top few pinned/recent ones. Per-user read state is tracked locally
 * so the unread badge reflects what this user has actually opened.
 */
export default function MyAnnouncementsCard() {
  const [read, setRead] = useState<Set<string>>(() => loadRead());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['ess_announcements_full'],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from('hr_announcements')
        .select('id, title, content, category, is_pinned, created_at, expires_at')
        .eq('published', true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return data || [];
    },
  });

  const unreadCount = useMemo(
    () => (announcements as any[]).filter((a) => !read.has(a.id)).length,
    [announcements, read]
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (!read.has(id)) {
      const next = new Set(read);
      next.add(id);
      setRead(next);
      saveRead(next);
    }
  };

  const markAllRead = () => {
    const next = new Set(read);
    (announcements as any[]).forEach((a) => next.add(a.id));
    setRead(next);
    saveRead(next);
  };

  return (
    <SectionBlock
      icon={Megaphone}
      title="Company news"
      flush
      actions={
        unreadCount > 0 ? (
          <div className="flex items-center gap-2">
            <StatusPill tone="info">{unreadCount} new</StatusPill>
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 px-2 text-xs">
              Mark all read
            </Button>
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <ProfileSkeleton rows={2} bare />
      ) : announcements.length === 0 ? (
        <p className="px-3.5 py-4 text-sm text-muted-foreground">No announcements right now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {(announcements as any[]).map((a) => {
            const isOpen = expanded.has(a.id);
            const isUnread = !read.has(a.id);
            return (
              <li key={a.id} className={cn(isUnread && 'bg-primary/[0.04]')}>
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', isUnread ? 'bg-primary' : 'bg-transparent')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[13px] text-foreground', isUnread ? 'font-semibold' : 'font-medium', !isOpen && 'line-clamp-2')}>
                      {a.is_pinned && <Pin className="mr-1 inline h-3 w-3 text-warning" />}
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {a.category ? `${humanize(a.category)} · ` : ''}{fmtAgo(a.created_at)}
                    </p>
                  </div>
                  <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && a.content && (
                  <div className="whitespace-pre-wrap px-3.5 pb-3 pl-[30px] text-sm text-foreground/90">
                    {a.content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionBlock>
  );
}
