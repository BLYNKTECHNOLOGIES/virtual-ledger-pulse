import { Lock, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  title: string;
  description: string;
  features: string[];
}

export default function TerminalComingSoon({ title, description, features }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted/20 border border-border flex items-center justify-center mb-6">
        <Lock className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <Badge variant="outline" className="mb-4 text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
        <Clock className="h-3 w-3 mr-1" /> Coming Soon
      </Badge>
      <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      <div className="grid gap-2 max-w-sm w-full">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/10 border border-border rounded-lg px-4 py-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}
