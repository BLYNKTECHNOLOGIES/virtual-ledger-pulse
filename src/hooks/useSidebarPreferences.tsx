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
        return [];
      }
      
      // If user ID is not a valid UUID, use localStorage instead
      if (!isValidUUID(userId)) {
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
          const stored = localStorage.getItem(`sidebar_order_${userId}`);
          return stored ? JSON.parse(stored) : [];
        }
        
        return data?.sidebar_order || [];
      } catch (error) {
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
        throw new Error('User not authenticated');
      }

      // If user ID is not a valid UUID, use localStorage
      if (!isValidUUID(userId)) {
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
          localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
          setLocalOrder(sidebarOrder);
          return sidebarOrder;
        }

        if (existing) {
          const { error } = await supabase
            .from('user_sidebar_preferences')
            .update({ sidebar_order: sidebarOrder })
            .eq('user_id', userId);
          
          if (error) {
            localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
            setLocalOrder(sidebarOrder);
            return sidebarOrder;
          }
        } else {
          const { error } = await supabase
            .from('user_sidebar_preferences')
            .insert({
              user_id: userId,
              sidebar_order: sidebarOrder
            });
          
          if (error) {
            localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
            setLocalOrder(sidebarOrder);
            return sidebarOrder;
          }
        }
        
        return sidebarOrder;
      } catch (error) {
        localStorage.setItem(`sidebar_order_${userId}`, JSON.stringify(sidebarOrder));
        setLocalOrder(sidebarOrder);
        return sidebarOrder;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidebar_preferences', userId] });
    },
  });

  const applySidebarOrder = (items: SidebarItem[]): SidebarItem[] => {
    const currentPreferences = preferences || localOrder;
    
    if (!currentPreferences || !Array.isArray(currentPreferences) || currentPreferences.length === 0) {
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

    return orderedItems;
  };

  const saveSidebarOrder = (orderedItems: SidebarItem[]) => {
    const order = orderedItems.map(item => item.title);
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