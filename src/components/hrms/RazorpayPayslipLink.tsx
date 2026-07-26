import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

/**
 * R7 · PDF honesty — RazorpayX API does not expose payslip PDF binaries.
 * We render a deep-link into the RazorpayX dashboard instead of a fake
 * "Download PDF" button. This is the canonical way to fetch payslip PDFs.
 */
export function RazorpayPayslipLink({
  razorpayPayslipId,
  label = "View PDF on RazorpayX",
  size = "sm",
}: {
  razorpayPayslipId?: string | number | null;
  label?: string;
  size?: "sm" | "default";
}) {
  const url = razorpayPayslipId
    ? `https://x.razorpay.com/payroll/payslips/${razorpayPayslipId}`
    : `https://x.razorpay.com/payroll/payslips`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size={size} asChild className="gap-1.5">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              {label}
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <div className="flex gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              RazorpayX API does not expose payslip PDFs. Opens the payslip on the
              RazorpayX dashboard where the PDF can be downloaded.
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
