import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const JD_BUCKET = "job-descriptions";
export const JD_FULL_COMPENDIUM_PATH =
  "compendium-2026/Blynk_Job_Description_Compendium.pdf";

export interface JobDescriptionRow {
  id: string;
  role_title: string;
  reference: string;
  section: string | null;
  page_from: number | null;
  page_to: number | null;
  storage_path: string;
  source_document: string | null;
  position_id: string | null;
  is_active: boolean;
}

/** All job descriptions in the HR library (31 role charters from the compendium). */
export function useJobDescriptions() {
  return useQuery({
    queryKey: ["hr_job_descriptions"],
    queryFn: async (): Promise<JobDescriptionRow[]> => {
      const { data, error } = await supabase
        .from("hr_job_descriptions")
        .select(
          "id, role_title, reference, section, page_from, page_to, storage_path, source_document, position_id, is_active",
        )
        .order("section", { ascending: true })
        .order("role_title", { ascending: true });
      if (error) throw error;
      return (data || []) as JobDescriptionRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Creates a short-lived signed URL for a job description PDF (private bucket). */
export async function getJdSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(JD_BUCKET)
    .createSignedUrl(storagePath, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

/** Links a job description to a position (and clears any other JD on that position). */
export function useLinkJobDescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jdId,
      positionId,
    }: {
      jdId: string;
      positionId: string | null;
    }) => {
      if (positionId) {
        // one JD per position — release the previous holder first
        const { error: clearError } = await supabase
          .from("hr_job_descriptions")
          .update({ position_id: null })
          .eq("position_id", positionId)
          .neq("id", jdId);
        if (clearError) throw clearError;
      }
      const { data, error } = await supabase
        .from("hr_job_descriptions")
        .update({ position_id: positionId })
        .eq("id", jdId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("No change saved — HR permission required");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_job_descriptions"] });
      toast.success("Job description link updated");
    },
    onError: (e: any) =>
      toast.error(`Could not update link: ${e?.message || "unknown error"}`),
  });
}
