import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SidebarItem {
  id: string;
  title: string;
  url: string;
  icon: any;
  color: string;
  bgColor: string;
  permissions: string[];
}

interface SidebarGroupConfig {
  id: string;
  title: string;
  icon: any;
  color: string;
  bgColor: string;
  pinProtected?: boolean;
  pinCode?: string;
  children: SidebarItem[];
}

type SidebarEntry = 
  | { type: 'item'; data: SidebarItem }
  | { type: 'group'; data: SidebarGroupConfig };

interface SidebarPreferences {
  order: string[];
  groupOrder?: Record<string, string[]>;
}

export function useSidebarPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  const userId = user?.id;

  const isValidUUID = (id: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['sidebar_preferences', userId],
    queryFn: async (): Promise<SidebarPreferences> => {
      if (!userId) {
        return { order: [] };
      }
      
      if (!isValidUUID(userId)) {
        const stored = localStorage.getItem(`sidebar_order_${userId}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            // Handle both old format (array) and new format (object with order)
            if (Array.isArray(parsed)) {
              return { order: parsed };
            }
            return parsed;
          } catch {
            return { order: [] };
          }
        }
        return { order: [] };
      }
      
      try {
        const { data, error } = await supabase
          .from('user_sidebar_preferences')
          .select('sidebar_order')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          const stored = localStorage.getItem(`sidebar_order_${userId}`);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed)) {
                return { order: parsed };
              }
              return parsed;
            } catch {
              return { order: [] };
            }
          }
          return { order: [] };
        }
        
        if (data?.sidebar_order) {
          // Handle both old format (array) and new format (object)
          const sidebarOrder = data.sidebar_order as unknown;
          if (Array.isArray(sidebarOrder)) {
            return { order: sidebarOrder as string[] };
          }
          if (typeof sidebarOrder === 'object' && sidebarOrder !== null && 'order' in sidebarOrder) {
            return sidebarOrder as SidebarPreferences;
          }
          return { order: [] };
        }
        
        return { order: [] };
      } catch (error) {
        const stored = localStorage.getItem(`sidebar_order_${userId}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              return { order: parsed };
            }
            return parsed;
          } catch {
            return { order: [] };
          }
        }
        return { order: [] };
      }
    },
    enabled: !!userId,
  });

  const savePreferencesMutation = useMutation({
    mutationFn: async (sidebarPrefs: SidebarPreferences) => {
      if (!userId) {
        throw new Error('User not authenticated');
      }

      if (!isValidUUID(userId)) {
        localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarPrefs));
        setLocalOrder(sidebarPrefs.order);
        return sidebarPrefs;
      }

      try {
        const { data: existing, error: selectError } = await supabase
          .from('user_sidebar_preferences')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (selectError && selectError.code !== 'PGRST116') {
          localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarPrefs));
          setLocalOrder(sidebarPrefs.order);
          return sidebarPrefs;
        }

        if (existing) {
          const { error } = await supabase
            .from('user_sidebar_preferences')
            .update({ sidebar_order: sidebarPrefs as any })
            .eq('user_id', userId);
          
          if (error) {
            localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarPrefs));
            setLocalOrder(sidebarPrefs.order);
            return sidebarPrefs;
          }
        } else {
          const { error } = await supabase
            .from('user_sidebar_preferences')
            .insert({
              user_id: userId,
              sidebar_order: sidebarPrefs as any
            });
          
          if (error) {
            localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarPrefs));
            setLocalOrder(sidebarPrefs.order);
            return sidebarPrefs;
          }
        }
        
        return sidebarPrefs;
      } catch (error) {
        localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarPrefs));
        setLocalOrder(sidebarPrefs.order);
        return sidebarPrefs;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidebar_preferences', userId] });
    },
  });

  const applySidebarOrder = useCallback((entries: SidebarEntry[]): SidebarEntry[] => {
    const currentPreferences = preferences || { order: localOrder };
    const order = currentPreferences.order;
    
    if (!order || !Array.isArray(order) || order.length === 0) {
      return entries;
    }

    const entryMap = new Map(entries.map(entry => {
      const id = entry.data.id;
      return [id, entry];
    }));
    
    const orderedEntries: SidebarEntry[] = [];
    const usedIds = new Set<string>();

    order.forEach((id: string) => {
      const entry = entryMap.get(id);
      if (entry) {
        orderedEntries.push(entry);
        usedIds.add(id);
      }
    });

    entries.forEach(entry => {
      const id = entry.data.id;
      if (!usedIds.has(id)) {
        orderedEntries.push(entry);
      }
    });

    return orderedEntries;
  }, [preferences, localOrder]);

  const saveSidebarOrder = useCallback((orderedEntries: SidebarEntry[]) => {
    const order = orderedEntries.map(entry => entry.data.id);
    
    const groupOrder: Record<string, string[]> = {};
    orderedEntries.forEach(entry => {
      if (entry.type === 'group') {
        groupOrder[entry.data.id] = entry.data.children.map(child => child.id);
      }
    });
    
    savePreferencesMutation.mutate({ order, groupOrder });
  }, [savePreferencesMutation]);

  return {
    preferences: preferences || { order: localOrder },
    isLoading,
    applySidebarOrder,
    saveSidebarOrder,
    isSaving: savePreferencesMutation.isPending,
    error: savePreferencesMutation.error,
  };
}
