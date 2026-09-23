/**
 * Terminal device-mode guard (office vs personal view-only devices).
 *
 * A terminal unlock creates a session whose `mode` is decided server-side from
 * the WebAuthn credential's trust level plus the office-network check. Edge
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

export async function getGuardSettings(admin: Admin): Promise<{
  enforcementMode: 'off' | 'log_only' | 'enforce';
  requireOfficeNetwork: boolean;
}> {
  try {
    const { data } = await admin
      .from('terminal_device_guard_settings')
      .select('enforcement_mode, require_office_network')
      .eq('id', true)
      .maybeSingle();
    return {
      enforcementMode: (data?.enforcement_mode ?? 'log_only') as 'off' | 'log_only' | 'enforce',
      requireOfficeNetwork: data?.require_office_network ?? true,
    };
  } catch {
    return { enforcementMode: 'log_only', requireOfficeNetwork: true };
  }
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

export async function isOfficeNetwork(admin: Admin, ip: string | null): Promise<boolean> {
  if (!ip) return false;
  try {
    const { data } = await admin.rpc('terminal_ip_is_office', { p_ip: ip });
    return data === true;
  } catch {
    return false;
  }
}

export const VIEW_ONLY_ERROR =
  'View-only device: this action is blocked. You are signed in on a personal (view-only) device — use an office computer to act on orders, chats or ads.';

/**
 * Throws when the caller's current terminal unlock is a view-only session.
 * Always records the attempt for auditing. In `log_only` mode the attempt is
 * recorded but allowed, so the rollout can be verified before enforcing.
 */
export async function assertTerminalWriteAllowed(
  admin: Admin,
  userId: string | null,
  actionName: string,
): Promise<void> {
  if (!userId) return; // service-role / scheduler automation
  const { enforcementMode } = await getGuardSettings(admin);
  if (enforcementMode === 'off') return;

  const mode = await getTerminalSessionMode(admin, userId);
  if (mode !== 'view_only') return;

  try {
    await admin.from('terminal_view_only_denials').insert({
      user_id: userId,
      session_mode: mode,
      object_name: actionName,
      operation: 'EDGE_ACTION',
      enforcement_mode: enforcementMode,
      detail: { action: actionName },
    });
  } catch (err) {
    console.error('failed to log view-only denial:', err);
  }

  if (enforcementMode === 'enforce') {
    throw new Error(VIEW_ONLY_ERROR);
  }
}
