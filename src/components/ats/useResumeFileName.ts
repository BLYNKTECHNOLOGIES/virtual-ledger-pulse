import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Name of the file the interview emails attach: same rule as primaryResume() in ats-interview-notify. */
export const useResumeFileName = (candidateId?: string | null, enabled = true) =>
  useQuery({
    queryKey: ["ats", "resume-file-name", candidateId ?? ""],
    enabled: enabled && !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_files").select("file_name")
        .eq("candidate_id", candidateId!).eq("kind", "resume")
        .order("is_primary", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data?.file_name as string | undefined) ?? null;
    },
  });
