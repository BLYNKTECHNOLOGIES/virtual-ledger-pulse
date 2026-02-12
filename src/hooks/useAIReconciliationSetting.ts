import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAIReconciliationSetting() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSetting = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'ai_reconciliation_enabled')
        .single();

      if (!error && data) {
        setIsEnabled(data.setting_value === 'true');
      }
    } catch (err) {
      console.error('Error fetching AI reconciliation setting:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSetting(); }, [fetchSetting]);

  const toggle = async (newValue: boolean) => {
    const { error } = await supabase
      .from('system_settings')
      .update({ setting_value: String(newValue), updated_at: new Date().toISOString() })
      .eq('setting_key', 'ai_reconciliation_enabled');

    if (!error) {
      setIsEnabled(newValue);
    }
    return !error;
  };

  return { isEnabled, isLoading, toggle };
}
