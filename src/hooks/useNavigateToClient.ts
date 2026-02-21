import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useNavigateToClient() {
  const navigate = useNavigate();

  const navigateToClient = async (clientName: string) => {
    if (!clientName?.trim()) return;

    const { data, error } = await supabase
      .from('clients')
      .select('id')
      .ilike('name', clientName.trim())
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      toast.error("Client not found", { description: `No client record found for "${clientName}"` });
      return;
    }

    navigate(`/clients/${data.id}`);
  };

  return navigateToClient;
}
