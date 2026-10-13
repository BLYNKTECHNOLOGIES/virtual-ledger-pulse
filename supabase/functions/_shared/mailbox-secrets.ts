// Reads mailbox sign-in secrets by the names stored on public.hr_mailboxes.
// Only names of the form HR_* are ever read, and the readers only connect to an allowed IMAP host,
// so a changed hr_mailboxes row can never make a function hand a secret to another server.
const SECRET_NAME_RE = /^HR_[A-Z0-9_]{1,40}$/
const IMAP_HOSTS = new Set(['imap.gmail.com'])

/** The secret's value, or undefined when the name is empty or not an HR_* name. */
export function secretByName(name: string | null | undefined): string | undefined {
  const n = String(name ?? '').trim()
  return n && SECRET_NAME_RE.test(n) ? Deno.env.get(n) : undefined
}

/** True only for an IMAP host the HR mail readers may connect to. */
export function imapHostAllowed(host: string | null | undefined): boolean {
  return IMAP_HOSTS.has(String(host ?? '').trim().toLowerCase())
}
