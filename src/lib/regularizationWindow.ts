/**
 * Shared validation for attendance regularization (correction) windows.
 *
 * Rules (mirrored exactly in the DB trigger hr_normalize_regularization_times):
 *  - an out-time at or before the in-time is treated as an overnight shift and
 *    rolled to the next calendar day
 *  - the resulting window must be greater than 0 and at most 18 hours
 */
export const MAX_REGULARIZATION_HOURS = 18;

export interface RegularizationWindow {
  checkIn: string | null;
  checkOut: string | null;
  spanHours: number | null;
  crossesMidnight: boolean;
}

/** Builds ISO timestamps from a date + HH:mm pair, rolling overnight out-times forward. */
export function buildRegularizationWindow(
  date: string,
  timeIn: string,
  timeOut: string,
): RegularizationWindow {
  const toIso = (t: string) => (date && t ? new Date(`${date}T${t}:00`).toISOString() : null);
  const checkIn = toIso(timeIn);
  let checkOut = toIso(timeOut);
  let crossesMidnight = false;

  if (checkIn && checkOut && checkOut <= checkIn) {
    checkOut = new Date(new Date(checkOut).getTime() + 86_400_000).toISOString();
    crossesMidnight = true;
  }

  const spanHours =
    checkIn && checkOut
      ? (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 3_600_000
      : null;

  return { checkIn, checkOut, spanHours, crossesMidnight };
}

/** Returns a human error message when the window is not a plausible shift, else null. */
export function validateRegularizationWindow(w: RegularizationWindow): string | null {
  if (w.spanHours === null) return null;
  if (w.spanHours <= 0) {
    return 'Check-out must be after check-in.';
  }
  if (w.spanHours > MAX_REGULARIZATION_HOURS) {
    return `This works out to ${w.spanHours.toFixed(1)} hours, which is longer than a single shift can be (max ${MAX_REGULARIZATION_HOURS} hours). Please re-check the times — AM/PM is often entered the wrong way round.`;
  }
  return null;
}
