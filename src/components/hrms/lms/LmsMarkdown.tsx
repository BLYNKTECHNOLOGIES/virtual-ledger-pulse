import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * Module text (master text, booklet copy) written in Markdown. Raw HTML is not
 * rendered. Styled here because the Tailwind typography plugin isn't enabled.
 */
const components: Components = {
  h1: ({ node, ...p }) => <h1 className="mb-3 mt-6 text-2xl font-bold tracking-tight first:mt-0" {...p} />,
  h2: ({ node, ...p }) => <h2 className="mb-2 mt-5 text-xl font-semibold tracking-tight first:mt-0" {...p} />,
  h3: ({ node, ...p }) => <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0" {...p} />,
  h4: ({ node, ...p }) => <h4 className="mb-1.5 mt-3 text-base font-semibold first:mt-0" {...p} />,
  p: ({ node, ...p }) => <p className="my-2 leading-relaxed" {...p} />,
  ul: ({ node, ...p }) => <ul className="my-2 list-disc space-y-1 pl-6" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-2 list-decimal space-y-1 pl-6" {...p} />,
  li: ({ node, ...p }) => <li className="leading-relaxed" {...p} />,
  blockquote: ({ node, ...p }) => <blockquote className="my-3 border-l-4 border-primary/40 bg-muted/40 py-1 pl-4 italic" {...p} />,
  code: ({ node, className, ...p }) => <code className={cn("t-mono rounded bg-muted px-1 py-0.5 text-[0.9em]", className)} {...p} />,
  pre: ({ node, ...p }) => <pre className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-sm" {...p} />,
  hr: ({ node, ...p }) => <hr className="my-5 border-border" {...p} />,
  a: ({ node, ...p }) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...p} />,
  img: ({ node, alt, ...p }) => <img className="my-3 max-h-[60vh] max-w-full rounded-lg border border-border" alt={alt ?? ""} loading="lazy" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold" {...p} />,
};

export function LmsMarkdown({ text, className, large }: { text: string | null | undefined; className?: string; large?: boolean }) {
  if (!text?.trim()) return null;
  return (
    <div className={cn("break-words text-foreground", large ? "text-lg" : "text-sm", className)}>
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}
