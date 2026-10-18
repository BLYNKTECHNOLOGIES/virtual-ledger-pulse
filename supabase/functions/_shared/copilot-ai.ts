// deno-lint-ignore-file no-explicit-any
// Copilot v2: calls to the Lovable AI gateway (chat completions with a strict JSON schema, and embeddings).
// fetch is injectable for tests. Nothing here logs message content.
import { readUsage, type Usage } from './copilot-playbook.ts'

const GATEWAY = 'https://ai.gateway.lovable.dev/v1'

export interface ChatResult {
  ok: boolean
  data?: any
  text?: string
  usage: Usage
  latencyMs: number
  status?: number
  error?: string
}
export interface EmbedResult { vectors: number[][] | null; usage: Usage; latencyMs: number; error?: string }

export interface ChatOpts {
  timeoutMs?: number
  /** How much the model may think: 'low' (default) or 'none' (rewording: faster and cheaper). */
  effort?: 'low' | 'none'
}

export interface Ai {
  chatJson(model: string, system: string, user: string, schema: Record<string, unknown>, opts?: ChatOpts): Promise<ChatResult>
  embed(texts: string[], model: string): Promise<EmbedResult>
}

/**
 * Reasoning-effort levels each model refused (a 400 that went away at the next level). Kept for the life of the
 * function instance, so later calls skip straight to a level the model takes.
 */
const refusedEfforts = new Map<string, Set<string>>()

export function makeAi(apiKey: string, fetchImpl: typeof fetch = fetch, refused: Map<string, Set<string>> = refusedEfforts): Ai {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

  async function post(path: string, body: unknown, timeoutMs: number): Promise<{ status: number; json: any; error?: string }> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const resp = await fetchImpl(`${GATEWAY}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal })
      const text = await resp.text()
      let json: any = null
      try { json = JSON.parse(text) } catch { /* not JSON */ }
      return { status: resp.status, json, error: resp.ok ? undefined : (json?.error?.message ?? text.slice(0, 200)) }
    } catch (e) {
      return { status: 0, json: null, error: (e as Error)?.name === 'AbortError' ? 'timeout' : String((e as Error)?.message ?? e).slice(0, 200) }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async chatJson(model, system, user, schema, opts = {}) {
      const t0 = Date.now()
      const base: Record<string, unknown> = {
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name: 'copilot_output', strict: true, schema } },
      }
      // Low reasoning effort keeps latency and cost down ('none' for rewording). A model that refuses a level (400) is
      // asked again at the next one, and finally without it. Levels are remembered as refused only when a later try
      // answered: a 400 followed by a timeout or an outage proves nothing about the level.
      const wanted = opts.effort === 'none' ? ['none', 'low'] : ['low']
      const levels: Array<string | null> = [...wanted.filter((l) => !refused.get(model)?.has(l)), null]
      const tried: string[] = []
      let r: { status: number; json: any; error?: string } = { status: 0, json: null, error: 'not sent' }
      for (const level of levels) {
        r = await post('/chat/completions', level ? { ...base, reasoning_effort: level } : base, opts.timeoutMs ?? 30_000)
        if (r.status !== 400) break
        if (level) tried.push(level)
      }
      if (r.status === 200 && tried.length) refused.set(model, new Set([...(refused.get(model) ?? []), ...tried]))
      const latencyMs = Date.now() - t0
      if (r.status !== 200) {
        return { ok: false, usage: readUsage(null, system.length + user.length, 0), latencyMs, status: r.status, error: r.error ?? `status ${r.status}` }
      }
      const text = String(r.json?.choices?.[0]?.message?.content ?? '')
      const usage = readUsage(r.json, system.length + user.length, text.length)
      let data: any = null
      try { data = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { /* handled below */ }
      if (!data || typeof data !== 'object') return { ok: false, usage, latencyMs, status: 200, text, error: 'unreadable' }
      return { ok: true, data, text, usage, latencyMs, status: 200 }
    },

    async embed(texts, model) {
      const t0 = Date.now()
      const input = texts.map((t) => t.slice(0, 4000))
      const r = await post('/embeddings', { model, input }, 15_000)
      const latencyMs = Date.now() - t0
      const chars = input.reduce((n, t) => n + t.length, 0)
      if (r.status !== 200) return { vectors: null, usage: { input: Math.ceil(chars / 3.5), output: 0, reasoning: 0, estimated: true }, latencyMs, error: r.error }
      // Results carry an index; order by it so each vector lines up with its input.
      const rows = [...(r.json?.data ?? [])].sort((a: any, b: any) => Number(a?.index ?? 0) - Number(b?.index ?? 0))
      const vectors = rows.map((d: any) => d?.embedding)
      const ok = vectors.length === input.length && vectors.every((v: any) => Array.isArray(v) && v.length === 1536)
      const tokens = Number(r.json?.usage?.prompt_tokens ?? r.json?.usage?.total_tokens ?? NaN)
      const usage: Usage = Number.isFinite(tokens)
        ? { input: tokens, output: 0, reasoning: 0, estimated: false }
        : { input: Math.ceil(chars / 3.5), output: 0, reasoning: 0, estimated: true }
      return ok ? { vectors, usage, latencyMs } : { vectors: null, usage, latencyMs, error: 'bad_embedding' }
    },
  }
}
