import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileCheck } from "lucide-react";

interface Stage4Props {
  data: any;
  onComplete: (data: any) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

export function Stage4OfferPolicy({ data, onComplete, onBack, readOnly }: Stage4Props) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheck className="h-4 w-4" /> Stage 4: Offer & Policy Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border-2 border-dashed p-8 text-center bg-muted/20">
          <FileCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Coming Soon</p>
          <p className="text-sm text-muted-foreground mt-1">
            Offer letter, employment agreement, and policy acknowledgment templates will be available here.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            You can skip this stage for now.
          </p>
        </div>

        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onBack}>← Back</Button>
            <Button onClick={() => onComplete({ offer_policy_status: "skipped" })}>
              Skip & Continue →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
