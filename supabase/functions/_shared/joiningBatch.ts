const BATCH_DAYS = [1, 7, 14, 21] as const;
const IST_OFFSET_MS = 330 * 60 * 1000;

function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Expected a YYYY-MM-DD calendar date");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date");
  return parsed;
}

export function joiningSendDateIST(instant: Date): string {
  if (!Number.isFinite(instant.getTime())) throw new Error("Invalid send time");
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Next adjusted monthly batch strictly after the IST email-send date. */
export function nextJoiningBatch(sendDateIST: string): string {
  const sent = calendarDate(sendDateIST);
  const candidates: string[] = [];
  for (let offset = 0; offset < 2; offset += 1) {
    for (const day of BATCH_DAYS) {
      const batch = new Date(sent.getTime());
      batch.setUTCDate(1);
      batch.setUTCMonth(sent.getUTCMonth() + offset);
      batch.setUTCDate(day);
      if (batch.getUTCDay() === 0) batch.setUTCDate(day + 1);
      if (batch.getTime() > sent.getTime()) candidates.push(batch.toISOString().slice(0, 10));
    }
  }
  const next = candidates.sort()[0];
  if (!next) throw new Error("No upcoming joining batch");
  return next;
}

export function isJoiningBatch(value: string): boolean {
  const selected = calendarDate(value);
  return BATCH_DAYS.some(day => {
    const batch = new Date(selected.getTime());
    batch.setUTCDate(day);
    if (batch.getUTCDay() === 0) batch.setUTCDate(day + 1);
    return batch.getTime() === selected.getTime();
  });
}

/** Resends preserve the initial scheduling reference rather than moving joining. */
export function joiningDispatchProblem(offeredDate: string, sendInstant: Date, firstSuccessfulSendDateIST?: string): string | null {
  const expected = nextJoiningBatch(firstSuccessfulSendDateIST ?? joiningSendDateIST(sendInstant));
  calendarDate(offeredDate);
  return offeredDate === expected ? null : `The offer joining date must be ${expected}. Revise the offer before sending.`;
}