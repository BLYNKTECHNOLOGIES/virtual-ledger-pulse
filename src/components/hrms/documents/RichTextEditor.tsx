import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter,
  AlignRight, Heading1, Heading2, Table as TableIcon, Minus, Braces,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  value: string;
  onChange: (html: string) => void;
  onInsertVariable?: () => void;
}

/**
 * Lightweight A4 letter editor. Content is stored as canonical HTML; the page
 * frame mirrors A4 width with print-safe margins so what HR sees matches output.
 */
export function RichTextEditor({ value, onChange, onInsertVariable }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "<p></p>";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange(ref.current?.innerHTML || "");
  };

  const insertTable = () => {
    const html =
      '<table style="width:100%;border-collapse:collapse;margin:8px 0"><tbody>' +
      Array.from({ length: 3 })
        .map(
          () =>
            "<tr>" +
            Array.from({ length: 2 })
              .map(() => '<td style="border:1px solid #999;padding:6px">&nbsp;</td>')
              .join("") +
            "</tr>"
        )
        .join("") +
      "</tbody></table><p></p>";
    exec("insertHTML", html);
  };

  const tools: { icon: any; label: string; run: () => void }[] = [
    { icon: Bold, label: "Bold", run: () => exec("bold") },
    { icon: Italic, label: "Italic", run: () => exec("italic") },
    { icon: Underline, label: "Underline", run: () => exec("underline") },
    { icon: Heading1, label: "Heading 1", run: () => exec("formatBlock", "<h1>") },
    { icon: Heading2, label: "Heading 2", run: () => exec("formatBlock", "<h2>") },
    { icon: List, label: "Bulleted list", run: () => exec("insertUnorderedList") },
    { icon: ListOrdered, label: "Numbered list", run: () => exec("insertOrderedList") },
    { icon: AlignLeft, label: "Align left", run: () => exec("justifyLeft") },
    { icon: AlignCenter, label: "Align centre", run: () => exec("justifyCenter") },
    { icon: AlignRight, label: "Align right", run: () => exec("justifyRight") },
    { icon: TableIcon, label: "Insert table", run: insertTable },
    { icon: Minus, label: "Horizontal rule", run: () => exec("insertHorizontalRule") },
  ];

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-1.5">
          {tools.map(({ icon: Icon, label, run }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={run}>
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
          {onInsertVariable && (
            <Button type="button" size="sm" variant="outline" className="h-8 ml-auto" onClick={onInsertVariable}>
              <Braces className="h-3.5 w-3.5 mr-1" /> Insert variable
            </Button>
          )}
        </div>
      </TooltipProvider>

      <div className="bg-muted/30 p-4 overflow-auto max-h-[55vh]">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={() => onChange(ref.current?.innerHTML || "")}
          className="doc-a4-page mx-auto bg-background text-foreground shadow-sm outline-none"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "25mm 20mm",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "11pt",
            lineHeight: 1.55,
          }}
        />
      </div>
    </div>
  );
}

export default RichTextEditor;
