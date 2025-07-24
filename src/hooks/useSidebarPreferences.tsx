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

  console.log('useSidebarPreferences: user', user);

  // Fetch user sidebar preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['sidebar_preferences', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        console.log('useSidebarPreferences: No user ID available');
        return null;
      }
      
      console.log('useSidebarPreferences: Fetching preferences for user', user.id);
      const { data, error } = await supabase
        .from('user_sidebar_preferences')
        .select('sidebar_order')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        console.error('useSidebarPreferences: Error fetching preferences', error);
        throw error;
      }
      
      console.log('useSidebarPreferences: Fetched preferences', data?.sidebar_order);
      return data?.sidebar_order || [];
    },
    enabled: !!user?.id,
  });

  // Save sidebar preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (sidebarOrder: string[]) => {
      if (!user?.id) {
        console.error('useSidebarPreferences: Cannot save - no user ID');
        throw new Error('User not authenticated');
      }

      console.log('useSidebarPreferences: Saving order for user', user.id, sidebarOrder);

      try {
        const { data: existing } = await supabase
          .from('user_sidebar_preferences')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (existing) {
          console.log('useSidebarPreferences: Updating existing preferences');
          const { error } = await supabase
            .from('user_sidebar_preferences')
            .update({ sidebar_order: sidebarOrder })
            .eq('user_id', user.id);
          
          if (error) {
            console.error('useSidebarPreferences: Error updating preferences', error);
            throw error;
          }
        } else {
          console.log('useSidebarPreferences: Creating new preferences');
          const { error } = await supabase
            .from('user_sidebar_preferences')
            .insert({
              user_id: user.id,
              sidebar_order: sidebarOrder
            });
          
          if (error) {
            console.error('useSidebarPreferences: Error creating preferences', error);
            throw error;
          }
        }
        
        console.log('useSidebarPreferences: Successfully saved preferences');
      } catch (error) {
        console.error('useSidebarPreferences: Save operation failed', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('useSidebarPreferences: Save successful, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['sidebar_preferences', user?.id] });
    },
    onError: (error) => {
      console.error('useSidebarPreferences: Save mutation failed', error);
    },
  });

  const applySidebarOrder = (items: SidebarItem[]): SidebarItem[] => {
    console.log('useSidebarPreferences: Applying order to items', { preferences, items: items.length });
    
    if (!preferences || !Array.isArray(preferences) || preferences.length === 0) {
      console.log('useSidebarPreferences: No preferences found, using default order');
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

    console.log('useSidebarPreferences: Applied order result', { original: items.length, ordered: orderedItems.length });
    return orderedItems;
  };

  const saveSidebarOrder = (orderedItems: SidebarItem[]) => {
    const order = orderedItems.map(item => item.title);
    console.log('useSidebarPreferences: Saving sidebar order', order);
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