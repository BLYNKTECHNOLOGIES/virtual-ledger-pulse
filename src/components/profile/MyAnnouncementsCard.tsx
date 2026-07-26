import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Megaphone, Pin, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-primary" /> Company News
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                {unreadCount} new
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7">
              Mark all read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No announcements right now.
          </p>
        ) : (
          <div className="space-y-2">
            {(announcements as any[]).map((a) => {
              const isOpen = expanded.has(a.id);
              const isUnread = !read.has(a.id);
              return (
                <div
                  key={a.id}
                  className={`border rounded-lg transition-colors ${
                    isUnread ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    className="w-full flex items-start gap-3 p-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.is_pinned && <Pin className="h-3 w-3 text-warning shrink-0" />}
                        <p
                          className={`text-sm truncate ${
                            isUnread ? 'font-bold text-foreground' : 'font-medium text-foreground/90'
                          }`}
                        >
                          {a.title}
                        </p>
                        {a.category && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {a.category}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {isOpen && a.content && (
                    <div className="px-3 pb-3 text-sm text-foreground/90 whitespace-pre-wrap border-t border-border/50 pt-2">
                      {a.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
