import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@/hooks/useTerminalAuth', () => ({ useTerminalAuth: () => ({ userId: null }) }));

import { copilotDraft } from './useCopilotPlaybook';

describe('copilotDraft: waiting for a chat state another request is drafting', () => {
  beforeEach(() => { vi.useFakeTimers(); invoke.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps asking until the server may take a dead request over, then gets the answer (no Retry needed)', async () => {
    const start = Date.now();
    // The other request died 5 s after it started: it can be taken over once it is 75 s old, and the server says when.
    invoke.mockImplementation(async () => {
      const age = Date.now() - start + 5_000;
      if (age < 75_000) return { data: { status: 'pending', requestId: 'r1', retryAfterMs: 75_000 - age }, error: null };
      return { data: { status: 'ready', playbook: [], drafts: [] }, error: null };
    });
    const p = copilotDraft({ orderNumber: '22944071217231917056' });
    await vi.advanceTimersByTimeAsync(80_000);
    await expect(p).resolves.toMatchObject({ status: 'ready' });
    // often at first, then gently: well within the per-approver allowance
    expect(invoke.mock.calls.length).toBeGreaterThan(10);
    expect(invoke.mock.calls.length).toBeLessThanOrEqual(18);
  });

  it('returns as soon as the other request lands', async () => {
    invoke.mockResolvedValueOnce({ data: { status: 'pending', retryAfterMs: 70_000 }, error: null })
      .mockResolvedValueOnce({ data: { status: 'ready', cached: true }, error: null });
    const p = copilotDraft({ orderNumber: '22944071217231917056' });
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(p).resolves.toMatchObject({ status: 'ready', cached: true });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('without a takeover time (an older server) it gives up after about 45 seconds', async () => {
    invoke.mockResolvedValue({ data: { status: 'pending' }, error: null });
    const p = copilotDraft({ orderNumber: '22944071217231917056' });
    const done = expect(p).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(60_000);
    await done;
    expect(invoke.mock.calls.length).toBeLessThanOrEqual(14);
  });

  it('stops when the chat is closed or changed', async () => {
    let cancelled = false;
    invoke.mockResolvedValue({ data: { status: 'pending', retryAfterMs: 60_000 }, error: null });
    const p = copilotDraft({ orderNumber: '22944071217231917056' }, () => cancelled);
    const done = expect(p).rejects.toMatchObject({ code: 'cancelled' });
    await vi.advanceTimersByTimeAsync(1_000);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(3_000);
    await done;
  });
});
