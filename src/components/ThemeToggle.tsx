import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Moon, Sun, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ThemeToggle() {
  const [selectedTheme, setSelectedTheme] = useState("light");
  
  const themes = [
    { id: "light", name: "Frappe Light", preview: "bg-white border-gray-300" },
    { id: "dark", name: "Timeless Night", preview: "bg-gray-900 border-gray-700" },
    { id: "auto", name: "Automatic", preview: "bg-gradient-to-r from-white to-gray-900" }
  ];

  const handleThemeSelect = (themeId: string) => {
    setSelectedTheme(themeId);
    if (themeId === "dark") {
      document.documentElement.classList.add("dark");
    } else if (themeId === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="p-2 border-2 rounded-lg text-gray-600 hover:bg-blue-50 hover:text-blue-700 border-gray-200"
          aria-label="Toggle theme"
        >
          {selectedTheme === "dark" ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Switch Theme</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-3 gap-4 mt-4">
          {themes.map((theme) => (
            <Card 
              key={theme.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedTheme === theme.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => handleThemeSelect(theme.id)}
            >
              <CardContent className="p-4 text-center">
                <div className={`w-full h-16 rounded-lg mb-3 border-2 ${theme.preview}`}>
                  {selectedTheme === theme.id && (
                    <div className="flex items-center justify-center h-full">
                      <Check className="h-6 w-6 text-green-500" />
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium">{theme.name}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
