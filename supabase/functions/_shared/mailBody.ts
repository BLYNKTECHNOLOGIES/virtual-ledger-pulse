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
