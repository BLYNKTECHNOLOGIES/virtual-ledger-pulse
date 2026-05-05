import { Bot, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

export function HelpAssistantFab() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = usePermissions();
  const [hover, setHover] = useState(false);

  // Hide on the assistant pages themselves
  if (location.pathname.startsWith("/help-assistant")) return null;
  // Permission gate
  if (!hasPermission("help_assistant_view") && !hasPermission("help_assistant_manage")) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/help-assistant")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Open AI Help Assistant"
      className={cn(
        "fixed z-50 bottom-20 right-5 md:bottom-6 md:right-6",
        "group flex items-center gap-2 pl-3 pr-4 py-3 rounded-full",
        "bg-gradient-to-br from-fuchsia-500 via-violet-600 to-indigo-600",
        "text-white shadow-xl shadow-violet-500/40",
        "ring-2 ring-white/40 dark:ring-white/10",
        "transition-all duration-300 hover:scale-105 active:scale-95"
      )}
    >
      {/* Pulse halo */}
      <span className="pointer-events-none absolute inset-0 rounded-full bg-violet-400/40 animate-ping opacity-60" />
      {/* Bot avatar */}
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur">
        <Bot className={cn("h-5 w-5 transition-transform duration-500", hover && "rotate-[-8deg] scale-110")} />
        <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-yellow-300 drop-shadow animate-pulse" />
      </span>
      <span className="relative text-sm font-semibold tracking-tight whitespace-nowrap">
        Ask AI
      </span>
    </button>
  );
}
