import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ComplianceOption {
  value: string;
  label: string;
  sort_order: number;
}

/**
 * Config-driven dropdowns for the compliance module. Ops can extend the lists
 * from Compliance → Governance → Configuration without a code change.
 */
export function useComplianceOptions(group: string, fallback: ComplianceOption[] = []) {
  const query = useQuery({
    queryKey: ["compliance_config_options", group],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_config_options")
        .select("value, label, sort_order")
        .eq("option_group", group)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as ComplianceOption[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    options: query.data && query.data.length > 0 ? query.data : fallback,
  };
}

export function labelFor(options: ComplianceOption[], value: string | null | undefined) {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}
