import { fmtAgo } from "@/components/profile/format";

export function LastSignIn({ value }: { value?: string | null }) {
  if (!value) return <span>Never</span>;
  const exact = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
  return <span title={`${exact} IST`}>{fmtAgo(value)}</span>;
}