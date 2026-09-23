// Shared guards against quoted-printable artefacts in outgoing mail.
//
// denomailer 1.6.0 encodes bodies as quoted-printable. Any space or tab that
// ends up at the end of a physical line is emitted as a literal "=20", and
// many mail clients render that as visible text (e.g. the "=20" seen at the
// bottom of HR bulk mails). Normalising line endings and stripping trailing
// whitespace before handing content to the mailer removes the cause.

/** Normalise HTML before sending: no CRLF, no trailing spaces, no blank-line runs. */
export function tidyMailHtml(s: string): string {
  if (!s) return s;
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+(?=\n)/g, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+$/, "")
    .trim();
}

/** Normalise a plain-text alternative: keep blank lines, drop trailing spaces. */
export function tidyMailText(s: string): string {
  if (!s) return s;
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+(?=\n)/g, "")
    .replace(/[ \t]+$/, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Header safety.
//
// denomailer 1.6.0 encodes any header value that contains a non-ASCII character
// as a single RFC 2047 encoded-word, and its quoted-printable encoder injects a
// soft line break ("=\r\n") every 74 characters. Inside a header that is an
// unfolded continuation line, so the receiving MTA/client treats everything
// after the break as the message body: the recipient sees the tail of the
// subject followed by the raw MIME source ("Content-Type: multipart/mixed;
// boundary=attachment100", quoted-printable "=" artefacts and all).
//
// Keeping header values strictly ASCII avoids the encoded-word entirely, so
// every outgoing header stays on one legal line.
/** Transliterate to ASCII, collapse whitespace and drop CR/LF from a subject. */
export function tidyMailSubject(s: string, max = 150): string {
  if (!s) return "";
  return s
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2007\u202F\u2009]/g, " ")
    .replace(/\u20B9/g, "Rs.")
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Same guard for the display name of a From/Reply-To address. */
export function tidyMailAddress(s: string): string {
  return tidyMailSubject(s, 78).replace(/[<>]/g, "");
}

// Attachment file names travel in the Content-Disposition / Content-Type headers,
// so a non-ASCII character there hits exactly the same encoded-word folding bug as
// a subject does: the header breaks mid-way and the MIME source leaks into the body.
/** ASCII-safe attachment file name (keeps the extension, no spaces or quotes). */
export function tidyMailFilename(s: string, fallback = "attachment"): string {
  const raw = tidyMailSubject(String(s || ""), 160);
  const dot = raw.lastIndexOf(".");
  const stem = (dot > 0 ? raw.slice(0, dot) : raw).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  const ext = (dot > 0 ? raw.slice(dot + 1) : "").replace(/[^A-Za-z0-9]+/g, "").slice(0, 8);
  const name = (stem || fallback).slice(0, 100);
  return ext ? `${name}.${ext}` : name;
}
