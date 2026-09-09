import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  /** Where to go when there is no history to return to. */
  fallbackTo?: string;
  label?: string;
  className?: string;
}

export function BackButton({ fallbackTo = "/dashboard", label = "Back", className }: BackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallbackTo);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={`gap-2 -ml-2 text-muted-foreground hover:text-foreground ${className ?? ""}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
