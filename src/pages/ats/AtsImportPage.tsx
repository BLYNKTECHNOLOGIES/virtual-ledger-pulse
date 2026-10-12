import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, FileUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useFileDropzone } from "@/hooks/useFileDropzone";
import { SectionCard } from "@/components/ats/AtsBits";
import { FileImportWizard } from "@/components/ats/FileImportWizard";
import { ImportHistory } from "@/components/ats/ImportHistory";
import { importKeys } from "@/lib/ats/imports";

export default function AtsImportPage() {
  const [searchParams] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { isDragActive, dropzoneProps } = useFileDropzone({ onFiles: (f) => f[0] && setFile(f[0]), multiple: false });

  if (file) {
    return (
      <FileImportWizard
        file={file}
        presetJobId={searchParams.get("job")}
        onClose={() => { setFile(null); qc.invalidateQueries({ queryKey: importKeys.all }); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5">
          <Link to="/hrms/ats/candidates"><ArrowLeft className="h-4 w-4" /> Candidates</Link>
        </Button>
        <h2 className="text-lg font-semibold text-foreground">Import candidates</h2>
        <p className="text-sm text-muted-foreground">
          Bring in applicants from a job portal (Indeed, Naukri, Apna, WorkIndia, LinkedIn and others) with the Excel or CSV file you download there. Nobody is emailed.
        </p>
      </div>

      <SectionCard title="Import a job-portal file">
        <div
          {...dropzoneProps}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors",
            isDragActive && "border-primary bg-primary/5",
          )}
        >
          <FileUp className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-foreground">Drop the file here</p>
          <Button variant="outline" onClick={() => inputRef.current?.click()}>Choose file</Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setFile(f); }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Excel (.xlsx, .xls) or CSV · up to 2,000 rows and 10 MB</p>
        <Collapsible className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 gap-1.5">How to get the file <ChevronDown className="h-4 w-4" /></Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>In the job portal, open the job's applicants (or responses) list.</li>
              <li>Select the applicants you want, or all of them, and use Download or Export (Excel or CSV).</li>
              <li>Drop the file here. You'll check the columns and see who is new before anything is imported.</li>
            </ol>
          </CollapsibleContent>
        </Collapsible>
      </SectionCard>

      <ImportHistory />
    </div>
  );
}
