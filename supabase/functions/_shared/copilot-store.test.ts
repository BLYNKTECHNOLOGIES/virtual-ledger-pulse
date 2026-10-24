// deno-lint-ignore-file no-explicit-any
// Run: deno test supabase/functions/_shared/copilot-store.test.ts
// One save per press (copilot_learn_keys): the queries the store sends. A key is finished or given back only by the press
// that holds it (its claim token); after an Undo one conditional update takes it back; a save that never finished gives
// its key up after two minutes to one caller; errors are logged, never thrown.
import { LEARN_KEY_STALE_MS, makeStore } from './copilot-store.ts'
import { eq, ok } from './copilot-fakes.test-helpers.ts'

type Call = { table: string; op: string; values?: any; filters: Array<[string, string, unknown]>; returning?: string }

/** A stand-in for supabase-js: records each query and answers it with `answer`. */
function fakeDb(answer: (c: Call) => { data?: any; error?: any }) {
  const calls: Call[] = []
  const db: any = {
    from(table: string) {
      const c: Call = { table, op: 'select', filters: [] }
      calls.push(c)
      const b: any = {
        insert(v: any) { c.op = 'insert'; c.values = v; return b },
        update(v: any) { c.op = 'update'; c.values = v; return b },
        delete() { c.op = 'delete'; return b },
        select(cols?: string) { if (c.op !== 'select') c.returning = cols; return b },
        eq(k: string, v: unknown) { c.filters.push(['eq', k, v]); return b },
        is(k: string, v: unknown) { c.filters.push(['is', k, v]); return b },
        lt(k: string, v: unknown) { c.filters.push(['lt', k, v]); return b },
        maybeSingle() { return b },
        then(res: any, rej: any) {
          return Promise.resolve(answer(c)).then((r) => ({ data: r.data ?? null, error: r.error ?? null })).then(res, rej)
        },
      }
      return b
    },
  }
  return { store: makeStore(db, db), calls }
}
const KEY = 'a'.repeat(64)
const USER = 'd1a85fd5-f5a8-47af-ae42-e0b4683d82c9'
const has = (c: Call, op: string, k: string, v?: unknown) => c.filters.some(([o, kk, vv]) => o === op && kk === k && (v === undefined || vv === v))

Deno.test('a new key is taken with its own claim token', async () => {
  const { store, calls } = fakeDb(() => ({}))
  const r = await store.claimLearnKey(KEY, USER, '2294')
  eq([r.claimed, r.result], [true, null]); ok(typeof r.token === 'string' && r.token.length === 36)
  const ins = calls.find((c) => c.op === 'insert')!
  eq([ins.table, ins.values.key, ins.values.claim_token], ['copilot_learn_keys', KEY, r.token])
})

Deno.test('a key held by another press: its answer when finished; taken over (conditionally) only after two minutes', async () => {
  // finished: the stored answer, nothing changed
  let s = fakeDb((c) => c.op === 'insert' ? { error: { code: '23505' } } : c.op === 'select' ? { data: { result: { eventId: 'e1' }, created_at: new Date().toISOString() } } : {})
  eq(await s.store.claimLearnKey(KEY, USER, '2294'), { claimed: false, token: null, result: { eventId: 'e1' } })
  ok(!s.calls.some((c) => c.op === 'update'), 'no takeover')
  // still saving (under two minutes): refused, nothing changed
  s = fakeDb((c) => c.op === 'insert' ? { error: { code: '23505' } } : c.op === 'select' ? { data: { result: null, created_at: new Date().toISOString() } } : {})
  eq(await s.store.claimLearnKey(KEY, USER, '2294'), { claimed: false, token: null, result: null })
  ok(!s.calls.some((c) => c.op === 'update'))
  // stopped mid-way over two minutes ago: one conditional update (still unfinished, still old) takes it with a new token
  const old = new Date(Date.now() - LEARN_KEY_STALE_MS - 5_000).toISOString()
  s = fakeDb((c) => c.op === 'insert' ? { error: { code: '23505' } } : c.op === 'select' ? { data: { result: null, created_at: old } } : { data: [{ key: KEY }] })
  const taken = await s.store.claimLearnKey(KEY, USER, '2294')
  ok(taken.claimed && taken.token)
  const up = s.calls.find((c) => c.op === 'update')!
  eq(up.values.claim_token, taken.token)
  ok(has(up, 'eq', 'key', KEY) && has(up, 'is', 'result', null) && has(up, 'lt', 'created_at'), JSON.stringify(up.filters))
  // another caller won that update: refused
  s = fakeDb((c) => c.op === 'insert' ? { error: { code: '23505' } } : c.op === 'select' ? { data: { result: null, created_at: old } } : { data: [] })
  eq((await s.store.claimLearnKey(KEY, USER, '2294')).claimed, false)
})

Deno.test('after an Undo the key is taken back with one update conditioned on the undone event', async () => {
  let s = fakeDb(() => ({ data: [{ key: KEY }] }))
  const token = await s.store.reclaimLearnKey(KEY, USER, 'ev-1')
  ok(token)
  const up = s.calls[0]
  eq([up.op, up.values.result, up.values.claim_token], ['update', null, token])
  ok(has(up, 'eq', 'key', KEY) && has(up, 'eq', 'result->>eventId', 'ev-1'), JSON.stringify(up.filters))
  // another press took it back first (no row matched): not taken
  s = fakeDb(() => ({ data: [] }))
  eq(await s.store.reclaimLearnKey(KEY, USER, 'ev-1'), null)
})

Deno.test('a key is finished or given back only with its holder\'s token; errors are logged, not thrown', async () => {
  const s = fakeDb(() => ({ error: { code: '57014', message: 'timeout' } }))
  const logged: string[] = []
  const err = console.error
  console.error = (m: string) => { logged.push(String(m)) }
  try {
    await s.store.finishLearnKey(KEY, 'tok-1', { eventId: 'e1' })
    await s.store.releaseLearnKey(KEY, 'tok-1')
  } finally {
    console.error = err
  }
  const [fin, rel] = s.calls
  eq([fin.op, rel.op], ['update', 'delete'])
  ok(has(fin, 'eq', 'claim_token', 'tok-1') && has(fin, 'eq', 'key', KEY) && has(rel, 'eq', 'claim_token', 'tok-1') && has(rel, 'eq', 'key', KEY))
  ok(logged.some((m) => m.includes('learn_key_finish_failed')) && logged.some((m) => m.includes('learn_key_release_failed')), logged.join('\n'))
  // no token (the table could not be used): nothing is sent
  const t = fakeDb(() => ({}))
  await t.store.finishLearnKey(KEY, null, {})
  await t.store.releaseLearnKey(KEY, null)
  eq(t.calls.length, 0)
})
