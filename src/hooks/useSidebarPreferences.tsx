import { useState, useEffect } from 'react';
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

export function useSidebarPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user sidebar preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['sidebar_preferences', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('user_sidebar_preferences')
        .select('sidebar_order')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data?.sidebar_order || [];
    },
    enabled: !!user?.id,
  });

  // Save sidebar preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (sidebarOrder: string[]) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data: existing } = await supabase
        .from('user_sidebar_preferences')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_sidebar_preferences')
          .update({ sidebar_order: sidebarOrder })
          .eq('user_id', user.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_sidebar_preferences')
          .insert({
            user_id: user.id,
            sidebar_order: sidebarOrder
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidebar_preferences', user?.id] });
    },
  });

  const applySidebarOrder = (items: SidebarItem[]): SidebarItem[] => {
    if (!preferences || !Array.isArray(preferences) || preferences.length === 0) {
      return items;
    }

    // Create a map for quick lookup
    const itemMap = new Map(items.map(item => [item.title, item]));
    
    // Order items according to preferences, then add any missing items at the end
    const orderedItems: SidebarItem[] = [];
    const usedItems = new Set<string>();

    // Add items in the preferred order
    preferences.forEach((title: string) => {
      const item = itemMap.get(title);
      if (item) {
        orderedItems.push(item);
        usedItems.add(title);
      }
    });

    // Add any remaining items that weren't in the preferences
    items.forEach(item => {
      if (!usedItems.has(item.title)) {
        orderedItems.push(item);
      }
    });

    return orderedItems;
  };

  const saveSidebarOrder = (orderedItems: SidebarItem[]) => {
    const order = orderedItems.map(item => item.title);
    savePreferencesMutation.mutate(order);
  };

  return {
    preferences,
    isLoading,
    applySidebarOrder,
    saveSidebarOrder,
    isSaving: savePreferencesMutation.isPending,
  };
}