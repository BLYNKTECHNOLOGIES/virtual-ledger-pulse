import { useApplicationAnswers } from "@/lib/ats/imports";
import { SectionCard } from "./AtsBits";

/** Extra columns from the import file, kept on the application. Shown only when there are any. */
export function ImportDetailsCard({ appId }: { appId: string }) {
  const q = useApplicationAnswers(appId);
  const rows = q.data ?? [];
  if (!rows.length) return null;
  return (
    <SectionCard title="From the import file">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
