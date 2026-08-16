import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useThemeMode } from "@/contexts/ThemeContext";

/**
 * Compact header affordance that switches between the light and dark ERP themes.
 * Matches the surrounding header icon buttons in size, border and hover treatment.
 */
export function ThemeModeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useThemeMode();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          aria-label={label}
          className={`p-2 border rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary border-border ${className}`}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
