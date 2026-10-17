import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DesignationRow } from "@/lib/hrms/designations";

/**
 * Every designation (tentative ones included) with its grade, department, "reports to" and planning flag.
 * Same query and cache as Organization › Structure; designation edits refresh it (invalidateDesignationCopies).
 */
export function useDesignationCatalog() {
  return useQuery({
    queryKey: ["hr_positions", "structure"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, title, department_id, hierarchy_level, reports_to_position_id, is_active, in_workforce_planning")
        .order("title");
      if (error) throw error;
      return (data || []) as (DesignationRow & { title: string })[];
    },
  });
}

/** Every department (inactive ones included), for names. Same cache as Organization › Structure. */
export function useDepartmentCatalog() {
  return useQuery({
    queryKey: ["hr_departments", "structure"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code, is_active").order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string; code: string | null; is_active: boolean | null }[];
    },
  });
}
