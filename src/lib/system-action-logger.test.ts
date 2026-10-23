import { beforeEach, describe, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), upsert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/session-cache', () => ({ getSessionUserId: () => null }));
import { logAction } from './system-action-logger';

const params = {
  userId: '11111111-1111-4111-8111-111111111111',
  actionType: 'sales.order_edited',
  entityType: 'sales_order',
  entityId: '22222222-2222-4222-8222-222222222222',
  module: 'sales',
  metadata: { changed: ['total_amount'] },
};

describe('system action logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ insert: mocks.insert, upsert: mocks.upsert });
    mocks.insert.mockResolvedValue({ error: null });
  });

  test('writes one row per call with a plain insert (no conflict target the table lacks)', async () => {
    await logAction(params);
    await logAction(params);
    expect(mocks.from).toHaveBeenCalledWith('system_action_logs');
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    const row = mocks.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: params.userId,
      action_type: params.actionType,
      entity_type: params.entityType,
      entity_id: params.entityId,
      module: params.module,
      metadata: params.metadata,
    });
    expect(typeof row.recorded_at).toBe('string');
    expect(row).not.toHaveProperty('user_name');
  });

  test('keeps the user name when given', async () => {
    await logAction({ ...params, userName: 'Test Operator' });
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ user_name: 'Test Operator' });
  });

  test('never blocks the caller when the write fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: { message: 'denied' } });
    await expect(logAction(params)).resolves.toBeUndefined();
    mocks.insert.mockRejectedValue(new Error('network'));
    await expect(logAction(params)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  test('skips the write when required fields are missing', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await logAction({ ...params, entityId: '' });
    expect(mocks.insert).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
