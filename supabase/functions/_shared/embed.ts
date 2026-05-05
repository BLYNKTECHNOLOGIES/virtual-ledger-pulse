// Shared embedding helper for KB features
// Uses Lovable AI Gateway with Google text-embedding-004 (768-dim)

export async function embedText(text: string): Promise<number[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/text-embedding-004",
      input: text.slice(0, 8000),
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Embedding failed [${resp.status}]: ${t}`);
  }
  const data = await resp.json();
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Invalid embedding response");
  return vec;
}

export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
