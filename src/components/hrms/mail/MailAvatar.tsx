import { avatarTone, initialsOf } from "./mailUtils";
import { cn } from "@/lib/utils";

export function MailAvatar({
  label,
  seed,
  size = "md",
  className,
}: {
  label: string;
  seed?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 rounded-full flex items-center justify-center font-semibold",
        size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs",
        avatarTone(seed || label),
        className,
      )}
    >
      {initialsOf(label)}
    </span>
  );
}

export default MailAvatar;
