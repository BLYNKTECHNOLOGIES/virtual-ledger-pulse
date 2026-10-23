import { beforeEach, describe, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
import { fetchSalesClientPan } from './salesClientPan';

describe('sales client PAN identity and access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  });
  test('reads PAN only from the exact linked client ID', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { pan_card_number: ' ABCDE1234F ' }, error: null });
    expect(await fetchSalesClientPan('linked-client-id', true)).toBe('ABCDE1234F');
    expect(mocks.from).toHaveBeenCalledWith('clients');
    expect(mocks.select).toHaveBeenCalledWith('pan_card_number');
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('id', 'linked-client-id');
  });
  test('does not read client data without client access', async () => {
    expect(await fetchSalesClientPan('linked-client-id', false)).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  test('does not guess another client when the order has no client link', async () => {
    expect(await fetchSalesClientPan(null, true)).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  test('keeps an unsaved PAN absent', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { pan_card_number: null }, error: null });
    expect(await fetchSalesClientPan('linked-client-id', true)).toBeNull();
  });
  test('does not disguise a failed lookup as a missing PAN', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error('Access denied') });
    await expect(fetchSalesClientPan('linked-client-id', true)).rejects.toThrow('Access denied');
  });
});