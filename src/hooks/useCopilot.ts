import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

export interface CopilotSettings {
  id: string;
  enabled: boolean;
  operator_allowlist: string[];
  trainer_allowlist: string[];
  suggestion_count: number;
  auto_suggest: boolean;
  train_watermark: string | null;
  exemplar_count: number;
  account_notes?: Record<string, string>;
}

/** Fetch the singleton copilot settings row (cached ~5min). */
export function useCopilotSettings() {
  return useQuery({
    queryKey: ['copilot-settings'],
    queryFn: async (): Promise<CopilotSettings | null> => {
      const { data, error } = await supabase
        .from('copilot_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as CopilotSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** True when copilot is enabled AND the current terminal user may see suggestions. */
export function useCopilotVisible() {
  const { userId } = useTerminalAuth();
  const { data: settings } = useCopilotSettings();
  return Boolean(
    settings?.enabled && userId && (settings.operator_allowlist || []).includes(userId)
  );
}

export interface CopilotSuggestInput {
  order: {
    number?: string | null;
    side?: string | null;
    asset?: string | null;
    fiat?: string | null;
    amount?: number | string | null;
    price?: number | string | null;
    status?: string | null;
    timeRemaining?: string | number | null;
  };
  clientProfile: {
    pastOrders?: number | null;
    appeals?: number | null;
    name?: string | null;
  };
  messages: Array<{ isSelf: boolean; text: string; time?: string }>;
  exchangeAccountId?: string | null;
  accountLabel?: string | null;
}

export interface CopilotSuggestResult {
  situation: string;
  suggestions: string[];
}

/** Calls copilot-suggest. ALL context is passed in by the client (no server lookups). */
export async function fetchCopilotSuggestions(
  input: CopilotSuggestInput
): Promise<CopilotSuggestResult> {
  const { data, error } = await supabase.functions.invoke('copilot-suggest', {
    body: input,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return {
    situation: data?.situation || 'other',
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
  };
}
