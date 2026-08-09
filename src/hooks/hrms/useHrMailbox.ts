import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";


export interface HrMailbox {
  id: string;
  label: string;
  from_address: string;
  from_name: string | null;
  imap_enabled: boolean;
  imap_host: string | null;
  imap_last_sync_at: string | null;
  imap_last_error: string | null;
  is_active: boolean;
}

export interface HrMailMessage {
  id: string;
  mailbox_id: string;
  from_address: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  body_html: string | null;
  body_text: string | null;
  received_at: string | null;
  is_read: boolean;
  matched_employee_id: string | null;
  has_attachments: boolean;
}

export interface HrMailCampaign {
  id: string;
  subject: string;
  body_html: string;
  from_address: string;
  recipient_mode: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  sent_by_name: string | null;
  created_at: string;
}

export interface HrMailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
}

const anyDb = supabase as any;

export function useHrMailboxes() {
  return useQuery({
    queryKey: ["hr_mailboxes"],
    queryFn: async (): Promise<HrMailbox[]> => {
      const { data, error } = await anyDb.from("hr_mailboxes").select("*").order("label");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useHrMailMessages(mailboxId?: string, search = "") {
  return useQuery({
    queryKey: ["hr_mail_messages", mailboxId, search],
    queryFn: async (): Promise<HrMailMessage[]> => {
      let q = anyDb.from("hr_mail_messages").select("*").order("received_at", { ascending: false }).limit(200);
      if (mailboxId) q = q.eq("mailbox_id", mailboxId);
      if (search.trim()) q = q.or(`subject.ilike.%${search}%,from_address.ilike.%${search}%,snippet.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useHrMailCampaigns(mailboxId?: string) {
  return useQuery({
    queryKey: ["hr_mail_campaigns", mailboxId],
    queryFn: async (): Promise<HrMailCampaign[]> => {
      let q = anyDb
        .from("hr_mail_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (mailboxId) q = q.eq("mailbox_id", mailboxId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useHrMailRecipients(campaignId?: string) {
  return useQuery({
    queryKey: ["hr_mail_campaign_recipients", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await anyDb
        .from("hr_mail_campaign_recipients")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("email");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useHrMailTemplates() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["hr_mail_templates"],
    queryFn: async (): Promise<HrMailTemplate[]> => {
      const { data, error } = await anyDb.from("hr_mail_templates").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async (t: { id?: string; name: string; subject: string; body_html: string }) => {
      if (t.id) {
        const { error } = await anyDb.from("hr_mail_templates").update({
          name: t.name, subject: t.subject, body_html: t.body_html,
        }).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await anyDb.from("hr_mail_templates").insert({
          name: t.name, subject: t.subject, body_html: t.body_html,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_mail_templates"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyDb.from("hr_mail_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_mail_templates"] }),
  });

  return { ...query, save, remove };
}

export function useHrMailEmployees() {
  return useQuery({
    queryKey: ["hr_mail_employee_recipients"],
    queryFn: async () => {
      const { data, error } = await anyDb
        .from("hr_employees")
        .select("id, first_name, last_name, email, badge_id, is_active")
        .eq("is_active", true)
        .not("email", "is", null)
        .order("first_name");
      if (error) throw error;
      return (data || []).filter((e: any) => e.email);
    },
  });
}

export function useSendHrMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("hr-mail-send", { body: payload });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_mail_campaigns"] });
      qc.invalidateQueries({ queryKey: ["hr_mail_campaign_recipients"] });
    },
  });
}

export function useFetchHrMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mailboxId?: string) => {
      const { data, error } = await supabase.functions.invoke("hr-mail-fetch", {
        body: mailboxId ? { mailboxId } : {},
      });
      if (error) throw new Error(error.message);
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_mail_messages"] });
      qc.invalidateQueries({ queryKey: ["hr_mailboxes"] });
    },
  });
}

export function useMarkMailRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      const { error } = await anyDb.from("hr_mail_messages").update({ is_read: isRead }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_mail_messages"] }),
  });
}
