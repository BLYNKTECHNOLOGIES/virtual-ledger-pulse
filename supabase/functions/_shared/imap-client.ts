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
    this.buffer += this.decoder.decode(buf.subarray(0, n), { stream: true });
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

/** Latin-1 string (raw bytes held in a JS string) -> Uint8Array. */
function binaryToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function decodeBytes(bytes: Uint8Array, charset?: string | null): string {
  const cs = (charset || "utf-8").toLowerCase().replace(/^"|"$/g, "");
  try {
    return new TextDecoder(cs, { fatal: false }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return String.fromCharCode(...bytes);
    }
  }
}

function qpToBytes(s: string): Uint8Array {
  const unfolded = s.replace(/=\r?\n/g, "");
  return binaryToBytes(
    unfolded.replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))),
  );
}

function b64ToBytes(s: string): Uint8Array {
  try {
    return binaryToBytes(atob(s.replace(/\s+/g, "")));
  } catch {
    return binaryToBytes(s);
  }
}

/** RFC 2047 encoded-word decoding, charset aware. */
function decodeMimeWord(s: string): string {
  return s
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)(\s+)(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs, enc, txt) => {
      try {
        const bytes = enc.toUpperCase() === "B"
          ? b64ToBytes(txt)
          : qpToBytes(String(txt).replace(/_/g, " "));
        return decodeBytes(bytes, cs);
      } catch {
        return txt;
      }
    });
}

function charsetOf(headerBlock: string): string | null {
  return headerBlock.match(/charset\s*=\s*"?([\w\-]+)"?/i)?.[1] || null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits a multipart body into its parts.
 *
 * Some senders (denomailer among them) declare boundaries that already carry
 * leading dashes, or the declared value differs slightly from the delimiter
 * actually written into the body. When the declared boundary yields a single
 * part we sniff the real delimiter from the body instead, otherwise the whole
 * multipart payload (headers, HTML source and all) leaks into the text part.
 */
function splitMimeParts(body: string, declared: string): string[] {
  const trimmed = declared.trim().replace(/^"|"$/g, "");
  const candidates = [trimmed, trimmed.replace(/^-+/, "")].filter((v, i, a) => v && a.indexOf(v) === i);

  for (const cand of candidates) {
    const parts = body.split(new RegExp(`(?:^|\\r?\\n)--${esc(cand)}(?:--)?[ \\t]*(?=\\r?\\n)`));
    if (parts.length > 1) return parts;
  }

  // Fallback: use the first delimiter-looking line present in the body.
  const sniffed = body.match(/(?:^|\r?\n)(--[^\s]+)[ \t]*(?=\r?\n)/)?.[1];
  if (sniffed) {
    const base = sniffed.replace(/--$/, "");
    const parts = body.split(new RegExp(`(?:^|\\r?\\n)${esc(base)}(?:--)?[ \\t]*(?=\\r?\\n)`));
    if (parts.length > 1) return parts;
  }

  return [body];
}


function decodePart(head: string, rawBody: string): string {
  const lower = head.toLowerCase();
  const cs = charsetOf(head);
  if (lower.includes("quoted-printable")) return decodeBytes(qpToBytes(rawBody), cs);
  if (/content-transfer-encoding\s*:\s*base64/i.test(head)) return decodeBytes(b64ToBytes(rawBody), cs);
  // 7bit/8bit: the transport string is already text-decoded upstream.
  return rawBody;
}

function splitAddresses(v: string): string[] {
  return decodeMimeWord(v || "")
    .split(",")
    .map((p) => (p.match(/<([^>]+)>/)?.[1] || p).trim())
    .filter(Boolean);
}

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface ParsedMessage {
  fromAddress: string | null;
  fromName: string | null;
  to: string[];
  cc: string[];
  replyTo: string | null;
  subject: string | null;
  date: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  html: string | null;
  text: string | null;
  hasAttachments: boolean;
  attachments: ParsedAttachment[];
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

  const to = splitAddresses(headers["to"] || "");
  const cc = splitAddresses(headers["cc"] || "");
  const replyTo = splitAddresses(headers["reply-to"] || "")[0] || null;

  const contentType = headers["content-type"] || "";
  let html: string | null = null;
  let text: string | null = null;
  const attachments: ParsedAttachment[] = [];

  const boundaryMatch = contentType.match(/boundary\s*=\s*"?([^";]+)"?/i);
  if (boundaryMatch) {
    const parts = splitMimeParts(body, boundaryMatch[1]);

    for (const part of parts) {
      const pSplit = part.search(/\r?\n\r?\n/);
      if (pSplit === -1) continue;
      const pHead = part.slice(0, pSplit);
      const lower = pHead.toLowerCase();
      const rawBody = part.slice(pSplit).replace(/^\r?\n\r?\n/, "");

      // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
      const nested = pHead.match(/boundary="?([^";]+)"?/i);
      if (lower.includes("content-type: multipart/") && nested) {
        const inner = parseMessage(`Content-Type: multipart/mixed; boundary="${nested[1]}"\r\n\r\n${rawBody}`);
        if (!html && inner.html) html = inner.html;
        if (!text && inner.text) text = inner.text;
        attachments.push(...inner.attachments);
        continue;
      }

      const filename = pHead.match(/filename\*?=(?:"([^"]+)"|([^\s;]+))/i);
      const isAttachment = lower.includes("content-disposition: attachment") || !!filename;
      if (isAttachment) {
        const bodyLen = rawBody.replace(/\s+/g, "").length;
        const isB64 = /base64/i.test(lower);
        attachments.push({
          filename: decodeMimeWord(filename?.[1] || filename?.[2] || "attachment"),
          contentType: (pHead.match(/content-type:\s*([\w.+\-\/]+)/i)?.[1] || "application/octet-stream").trim(),
          size: isB64 ? Math.floor(bodyLen * 0.75) : bodyLen,
        });
        continue;
      }

      if (lower.includes("text/html") && !html) html = decodePart(pHead, rawBody);
      else if (lower.includes("text/plain") && !text) text = decodePart(pHead, rawBody);
    }
  } else {
    const decoded = decodePart(headerBlock, body);
    if (contentType.toLowerCase().includes("text/html")) html = decoded;
    else text = decoded;
  }

  // Last-resort repair: a mis-split multipart leaves raw MIME inside the text
  // part. Recover the HTML alternative and trim the text back to its own part.
  if (!html && text && /content-type:\s*text\/html/i.test(text)) {
    const idx = text.search(/(?:^|\n)-{2,}[^\s]*\s*\n?content-type:\s*text\/html/i);
    const htmlHeadIdx = text.search(/content-type:\s*text\/html/i);
    if (htmlHeadIdx > -1) {
      const rest = text.slice(htmlHeadIdx);
      const bodyStart = rest.search(/\r?\n\r?\n/);
      if (bodyStart > -1) {
        const pHead = rest.slice(0, bodyStart);
        let raw = rest.slice(bodyStart).replace(/^\r?\n\r?\n/, "");
        raw = raw.replace(/(?:^|\n)--[^\s]*--\s*$/, "");
        html = decodePart(pHead, raw);
        text = text.slice(0, idx > -1 ? idx : htmlHeadIdx).trimEnd();
      }
    }
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
    cc,
    replyTo,
    subject: headers["subject"] ? decodeMimeWord(headers["subject"]) : null,
    date,
    messageId: headers["message-id"] || null,
    inReplyTo: (headers["in-reply-to"] || "").match(/<[^<>]+>/)?.[0] || null,
    references: headers["references"] || null,
    html,
    text,
    hasAttachments: attachments.length > 0,
    attachments,
  };
}

