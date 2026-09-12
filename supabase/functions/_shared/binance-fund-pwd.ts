// Fund-password release helpers (Binance C2C `authType: "FUND_PWD"`).
//
// Flow, per the official SAPI doc:
//   1. GET  /sapi/v1/c2c/cryptography/rsa-public-key   -> RSA public key
//   2. encrypt the plaintext fund password with RSA-OAEP / SHA-256, Base64
//   3. POST /sapi/v1/c2c/orderMatch/releaseCoin        -> authType FUND_PWD, code=<encrypted>
//
// The plaintext password is a server-side secret. It is never returned to a
// client and never logged.

/** Uniform, information-free refusal. Never reveal bands, amounts or reasons. */
export const FUND_PWD_NOT_AVAILABLE = {
  code: "FUND_PWD_NOT_AVAILABLE",
  message: "Fund password release is not available for this order.",
} as const;

/** Secret name for an account's fund password, keyed like the API secrets. */
export function fundPasswordForSuffix(suffix: string): string {
  return Deno.env.get(`BINANCE_FUND_PASSWORD${suffix}`) ?? "";
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** RSA/ECB/OAEPWithSHA-256AndMGF1Padding equivalent, Base64 output. */
export async function encryptFundPassword(publicKeyPem: string, plaintext: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "spki",
    pemToDer(publicKeyPem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    key,
    new TextEncoder().encode(plaintext),
  );
  const bytes = new Uint8Array(encrypted);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Fetch the C2C RSA public key through the proxy. Returns null when unavailable. */
export async function fetchC2CRsaPublicKey(
  proxyUrl: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const url = `${proxyUrl}/api/sapi/v1/c2c/cryptography/rsa-public-key`;
  const response = await fetch(url, { method: "GET", headers });
  const text = await response.text();
  if (!response.ok) {
    console.error("rsa-public-key failed:", response.status, text.substring(0, 300));
    return null;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const candidate =
    (typeof parsed?.data === "string" && parsed.data) ||
    (typeof parsed?.data?.publicKey === "string" && parsed.data.publicKey) ||
    (typeof parsed?.publicKey === "string" && parsed.publicKey) ||
    null;
  if (!candidate) {
    console.error("rsa-public-key response had no key field:", text.substring(0, 300));
    return null;
  }
  const trimmed = candidate.trim();
  return trimmed.includes("BEGIN")
    ? trimmed
    : `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`;
}

export interface SmallSalesBand {
  min: number;
  max: number;
}

/**
 * Authoritative, server-side eligibility gate for fund-password release.
 * Everything must be proven: SELL side, finite positive total, configured band,
 * price inside the band (inclusive). Anything unknown => false.
 */
export function isFundPwdEligible(
  tradeType: unknown,
  totalPrice: unknown,
  band: SmallSalesBand | null,
): boolean {
  if (!band) return false;
  const side = String(tradeType ?? "").trim().toUpperCase();
  if (side !== "SELL" && side !== "1") return false;
  const price = typeof totalPrice === "number" ? totalPrice : parseFloat(String(totalPrice ?? ""));
  if (!Number.isFinite(price) || price <= 0) return false;
  if (!Number.isFinite(band.min) || !Number.isFinite(band.max) || band.max <= 0 || band.max < band.min) return false;
  return price >= band.min && price <= band.max;
}
