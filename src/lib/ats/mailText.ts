/**
 * What the server will send as the subject: same replacements as tidyMailSubject in
 * supabase/functions/_shared/mailBody.ts (subjects are kept ASCII). Keep the two in sync.
 */
export function tidySubject(s: string, max = 200): string {
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
