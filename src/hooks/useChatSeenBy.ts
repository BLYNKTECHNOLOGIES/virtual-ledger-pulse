import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ChatSeenInfo {
  orderNumber: string;
  name: string | null;
  at: string;
  source?: string | null;
}

const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
});

/** "01:52 IST" for today, "07 Sep 01:52 IST" otherwise. */
export function formatSeenIST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const todayIST = IST_DATE_FORMATTER.format(new Date());
  const dayIST = IST_DATE_FORMATTER.format(d);
  const time = IST_FORMATTER.format(d);
  return dayIST === todayIST ? `${time} IST` : `${dayIST} ${time} IST`;
}

export function seenLabel(info: ChatSeenInfo | null | undefined): string | null {
  if (!info) return null;
  const time = formatSeenIST(info.at);
  if (!time) return null;
  if (info.source === 'binance_app') return `Read on Binance app · ${time}`;
  return info.name ? `Seen by ${info.name} · ${time}` : `Seen · ${time}`;
}

/**
 * Snapshot of who last opened this order's chat, captured once when the panel
 * mounts — before this operator's own read is written — so the marker shows
 * the previous handler rather than the current viewer.
 */
export function useChatSeenSnapshot(orderNumber?: string | null) {
  const [seen, setSeen] = useState<ChatSeenInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSeen(null);
    if (!orderNumber) return;
    supabase
      .from('terminal_binance_chat_reads')
      .select('order_number, last_read_at, read_by_name, read_source')
      .eq('order_number', orderNumber)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.last_read_at) return;
        setSeen({
          orderNumber: data.order_number,
          name: data.read_by_name ?? null,
          at: data.last_read_at,
          source: (data as any).read_source ?? null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  return seen;
}

/** Read state for a batch of conversations (inbox list). */
export function useChatSeenMap(orderNumbers: string[]) {
  const key = orderNumbers.slice(0, 300).sort().join(',');
  return useQuery({
    queryKey: ['terminal-chat-seen-map', key],
    enabled: orderNumbers.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_binance_chat_reads')
        .select('order_number, last_read_at, read_by_name, read_source')
        .in('order_number', orderNumbers.slice(0, 300));
      if (error) throw error;
      const map: Record<string, ChatSeenInfo> = {};
      for (const row of data || []) {
        if (!row.last_read_at) continue;
        map[row.order_number] = {
          orderNumber: row.order_number,
          name: row.read_by_name ?? null,
          at: row.last_read_at,
          source: (row as any).read_source ?? null,
        };
      }
      return map;
    },
  });
}
