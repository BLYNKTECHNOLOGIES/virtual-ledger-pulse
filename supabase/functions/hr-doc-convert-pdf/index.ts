// Converts an issued DOCX letter into a true PDF using Adobe PDF Services
// (OAuth Server-to-Server credentials). The conversion is done once per letter
// and the resulting PDF is archived in `hr-doc-issued`, so later downloads are
// plain storage reads — no re-rendering, no browser rasterisation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMS_TOKEN = "https://ims-na1.adobelogin.com/ims/token/v3";
const PDF_API = "https://pdf-services-ue1.adobe.io";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function adobeToken(clientId: string, clientSecret: string) {
  const res = await fetch(IMS_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "openid,AdobeID,DCAPI",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Adobe auth failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text).access_token as string;
}

async function convertDocxToPdf(bytes: Uint8Array, clientId: string, token: string): Promise<Uint8Array> {
  const h = { Authorization: `Bearer ${token}`, "x-api-key": clientId, "Content-Type": "application/json" };

  // 1. Reserve an upload slot
  const assetRes = await fetch(`${PDF_API}/assets`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ mediaType: DOCX_MIME }),
  });
  if (!assetRes.ok) throw new Error(`Adobe asset create failed (${assetRes.status}): ${(await assetRes.text()).slice(0, 300)}`);
  const { uploadUri, assetID } = await assetRes.json();

  // 2. Upload the exact merged DOCX
  const up = await fetch(uploadUri, { method: "PUT", headers: { "Content-Type": DOCX_MIME }, body: bytes });
  if (!up.ok) throw new Error(`Adobe upload failed (${up.status})`);

  // 3. Kick off the Word -> PDF operation
  const opRes = await fetch(`${PDF_API}/operation/createpdf`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ assetID, documentLanguage: "en-US" }),
  });
  if (opRes.status !== 201) throw new Error(`Adobe createpdf failed (${opRes.status}): ${(await opRes.text()).slice(0, 300)}`);
  const poll = opRes.headers.get("location");
  if (!poll) throw new Error("Adobe did not return a job location");

  // 4. Poll until done (letters convert in a couple of seconds)
  let downloadUri = "";
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = await fetch(poll, { headers: { Authorization: `Bearer ${token}`, "x-api-key": clientId } });
    if (!st.ok) throw new Error(`Adobe status failed (${st.status})`);
    const body = await st.json();
    if (body.status === "done") { downloadUri = body?.asset?.downloadUri; break; }
    if (body.status === "failed") throw new Error(`Adobe conversion failed: ${JSON.stringify(body?.error || {}).slice(0, 300)}`);
  }
  if (!downloadUri) throw new Error("Adobe conversion timed out");

  // 5. Fetch the rendered PDF
  const pdfRes = await fetch(downloadUri);
  if (!pdfRes.ok) throw new Error(`Adobe download failed (${pdfRes.status})`);
  return new Uint8Array(await pdfRes.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const clientId = Deno.env.get("ADOBE_PDF_CLIENT_ID");
    const clientSecret = Deno.env.get("ADOBE_PDF_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "Adobe PDF Services credentials are not configured" }, 500);

    const { issuedId, force } = await req.json().catch(() => ({}));
    if (!issuedId) return json({ error: "issuedId is required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: doc, error: docErr } = await admin
      .from("hr_documents_issued").select("*").eq("id", issuedId).maybeSingle();
    if (docErr) throw docErr;
    if (!doc) return json({ error: "Issued letter not found" }, 404);
    if (!doc.file_path) return json({ error: "This letter has no stored file" }, 400);

    const isDocx = String(doc.file_mime || "").includes("wordprocessingml") || /\.docx$/i.test(doc.file_path);
    if (!isDocx) return json({ error: "Only Word letters are converted through Adobe" }, 400);

    // Already converted — reuse the archived PDF, never call Adobe again.
    if (!force && doc.pdf_path) {
      const slash = String(doc.pdf_path).lastIndexOf("/");
      const dir = slash > 0 ? doc.pdf_path.slice(0, slash) : "";
      const name = slash > 0 ? doc.pdf_path.slice(slash + 1) : doc.pdf_path;
      const { data: listed } = await admin.storage.from("hr-doc-issued").list(dir, { search: name, limit: 100 });
      if (listed?.some((f: any) => f.name === name)) {
        return json({ pdfPath: doc.pdf_path, cached: true });
      }
    }


    const { data: file, error: dlErr } = await admin.storage.from("hr-doc-issued").download(doc.file_path);
    if (dlErr || !file) throw dlErr || new Error("Could not read the stored letter");

    const pdf = await convertDocxToPdf(
      new Uint8Array(await file.arrayBuffer()),
      clientId,
      await adobeToken(clientId, clientSecret),
    );

    const pdfPath = doc.file_path.replace(/\.[^.]+$/, "") + ".adobe.pdf";
    const { error: upErr } = await admin.storage
      .from("hr-doc-issued").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    await admin.from("hr_documents_issued").update({ pdf_path: pdfPath }).eq("id", doc.id);

    // Keep the employee's filed copy pointing at the real PDF.
    const fileUrl = `hr-doc-issued://${pdfPath}`;
    if (doc.employee_document_id) {
      await admin.from("hr_employee_documents").update({ file_url: fileUrl }).eq("id", doc.employee_document_id);
    } else if (doc.employee_id) {
      const { data: row } = await admin.from("hr_employee_documents").insert({
        employee_id: doc.employee_id,
        document_type: "hr_letter",
        document_name: `${doc.reference_no} — ${doc.template_name}`,
        file_url: fileUrl,
        notes: "Issued from HR Document Studio",
        uploaded_by: doc.issued_by_name || null,
      }).select("id").maybeSingle();
      if (row?.id) await admin.from("hr_documents_issued").update({ employee_document_id: row.id }).eq("id", doc.id);
    }

    return json({ pdfPath, cached: false });
  } catch (e) {
    console.error("hr-doc-convert-pdf error:", e);
    return json({ error: (e as Error)?.message || "Conversion failed" }, 500);
  }
});
