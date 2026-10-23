import { beforeEach, describe, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), limit: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
import { resolveSalesOrderClientId, AmbiguousClientNameError } from './salesClientLink';

const rows = (data: any[] | null, error: any = null) => mocks.limit.mockResolvedValue({ data, error });

describe('which client a manual sale belongs to', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ ilike: mocks.ilike });
    mocks.ilike.mockReturnValue({ limit: mocks.limit });
  });

  test('the client picked from the list wins, without any name lookup', async () => {
    expect(await resolveSalesOrderClientId('picked-id', 'Rahul Verma')).toBe('picked-id');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test('a typed name links the only active client with exactly that name', async () => {
    rows([{ id: 'meera', name: 'Meera Nair' }, { id: 'meera-p', name: 'Meera Naira Patil' }]);
    expect(await resolveSalesOrderClientId(undefined, '  meera nair ')).toBe('meera');
    expect(mocks.from).toHaveBeenCalledWith('clients');
    expect(mocks.eq).toHaveBeenCalledWith('is_deleted', false);
    expect(mocks.ilike).toHaveBeenCalledWith('name', '%meera nair%');
  });

  test('outer spaces and letter case on the stored name do not matter (same rule as the database)', async () => {
    rows([{ id: 'r1', name: ' RAHUL VERMA ' }]);
    expect(await resolveSalesOrderClientId(null, 'Rahul Verma')).toBe('r1');
  });

  test('two namesakes stop the entry until one is picked', async () => {
    rows([{ id: 'r1', name: 'RAHUL VERMA' }, { id: 'r2', name: 'Rahul Verma' }]);
    const err = await resolveSalesOrderClientId(undefined, 'Rahul Verma').catch((e) => e);
    expect(err).toBeInstanceOf(AmbiguousClientNameError);
    expect(err.message).toContain('2 clients are named “Rahul Verma”');
  });

  test('a name nobody has is a new buyer', async () => {
    rows([{ id: 'x', name: 'Rahul Verma Sharma' }]);
    expect(await resolveSalesOrderClientId(undefined, 'Rahul Verma')).toBeNull();
  });

  test('wildcard characters only widen the search, never the match', async () => {
    rows([{ id: 'x', name: 'RAHULX VERMA' }, { id: 'y', name: 'RAHUL_VERMA' }]);
    expect(await resolveSalesOrderClientId(undefined, 'RAHUL_VERMA')).toBe('y');
  });

  test('an empty name looks nothing up', async () => {
    expect(await resolveSalesOrderClientId(undefined, '   ')).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test('a failed lookup is reported, not treated as a new buyer', async () => {
    rows(null, new Error('network down'));
    await expect(resolveSalesOrderClientId(undefined, 'Rahul Verma')).rejects.toThrow('network down');
  });
});
