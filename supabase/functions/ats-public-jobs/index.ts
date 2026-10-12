// Public, read-only feed of published open ATS jobs for the careers website.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
};
const JSON_HEADERS = {
  ...CORS,
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
};
const EMPLOYMENT: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship", trainee: "Trainee",
};
const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : null);
const reply = (status: number, body: unknown, headers: Record<string, string> = JSON_HEADERS) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return reply(405, { error: "method_not_allowed" }, { ...CORS, "Content-Type": "application/json" });
  const t0 = Date.now();
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const slug = new URL(req.url).searchParams.get("slug")?.trim().toLowerCase() || null;
    let q = db.from("ats_jobs")
      .select("slug,title,department_id,location,employment_type,experience_min_years,experience_max_years,salary_min,salary_max,salary_period,show_salary,summary,description,requirements,benefits,shift_ids,opened_at,created_at,target_close_date")
      .eq("status", "open").eq("is_published", true)
      .order("opened_at", { ascending: false, nullsFirst: false });
    if (slug) q = q.eq("slug", slug);
    const { data: jobs, error } = await q;
    if (error) throw error;

    const deptIds = [...new Set((jobs ?? []).map((j) => j.department_id).filter(Boolean))];
    const shiftIds = [...new Set((jobs ?? []).flatMap((j) => j.shift_ids ?? []))];
    const [depts, shifts] = await Promise.all([
      deptIds.length ? db.from("departments").select("id,name").in("id", deptIds) : Promise.resolve({ data: [] as any[] }),
      shiftIds.length ? db.from("hr_shifts").select("id,name,start_time,end_time").in("id", shiftIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const dMap = new Map((depts.data ?? []).map((d: any) => [d.id, d.name]));
    const sMap = new Map((shifts.data ?? []).map((s: any) => [s.id, { name: s.name, start: hhmm(s.start_time), end: hhmm(s.end_time) }]));

    const out = (jobs ?? []).map((j) => ({
      slug: j.slug,
      title: j.title,
      department: (j.department_id && dMap.get(j.department_id)) ?? null,
      location: j.location,
      employment_type: j.employment_type,
      employment_type_label: EMPLOYMENT[j.employment_type as string] ?? null,
      experience_min_years: j.experience_min_years,
      experience_max_years: j.experience_max_years,
      salary: j.show_salary ? { min: j.salary_min, max: j.salary_max, period: j.salary_period, currency: "INR" } : null,
      summary: j.summary,
      description: j.description,
      requirements: j.requirements,
      benefits: j.benefits,
      shifts: (j.shift_ids ?? []).map((id: string) => sMap.get(id)).filter(Boolean),
      posted_at: j.opened_at ?? j.created_at,
      valid_through: j.target_close_date,
    }));
    console.log(JSON.stringify({ fn: "ats-public-jobs", count: out.length, by_slug: !!slug, ms: Date.now() - t0 }));
    if (slug) return out[0] ? reply(200, { job: out[0] }) : reply(404, { error: "not_found" });
    return reply(200, { generated_at: new Date().toISOString(), jobs: out });
  } catch (_e) {
    console.log(JSON.stringify({ fn: "ats-public-jobs", error: "internal", ms: Date.now() - t0 }));
    return reply(500, { error: "internal" }, { ...CORS, "Content-Type": "application/json" });
  }
});
