import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { CardSkeleton } from "@/components/ui/skeleton";
import TemplateEditorForm, { type TemplateRecord } from "@/components/hrms/documents/TemplateEditorForm";

export default function DocumentTemplateEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const { data: template, isLoading } = useQuery({
    queryKey: ["hr_doc_template", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_templates").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as TemplateRecord;
    },
  });

  const back = () => navigate("/hrms/documents");

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <Button variant="ghost" size="sm" className="h-8 -ml-2 gap-1.5" onClick={back}>
        <ArrowLeft className="h-4 w-4" /> Documents
      </Button>

      <PageHeader
        title={isNew ? "New template" : `Edit template${template?.name ? ` — ${template.name}` : ""}`}
        description="Compose the letter on an A4 canvas and map every {variable} to a data field"
      />

      {!isNew && isLoading ? (
        <CardSkeleton />
      ) : (
        <TemplateEditorForm template={isNew ? null : (template as TemplateRecord) ?? null} onDone={back} />
      )}
    </div>
  );
}
