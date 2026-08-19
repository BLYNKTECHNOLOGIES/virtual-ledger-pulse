// Emails an issued HR letter (with its archived PDF attached) to the employee.
// Uses the branded HR shell + per-document-type template. Never regenerates the PDF.

import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { wrapHrEmail, hrSignatureText } from "../_shared/hrSignature.ts";
import { buildDocEmail } from "../_shared/docEmailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const fmt = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const sampleKey = Deno.env.get("HR_DOC_EMAIL_SAMPLE_KEY");
    const isSample = !!sampleKey && req.headers.get("x-sample-key") === sampleKey;
    const authHeader = req.headers.get("authorization") || "";
    if (!isSample && !authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace(/^Bearer /i, "").trim();
    const isServiceRole = isSample || token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let caller: { id: string; email: string | null } = { id: "00000000-0000-0000-0000-000000000000", email: "service-role" };
    if (!isServiceRole) {
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user?.id) return json({ error: "Unauthorized" }, 401);
      const { data: isHr } = await admin.rpc("hr_is_hr_staff", { _user_id: user.id });
      if (!isHr) return json({ error: "Insufficient permissions" }, 403);
      caller = { id: user.id, email: user.email ?? null };
    }

    const body = await req.json().catch(() => ({}));
    const issuedId = String(body.issuedId || "").trim();
    const overrideTo = String(body.to || "").trim();
    if (!issuedId) return json({ error: "issuedId is required" }, 400);

    const { data: doc } = await admin.from("hr_documents_issued").select("*").eq("id", issuedId).maybeSingle();
    if (!doc) return json({ error: "Issued document not found" }, 404);
    if (doc.status === "revoked") return json({ error: "This letter is revoked and cannot be emailed" }, 400);

    // Recipient
    let to = overrideTo;
    let empName = doc.employee_name || "Team";
    let designation: string | null = null;
    let lastWorking: string | null = null;
    if (doc.employee_id) {
      const { data: emp } = await admin
        .from("hr_employees")
        .select("first_name,last_name,email,last_working_day")
        .eq("id", doc.employee_id).maybeSingle();
      if (emp) {
        empName = [emp.first_name, emp.last_name].filter(Boolean).join(" ") || empName;
        lastWorking = fmt((emp as any).last_working_day);
        if (!to) to = String(emp.email || "").trim();
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "No valid recipient email available" }, 400);

    // Attachment — reuse the archived PDF only, never re-convert
    let attachment: { filename: string; content: string; encoding: "base64"; contentType: string } | null = null;
    if (doc.pdf_path) {
      const { data: file } = await admin.storage.from("hr-doc-issued").download(doc.pdf_path);
      if (file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
        attachment = {
          filename: `${(doc.reference_no || "letter").replace(/[\\/]/g, "-")}.pdf`,
          content: btoa(bin),
          encoding: "base64",
          contentType: "application/pdf",
        };
      }
    }
    if (!attachment && !body.allowWithoutAttachment) {
      return json({ error: "No archived PDF found for this letter — download it once to generate it, then email." }, 400);
    }

    const tpl = buildDocEmail({
      employeeName: empName,
      referenceNo: doc.reference_no || "—",
      documentName: doc.template_name || "Document",
      issuedDate: fmt(doc.issued_at) || fmt(new Date().toISOString())!,
      lastWorkingDate: lastWorking,
      designation,
    });
    // Keep the subject strictly ASCII and short: denomailer 1.6.0 does not fold
    // long RFC2047 encoded-words, which leaks header text into the message body.
    const safeSubject = tpl.subject
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 72);
    const html = wrapHrEmail(tpl.html, {
      title: tpl.subject.split(" - ")[0],
      preheader: `${doc.template_name} · ${doc.reference_no}`,
      refNote: `Automated notice · Ref ${doc.reference_no || "—"}`,
    });

    const { data: mailbox } = await admin
      .from("hr_mailboxes").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle();
    if (!mailbox) return json({ error: "No active HR mailbox configured" }, 400);
    const host = Deno.env.get(mailbox.smtp_host_secret) || Deno.env.get("HR_SMTP_HOST");
    const user = (Deno.env.get(mailbox.smtp_user_secret) || Deno.env.get("HR_SMTP_USER") || "").trim();
    const pass = (Deno.env.get(mailbox.smtp_pass_secret) || Deno.env.get("HR_SMTP_PASS") || "").replace(/\s+/g, "");
    if (!host || !user || !pass) return json({ error: "SMTP credentials are not configured" }, 500);

    const client = new SMTPClient({
      connection: { hostname: host, port: 465, tls: true, auth: { username: user, password: pass } },
    });
    try {
      await client.send({
        from: `${mailbox.from_name || "Blynk HR"} <${mailbox.from_address || user}>`,
        to,
        subject: safeSubject,
        content: hrSignatureText(),
        html,
        attachments: attachment ? ([attachment] as any) : undefined,
      });
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }

    await admin.from("hr_email_send_log").insert({
      message_id: crypto.randomUUID(),
      template_name: "hr-doc-issued",
      recipient_email: to,
      subject: safeSubject,
      status: "sent",
    });
    await admin.from("hr_documents_issued")
      .update({ delivered_at: new Date().toISOString(), delivered_to: to })
      .eq("id", doc.id);
    await admin.from("hr_doc_audit_log").insert({
      entity_type: "issued_document", entity_id: doc.id, action: "emailed",
      actor_id: isServiceRole ? null : caller.id, actor_name: caller.email,
      details: { to, reference_no: doc.reference_no, attached: !!attachment },
    });

    return json({ success: true, to, attached: !!attachment, subject: safeSubject });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
