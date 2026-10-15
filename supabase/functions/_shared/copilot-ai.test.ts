// deno-lint-ignore-file no-explicit-any
// Run: deno test supabase/functions/_shared/copilot-ai.test.ts
import { makeAi } from './copilot-ai.ts'
import { eq, ok } from './copilot-fakes.test-helpers.ts'

type Call = { url: string; body: any; auth: string | null }
function fakeFetch(responses: Array<{ status: number; body: unknown } | 'hang'>) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get('Authorization') })
    const r = responses.shift()!
    if (r === 'hang') {
      return await new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    }
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
  return { f, calls }
}

const SCHEMA = { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false }

Deno.test('chatJson: strict JSON schema, low reasoning, usage and parsed reply', async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: '{"reply":"Hello sir"}' } }], usage: { prompt_tokens: 120, completion_tokens: 30, completion_tokens_details: { reasoning_tokens: 12 } } } }])
  const r = await makeAi('KEY', f).chatJson('openai/gpt-6-astra', 'sys', 'usr', SCHEMA)
  ok(r.ok); eq(r.data, { reply: 'Hello sir' }); eq(r.usage, { input: 120, output: 30, reasoning: 12, estimated: false })
  eq(calls[0].url, 'https://ai.gateway.lovable.dev/v1/chat/completions'); eq(calls[0].auth, 'Bearer KEY')
  eq(calls[0].body.reasoning_effort, 'low'); eq(calls[0].body.response_format.json_schema.strict, true)
  eq(calls[0].body.messages.map((m: any) => m.role), ['system', 'user'])
  ok(!('max_tokens' in calls[0].body), 'no token limit field (reasoning models reject it)')
})

Deno.test('chatJson: a 400 is retried once without reasoning_effort; fenced JSON is accepted', async () => {
  const { f, calls } = fakeFetch([
    { status: 400, body: { error: { message: 'Unsupported parameter' } } },
    { status: 200, body: { choices: [{ message: { content: '```json\n{"reply":"Ok"}\n```' } }] } },
  ])
  const r = await makeAi('KEY', f).chatJson('google/gemini-4-argon', 's', 'u', SCHEMA)
  ok(r.ok); eq(r.data.reply, 'Ok'); eq(calls.length, 2); ok(!('reasoning_effort' in calls[1].body))
  eq(r.usage.estimated, true, 'usage estimated when the gateway gives none')
})

Deno.test('chatJson: errors, unreadable output and timeouts come back as not ok', async () => {
  const busy = await makeAi('K', fakeFetch([{ status: 429, body: { error: { message: 'Rate limited' } } }]).f).chatJson('m', 's', 'u', SCHEMA)
  eq([busy.ok, busy.status, busy.error], [false, 429, 'Rate limited'])
  const junk = await makeAi('K', fakeFetch([{ status: 200, body: { choices: [{ message: { content: 'not json' } }] } }]).f).chatJson('m', 's', 'u', SCHEMA)
  eq([junk.ok, junk.error], [false, 'unreadable'])
  const slow = await makeAi('K', fakeFetch(['hang']).f).chatJson('m', 's', 'u', SCHEMA, { timeoutMs: 30 })
  eq([slow.ok, slow.error], [false, 'timeout'])
})

Deno.test('embed: one call for several texts; wrong sizes rejected', async () => {
  const v = new Array(1536).fill(0.1)
  const { f, calls } = fakeFetch([{ status: 200, body: { data: [{ embedding: v }, { embedding: v }], usage: { prompt_tokens: 9 } } }])
  const r = await makeAi('K', f).embed(['a', 'b'], 'openai/text-embedding-3-small')
  eq(r.vectors?.length, 2); eq(r.usage.input, 9); eq(calls[0].body, { model: 'openai/text-embedding-3-small', input: ['a', 'b'] })
  const bad = await makeAi('K', fakeFetch([{ status: 200, body: { data: [{ embedding: [1, 2] }] } }]).f).embed(['a'], 'm')
  eq([bad.vectors, bad.error], [null, 'bad_embedding'])
  const down = await makeAi('K', fakeFetch([{ status: 503, body: 'upstream down' }]).f).embed(['a'], 'm')
  eq(down.vectors, null); ok(down.usage.estimated)
})

Deno.test('embed: vectors follow the input order even when the gateway returns them out of order', async () => {
  const a = new Array(1536).fill(0.1), b = new Array(1536).fill(0.2), c = new Array(1536).fill(0.3)
  const { f } = fakeFetch([{ status: 200, body: { data: [{ index: 2, embedding: c }, { index: 0, embedding: a }, { index: 1, embedding: b }] } }])
  const r = await makeAi('K', f).embed(['x', 'y', 'z'], 'm')
  eq(r.vectors?.map((v) => v[0]), [0.1, 0.2, 0.3])
})
