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
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  // Get user ID - handle both string and UUID formats
  const userId = user?.id;

  // Check if userId is a valid UUID format
  const isValidUUID = (id: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  // Fetch user sidebar preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['sidebar_preferences', userId],
    queryFn: async () => {
      if (!userId) {
        console.log('useSidebarPreferences: No user ID available');
        return [];
      }
      
      console.log('useSidebarPreferences: Fetching preferences for user', userId);
      
      // If user ID is not a valid UUID, use localStorage instead
      if (!isValidUUID(userId)) {
        console.log('useSidebarPreferences: Using localStorage for non-UUID user', userId);
        const stored = localStorage.getItem(`sidebar_order_${userId}`);
        return stored ? JSON.parse(stored) : [];
      }
      
      try {
        const { data, error } = await supabase
          .from('user_sidebar_preferences')
          .select('sidebar_order')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('useSidebarPreferences: Error fetching preferences, falling back to localStorage', error);
          const stored = localStorage.getItem(`sidebar_order_${userId}`);
          return stored ? JSON.parse(stored) : [];
        }
        
        console.log('useSidebarPreferences: Fetched preferences', data?.sidebar_order);
        return data?.sidebar_order || [];
      } catch (error) {
        console.error('useSidebarPreferences: Exception during fetch, falling back to localStorage', error);
        const stored = localStorage.getItem(`sidebar_order_${userId}`);
        return stored ? JSON.parse(stored) : [];
      }
    },
    enabled: !!userId,
  });

  // Save sidebar preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (sidebarOrder: string[]) => {
      if (!userId) {
        console.error('useSidebarPreferences: Cannot save - no user ID');
        throw new Error('User not authenticated');
      }

      console.log('useSidebarPreferences: Saving order for user', userId, sidebarOrder);

      // If user ID is not a valid UUID, use localStorage
      if (!isValidUUID(userId)) {
        console.log('useSidebarPreferences: Saving to localStorage for non-UUID user', userId);
        localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
        setLocalOrder(sidebarOrder);
        return sidebarOrder;
      }

      try {
        // Check if preferences exist
        const { data: existing, error: selectError } = await supabase
          .from('user_sidebar_preferences')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (selectError && selectError.code !== 'PGRST116') {
          console.error('useSidebarPreferences: Error checking existing preferences, saving to localStorage', selectError);
          localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
          setLocalOrder(sidebarOrder);
          return sidebarOrder;
        }

        if (existing) {
          console.log('useSidebarPreferences: Updating existing preferences');
          const { error } = await supabase
            .from('user_sidebar_preferences')
            .update({ sidebar_order: sidebarOrder })
            .eq('user_id', userId);
          
          if (error) {
            console.error('useSidebarPreferences: Error updating preferences, saving to localStorage', error);
            localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
            setLocalOrder(sidebarOrder);
            return sidebarOrder;
          }
        } else {
          console.log('useSidebarPreferences: Creating new preferences');
          const { error } = await supabase
            .from('user_sidebar_preferences')
            .insert({
              user_id: userId,
              sidebar_order: sidebarOrder
            });
          
          if (error) {
            console.error('useSidebarPreferences: Error creating preferences, saving to localStorage', error);
            localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
            setLocalOrder(sidebarOrder);
            return sidebarOrder;
          }
        }
        
        console.log('useSidebarPreferences: Successfully saved preferences to database');
        return sidebarOrder;
      } catch (error) {
        console.error('useSidebarPreferences: Save operation failed, falling back to localStorage', error);
        localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
        setLocalOrder(sidebarOrder);
        return sidebarOrder;
      }
    },
    onSuccess: (savedOrder) => {
      console.log('useSidebarPreferences: Save successful, invalidating queries', savedOrder);
      queryClient.invalidateQueries({ queryKey: ['sidebar_preferences', userId] });
    },
    onError: (error) => {
      console.error('useSidebarPreferences: Save mutation failed', error);
    },
  });

  const applySidebarOrder = (items: SidebarItem[]): SidebarItem[] => {
    const currentPreferences = preferences || localOrder;
    
    console.log('useSidebarPreferences: Applying order to items', { 
      currentPreferences, 
      itemsCount: items.length,
      preferencesType: typeof currentPreferences,
      isArray: Array.isArray(currentPreferences)
    });
    
    if (!currentPreferences || !Array.isArray(currentPreferences) || currentPreferences.length === 0) {
      console.log('useSidebarPreferences: No preferences found, using default order');
      return items;
    }

    // Create a map for quick lookup
    const itemMap = new Map(items.map(item => [item.title, item]));
    
    // Order items according to preferences, then add any missing items at the end
    const orderedItems: SidebarItem[] = [];
    const usedItems = new Set<string>();

    // Add items in the preferred order
    currentPreferences.forEach((title: string) => {
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

    console.log('useSidebarPreferences: Applied order result', { 
      original: items.length, 
      ordered: orderedItems.length,
      originalTitles: items.map(i => i.title),
      orderedTitles: orderedItems.map(i => i.title)
    });
    return orderedItems;
  };

  const saveSidebarOrder = (orderedItems: SidebarItem[]) => {
    const order = orderedItems.map(item => item.title);
    console.log('useSidebarPreferences: Saving sidebar order', order);
    savePreferencesMutation.mutate(order);
  };

  return {
    preferences: preferences || localOrder,
    isLoading,
    applySidebarOrder,
    saveSidebarOrder,
    isSaving: savePreferencesMutation.isPending,
    error: savePreferencesMutation.error,
  };
}