// F10 · Pulse-triggered executable check for the 05:00-IST attendance window
// rule. Same assertions as auto-absent-marking/window_test.ts, exposed as an
// HTTP endpoint so System Pulse can call it without needing a Deno test runner.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function windowDateIST(iso: string): string {
  const d = new Date(iso);
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const h = ist.getUTCHours();
  const rolled = h < 5 ? new Date(ist.getTime() - 24 * 3600_000) : ist;
  return rolled.toISOString().slice(0, 10);
}

type Case = { name: string; iso: string; expected: string };
const CASES: Case[] = [
  { name: "04:30 IST → previous attendance day",   iso: "2026-07-24T23:00:00Z", expected: "2026-07-24" },
  { name: "05:00 IST → same calendar day",         iso: "2026-07-24T23:30:00Z", expected: "2026-07-25" },
  { name: "23:59 IST → same calendar day",         iso: "2026-07-25T18:29:00Z", expected: "2026-07-25" },
  { name: "00:30 IST → previous attendance day",   iso: "2026-07-24T19:00:00Z", expected: "2026-07-24" },
  { name: "05:01 IST → same calendar day",         iso: "2026-07-24T23:31:00Z", expected: "2026-07-25" },
];

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const results = CASES.map((c) => {
    const actual = windowDateIST(c.iso);
    return { name: c.name, iso: c.iso, expected: c.expected, actual, pass: actual === c.expected };
  });
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const ok = passed === total;
  return new Response(JSON.stringify({
    ok,
    passed,
    total,
    checked_at: new Date().toISOString(),
    boundary_rule: "attendance day rolls back to previous date if IST hour < 5",
    results,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
