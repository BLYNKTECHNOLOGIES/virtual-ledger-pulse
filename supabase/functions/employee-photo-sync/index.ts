import { requireCaller } from "../_shared/require-caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


const IMAGE_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Resolve a stored document reference into (bucket, path). */
function parseRef(url?: string | null): { bucket: string; path: string } | null {
  if (!url) return null;
  const scheme = /^([a-z0-9-]+):\/\/(.+)$/i.exec(url);
  if (scheme && !/^https?:$/i.test(scheme[1] + ":")) {
    return { bucket: scheme[1], path: scheme[2] };
  }
  const pub = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/.exec(url);
  if (pub) return { bucket: pub[1], path: decodeURIComponent(pub[2]) };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    let employeeId: string | null = null;
    try {
      const body = await req.json();
      employeeId = typeof body?.employee_id === "string" ? body.employee_id : null;
    } catch (_) {
      // no body -> full sweep
    }

    let q = admin
      .from("hr_employee_documents")
      .select("id, employee_id, file_url, uploaded_at")
      .eq("document_type", "passport_photo")
      .order("uploaded_at", { ascending: false });
    if (employeeId) q = q.eq("employee_id", employeeId);
    const { data: docs, error: docErr } = await q;
    if (docErr) throw docErr;

    // newest passport photo per employee
    const latest = new Map<string, any>();
    for (const d of docs ?? []) {
      if (d.employee_id && !latest.has(d.employee_id)) latest.set(d.employee_id, d);
    }

    const results: any[] = [];
    for (const [empId, doc] of latest) {
      const { data: emp, error: empErr } = await admin
        .from("hr_employees")
        .select("id, user_id, profile_image_url, profile_image_source_doc_id")
        .eq("id", empId)
        .maybeSingle();
      if (empErr || !emp) {
        results.push({ employee_id: empId, status: "employee_not_found" });
        continue;
      }
      if (emp.profile_image_source_doc_id === doc.id && emp.profile_image_url) {
        results.push({ employee_id: empId, status: "already_synced" });
        continue;
      }

      const ref = parseRef(doc.file_url);
      if (!ref) {
        results.push({ employee_id: empId, status: "unreadable_reference" });
        continue;
      }
      const ext = (ref.path.split(".").pop() || "").toLowerCase();
      const contentType = IMAGE_EXT[ext];
      if (!contentType) {
        results.push({ employee_id: empId, status: "not_an_image", ext });
        continue;
      }

      const dl = await admin.storage.from(ref.bucket).download(ref.path);
      if (dl.error || !dl.data) {
        results.push({ employee_id: empId, status: "download_failed", error: dl.error?.message });
        continue;
      }

      const target = `employees/${empId}/photo-${Date.now()}.${ext}`;
      const up = await admin.storage
        .from("avatars")
        .upload(target, dl.data, { contentType, upsert: true });
      if (up.error) {
        results.push({ employee_id: empId, status: "upload_failed", error: up.error.message });
        continue;
      }

      const publicUrl = admin.storage.from("avatars").getPublicUrl(target).data.publicUrl;

      const { error: updErr } = await admin
        .from("hr_employees")
        .update({ profile_image_url: publicUrl, profile_image_source_doc_id: doc.id })
        .eq("id", empId);
      if (updErr) {
        results.push({ employee_id: empId, status: "employee_update_failed", error: updErr.message });
        continue;
      }

      let erp = "no_linked_user";
      if (emp.user_id) {
        const { data: u } = await admin
          .from("users")
          .select("id, avatar_url")
          .eq("id", emp.user_id)
          .maybeSingle();
        if (u && !u.avatar_url) {
          const { error: uErr } = await admin
            .from("users")
            .update({ avatar_url: publicUrl })
            .eq("id", emp.user_id);
          erp = uErr ? `erp_update_failed: ${uErr.message}` : "erp_set";
        } else {
          erp = "erp_kept_own_picture";
        }
      }

      results.push({ employee_id: empId, status: "synced", url: publicUrl, erp });
    }

    const synced = results.filter((r) => r.status === "synced").length;
    return json({ ok: true, considered: latest.size, synced, results });
  } catch (e) {
    console.error("employee-photo-sync failed", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
