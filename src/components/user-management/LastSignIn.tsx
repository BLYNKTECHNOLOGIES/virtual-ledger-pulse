import { fmtAgo, fmtDay, fmtTime } from "@/components/profile/format";

export function LastSignIn({ value }: { value?: string | null }) {
  if (!value) return <span>Never</span>;
  return <span title={`${fmtDay(value)}, ${fmtTime(value)} IST`}>{fmtAgo(value)}</span>;
}