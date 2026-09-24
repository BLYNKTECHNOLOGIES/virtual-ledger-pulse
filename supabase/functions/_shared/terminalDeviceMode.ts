/**
 * Terminal device-mode guard (office vs personal view-only devices).
 *
 * A terminal unlock creates a session whose `mode` is decided server-side from
 * the WebAuthn credential's trust level. Edge
 * functions run with the service role and therefore bypass row-level rules and
 * the database statement guard, so every mutating action must call
 * `assertTerminalWriteAllowed()` explicitly.
 */

export type TerminalSessionMode = 'full' | 'view_only';

// deno-lint-ignore no-explicit-any
type Admin = any;

export function clientIpFromRequest(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null;
}

export async function getTerminalSessionMode(admin: Admin, userId: string): Promise<TerminalSessionMode> {
  try {
    const { data, error } = await admin.rpc('terminal_session_mode', { p_user_id: userId });
    if (error) throw error;
    return data === 'view_only' ? 'view_only' : 'full';
  } catch (err) {
    console.error('terminal_session_mode lookup failed:', err);
    // Fail open on lookup failure: the database statement guard is the backstop.
    return 'full';
  }
}

export const VIEW_ONLY_ERROR =
  'View-only device: this action is blocked. You are signed in on a personal (view-only) device — use an office computer to act on orders, chats or ads.';

/**
 * Throws when the caller's current terminal unlock is a view-only session.
 * Records the refused attempt for auditing.
 */
export async function assertTerminalWriteAllowed(
  admin: Admin,
  userId: string | null,
  actionName: string,
): Promise<void> {
  if (!userId) return; // service-role / scheduler automation

  const mode = await getTerminalSessionMode(admin, userId);
  if (mode !== 'view_only') return;

  try {
    await admin.from('terminal_view_only_denials').insert({
      user_id: userId,
      session_mode: mode,
      object_name: actionName,
      operation: 'EDGE_ACTION',
      enforcement_mode: 'enforce',
      detail: { action: actionName },
    });
  } catch (err) {
    console.error('failed to log view-only denial:', err);
  }

  throw new Error(VIEW_ONLY_ERROR);
}
