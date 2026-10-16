// Single source for the careers application form rules, shared with the edge functions.
export * from "../../../supabase/functions/_shared/ats-form";
import { supabase } from "@/integrations/supabase/client";
import type { ApplicationForm } from "../../../supabase/functions/_shared/ats-form";

export interface FormTemplate { id: string; name: string; form: ApplicationForm; updated_at: string }

export async function listFormTemplates(): Promise<FormTemplate[]> {
  const { data, error } = await (supabase as any).from("ats_form_templates").select("id,name,form,updated_at").order("name");
  if (error) throw error;
  return data ?? [];
}
export async function saveFormTemplate(name: string, form: ApplicationForm) {
  const { error } = await (supabase as any).from("ats_form_templates").insert({ name: name.trim(), form });
  if (error) throw error;
}
export async function deleteFormTemplate(id: string) {
  const { error } = await (supabase as any).from("ats_form_templates").delete().eq("id", id);
  if (error) throw error;
}
export const newQuestionId = () => "q_" + Math.random().toString(36).slice(2, 10);
