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
// Keep subjects strictly ASCII and short: denomailer 1.6.0 does not fold long
// RFC2047 encoded-words, which leaks header text into the message body.
const sanitizeSubject = (s: string) =>
  s.replace(/[\u2010-\u2015]/g, "-").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().slice(0, 72);

type Mailbox = { from: string; host: string; user: string; pass: string };

async function getMailbox(admin: any): Promise<Mailbox | { error: string }> {
  const { data: mailbox } = await admin
    .from("hr_mailboxes").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle();
  if (!mailbox) return { error: "No active HR mailbox configured" };
  const host = Deno.env.get(mailbox.smtp_host_secret) || Deno.env.get("HR_SMTP_HOST");
  const user = (Deno.env.get(mailbox.smtp_user_secret) || Deno.env.get("HR_SMTP_USER") || "").trim();
  const pass = (Deno.env.get(mailbox.smtp_pass_secret) || Deno.env.get("HR_SMTP_PASS") || "").replace(/\s+/g, "");
  if (!host || !user || !pass) return { error: "SMTP credentials are not configured" };
  return { from: `${mailbox.from_name || "Blynk HR"} <${mailbox.from_address || user}>`, host, user, pass };
}

// denomailer's quoted-printable encoder turns any space that sits at the end of a
// line into a literal "=20", which mail clients then show as text. Strip trailing
// whitespace (and blank lines) from every line before handing content to the mailer.
const tidyBody = (s: string) =>
  s.replace(/\r\n/g, "\n").replace(/[ \t]+(?=\n)/g, "").replace(/\n{2,}/g, "\n").trim();

async function sendMail(mb: Mailbox, to: string, subject: string, html: string, attachment: any) {
  const client = new SMTPClient({
    connection: { hostname: mb.host, port: 465, tls: true, auth: { username: mb.user, password: mb.pass } },
  });
  try {
    await client.send({
      from: mb.from, to, subject,
      content: tidyBody(hrSignatureText()),
      html: tidyBody(html),
      attachments: attachment ? ([attachment] as any) : undefined,
    });
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace(/^Bearer /i, "").trim();
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

    // ---- Preview lane: send sample renders of each document-type template ----
    if (body.previewCategories) {
      const cats: string[] = Array.isArray(body.previewCategories) ? body.previewCategories : [];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideTo)) return json({ error: "A valid 'to' is required" }, 400);
      const mb = await getMailbox(admin);
      if ("error" in mb) return json({ error: mb.error }, 400);

      // Attach a real archived PDF (latest issued letter) so the sample shows the
      // finished letterhead PDF exactly as employees receive it.
      let sampleAttachment: any = null;
      let sampleRef = "";
      const { data: latest } = await admin
        .from("hr_documents_issued")
        .select("reference_no,pdf_path,issued_at")
        .not("pdf_path", "is", null)
        .order("issued_at", { ascending: false })
        .limit(1).maybeSingle();
      if (latest?.pdf_path) {
        const { data: file } = await admin.storage.from("hr-doc-issued").download(latest.pdf_path);
        if (file) {
          const buf = new Uint8Array(await file.arrayBuffer());
          let bin = "";
          for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
          sampleRef = latest.reference_no || "";
          sampleAttachment = {
            filename: `${(latest.reference_no || "sample-letter").replace(/[\\/]/g, "-")}.pdf`,
            content: btoa(bin),
            encoding: "base64",
            contentType: "application/pdf",
          };
        }
      }

      const sent: string[] = [];
      for (const cat of cats) {
        const names: Record<string, string> = {
          relieving: "Relieving cum Experience Letter",
          appointment: "Appointment Letter",
          appraisal: "Appraisal Letter",
          warning: "Warning / Disciplinary Letter",
          custom: "Address Proof Letter",
        };
        const t = buildDocEmail({
          employeeName: "Shubham Singh",
          referenceNo: sampleRef || `BLYNK/SAMPLE/2026-27/000${cats.indexOf(cat) + 1}`,
          documentName: names[cat] || "Document",
          category: cat,
          issuedDate: fmt(new Date().toISOString())!,
          lastWorkingDate: cat === "relieving" ? "31 Jul 2026" : null,
          designation: "Senior Operations Manager",
        });
        const subj = `[SAMPLE] ${sanitizeSubject(t.subject)}`.slice(0, 72);
        await sendMail(mb, overrideTo, subj, wrapHrEmail(t.html, {
          title: t.subject.split(" - ")[0],
          preheader: `Sample template preview - ${names[cat] || cat}`,
          refNote: sampleAttachment
            ? `Sample preview - PDF attached (Ref ${sampleRef || "n/a"})`
            : `Sample preview - no document attached`,
        }), sampleAttachment);
        sent.push(subj);
      }
      return json({ success: true, to: overrideTo, sent });
    }

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
      category: doc.category,
      issuedDate: fmt(doc.issued_at) || fmt(new Date().toISOString())!,
      lastWorkingDate: lastWorking,
      designation,
    });
    const safeSubject = sanitizeSubject(tpl.subject);
    const html = wrapHrEmail(tpl.html, {
      title: tpl.subject.split(" - ")[0],
      preheader: `${doc.template_name} · ${doc.reference_no}`,
      refNote: `Automated notice · Ref ${doc.reference_no || "—"}`,
    });

    const mb = await getMailbox(admin);
    if ("error" in mb) return json({ error: mb.error }, 400);
    await sendMail(mb, to, safeSubject, html, attachment);

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
