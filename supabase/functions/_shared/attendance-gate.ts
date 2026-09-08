// Attendance automation gate.
//
// Every job that judges attendance (absent marking) or mails employees/HR about
// attendance MUST call this first. While the biometric readers are down (auto
// pause) or HR has paused manually, the job exits without doing anything; the
// outage recovery worker rebuilds the days and releases the mail afterwards.
//
// Cron keeps firing regardless — this gate is what actually stops the work.

export interface AttendancePauseState {
  paused: boolean;
  state: string;
  reason: string | null;
  outageId: string | null;
  pausedSince: string | null;
}

export async function getAttendancePauseState(admin: any): Promise<AttendancePauseState> {
  try {
    const { data, error } = await admin.rpc("hr_attendance_is_paused");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      paused: !!row?.paused,
      state: row?.state ?? "running",
      reason: row?.reason ?? null,
      outageId: row?.outage_id ?? null,
      pausedSince: row?.paused_since ?? null,
    };
  } catch (e) {
    // Fail open: never let a gate lookup failure freeze attendance forever.
    console.error("[attendance-gate] state lookup failed", e);
    return { paused: false, state: "running", reason: null, outageId: null, pausedSince: null };
  }
}

/** Convenience: returns a JSON Response when paused, otherwise null. */
export async function pausedResponse(
  admin: any,
  corsHeaders: Record<string, string>,
  job: string,
): Promise<Response | null> {
  const s = await getAttendancePauseState(admin);
  if (!s.paused) return null;
  console.log(`[${job}] skipped — attendance automation paused (${s.state}: ${s.reason ?? "no reason"})`);
  return new Response(
    JSON.stringify({
      skipped: true,
      paused: true,
      state: s.state,
      reason: s.reason,
      outage_id: s.outageId,
      paused_since: s.pausedSince,
      message: "Attendance automation is paused (biometric outage or manual hold).",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
