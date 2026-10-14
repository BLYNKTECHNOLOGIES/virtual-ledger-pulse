/**
 * Leave rules the employee profile shows. The database enforces each of them
 * (hr_leave_request_field_guard and the leave triggers); these helpers only
 * decide which buttons and wording the page offers.
 */
import { istToday } from './format';

/** Requests still waiting for a decision (manager first, then HR). */
export const OPEN_LEAVE_STATUSES = ['requested', 'manager_approved'];

export const isOpenLeave = (status?: string | null) => OPEN_LEAVE_STATUSES.includes(String(status || '').toLowerCase());

/** Paid the way the database decides it: not Loss of Pay and explicitly marked paid. */
export const isPaidLeaveType = (lt?: { code?: string | null; is_paid?: boolean | null } | null) =>
  !!lt && lt.code !== 'LOP' && lt.is_paid === true;

export interface LeaveCancelState {
  canCancel: boolean;
  /** Cancelling an approved leave gives the days back. */
  approved?: boolean;
  /** Why there is no Cancel button, when that's worth saying. */
  note?: string;
}

/**
 * An employee can withdraw a request while it waits for a decision, and an
 * approved leave only before its first day (IST). Once it has started HR
 * handles changes; days they come in are given back automatically.
 */
export function leaveCancelState(req: { status?: string | null; start_date?: string | null; end_date?: string | null }, today = istToday()): LeaveCancelState {
  const status = String(req?.status || '').toLowerCase();
  if (isOpenLeave(status)) return { canCancel: true, approved: false };
  if (status !== 'approved') return { canCancel: false };
  if (req.start_date && req.start_date > today) return { canCancel: true, approved: true };
  if (req.end_date && req.end_date >= today) {
    return { canCancel: false, note: 'On leave now. Days you come in are given back to your balance automatically; ask HR for any other change.' };
  }
  return { canCancel: false };
}
