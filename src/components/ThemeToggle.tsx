import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="p-2 border-2 rounded-lg text-gray-600 hover:bg-blue-50 hover:text-blue-700 border-gray-200 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-100"
      onClick={() => setIsDark(!isDark)}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
