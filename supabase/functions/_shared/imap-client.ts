// Minimal IMAP-over-TLS client (fetch-only) for the HR mailbox inbox.
// Uses Deno TCP+TLS directly — no third-party IMAP dependency.

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface RawMessage {
  uid: number;
  raw: string;
}

class ImapConnection {
  private conn!: Deno.TlsConn;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private buffer = "";
  private tagCounter = 0;

  async connect(cfg: ImapConfig) {
    this.conn = await Deno.connectTls({ hostname: cfg.host, port: cfg.port });
    await this.readUntil(/^\* (OK|PREAUTH)/m);
    await this.command(`LOGIN "${cfg.user.replace(/"/g, '\\"')}" "${cfg.pass.replace(/"/g, '\\"')}"`);
  }

  private async readChunk(): Promise<boolean> {
    const buf = new Uint8Array(65536);
    const n = await this.conn.read(buf);
    if (n === null) return false;
    this.buffer += this.decoder.decode(buf.subarray(0, n));
    return true;
  }

  private async readUntil(pattern: RegExp): Promise<string> {
    const deadline = Date.now() + 45_000;
    while (!pattern.test(this.buffer)) {
      if (Date.now() > deadline) throw new Error("IMAP read timeout");
      if (!(await this.readChunk())) throw new Error("IMAP connection closed");
    }
    const out = this.buffer;
    this.buffer = "";
    return out;
  }

  async command(cmd: string): Promise<string> {
    const tag = `A${String(++this.tagCounter).padStart(4, "0")}`;
    await this.conn.write(this.encoder.encode(`${tag} ${cmd}\r\n`));
    const re = new RegExp(`^${tag} (OK|NO|BAD)(.*)$`, "m");
    const res = await this.readUntil(re);
    const m = res.match(re);
    if (m && m[1] !== "OK") throw new Error(`IMAP ${cmd.split(" ")[0]} failed: ${m[2]?.trim()}`);
    return res;
  }

  async close() {
    try { await this.command("LOGOUT"); } catch { /* ignore */ }
    try { this.conn.close(); } catch { /* ignore */ }
  }
}

/** Fetch messages with UID greater than sinceUid (max `limit`). */
export async function fetchMessages(cfg: ImapConfig, sinceUid: number, limit = 30): Promise<RawMessage[]> {
  const c = new ImapConnection();
  await c.connect(cfg);
  try {
    await c.command("SELECT INBOX");
    const searchRes = await c.command(`UID SEARCH UID ${sinceUid + 1}:*`);
    const line = searchRes.split(/\r?\n/).find((l) => l.startsWith("* SEARCH")) || "";
    const uids = line
      .replace("* SEARCH", "")
      .trim()
      .split(/\s+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > sinceUid)
      .sort((a, b) => a - b)
      .slice(-limit);

    const out: RawMessage[] = [];
    for (const uid of uids) {
      try {
        const res = await c.command(`UID FETCH ${uid} (BODY.PEEK[])`);
        const start = res.indexOf("}\r\n");
        if (start === -1) continue;
        const raw = res.slice(start + 3);
        out.push({ uid, raw });
      } catch { /* skip individual message failures */ }
    }
    return out;
  } finally {
    await c.close();
  }
}

// ---------- Very small RFC822 parser -------------------------------------

function decodeMimeWord(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _cs, enc, txt) => {
    try {
      if (enc.toUpperCase() === "B") return atob(txt);
      return txt.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) =>
        String.fromCharCode(parseInt(h, 16)));
    } catch { return txt; }
  });
}

function decodeQuotedPrintable(s: string): string {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

export interface ParsedMessage {
  fromAddress: string | null;
  fromName: string | null;
  to: string[];
  subject: string | null;
  date: string | null;
  messageId: string | null;
  html: string | null;
  text: string | null;
  hasAttachments: boolean;
}

export function parseMessage(raw: string): ParsedMessage {
  const splitIdx = raw.search(/\r?\n\r?\n/);
  const headerBlock = splitIdx === -1 ? raw : raw.slice(0, splitIdx);
  const body = splitIdx === -1 ? "" : raw.slice(splitIdx).replace(/^\r?\n\r?\n/, "");

  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }

  const fromRaw = decodeMimeWord(headers["from"] || "");
  const addrMatch = fromRaw.match(/<([^>]+)>/);
  const fromAddress = (addrMatch ? addrMatch[1] : fromRaw.split(/\s+/).pop() || "").trim() || null;
  const fromName = addrMatch ? fromRaw.slice(0, addrMatch.index).replace(/"/g, "").trim() || null : null;

  const to = decodeMimeWord(headers["to"] || "")
    .split(",")
    .map((p) => (p.match(/<([^>]+)>/)?.[1] || p).trim())
    .filter(Boolean);

  const contentType = headers["content-type"] || "";
  const encoding = (headers["content-transfer-encoding"] || "").toLowerCase();
  let html: string | null = null;
  let text: string | null = null;
  let hasAttachments = false;

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (boundaryMatch) {
    const parts = body.split(new RegExp(`--${boundaryMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    for (const part of parts) {
      const pSplit = part.search(/\r?\n\r?\n/);
      if (pSplit === -1) continue;
      const pHead = part.slice(0, pSplit).toLowerCase();
      let pBody = part.slice(pSplit).replace(/^\r?\n\r?\n/, "");
      if (pHead.includes("quoted-printable")) pBody = decodeQuotedPrintable(pBody);
      else if (pHead.includes("base64")) { try { pBody = atob(pBody.replace(/\s+/g, "")); } catch { /* ignore */ } }
      if (pHead.includes("attachment") || pHead.includes("filename=")) { hasAttachments = true; continue; }
      if (pHead.includes("text/html") && !html) html = pBody;
      else if (pHead.includes("text/plain") && !text) text = pBody;
    }
  } else {
    let decoded = body;
    if (encoding === "quoted-printable") decoded = decodeQuotedPrintable(body);
    else if (encoding === "base64") { try { decoded = atob(body.replace(/\s+/g, "")); } catch { /* ignore */ } }
    if (contentType.toLowerCase().includes("text/html")) html = decoded;
    else text = decoded;
  }

  let date: string | null = null;
  if (headers["date"]) {
    const d = new Date(headers["date"]);
    if (!isNaN(d.getTime())) date = d.toISOString();
  }

  return {
    fromAddress,
    fromName,
    to,
    subject: headers["subject"] ? decodeMimeWord(headers["subject"]) : null,
    date,
    messageId: headers["message-id"] || null,
    html,
    text,
    hasAttachments,
  };
}
