import { useContext } from "react";
import { Moon, Sun } from "lucide-react";
import { ThemeContext } from "../lib/ThemeContext";

export function ThemeToggle() {
  const { isDark, toggleTheme } = useContext(ThemeContext);

  return (
    <button
      onClick={toggleTheme}
      className="fixed top-3 right-3 sm:top-4 sm:right-4 p-2.5 sm:p-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors z-50 active:scale-95"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="w-5 h-5 sm:w-5 sm:h-5 text-yellow-500" />
      ) : (
        <Moon className="w-5 h-5 sm:w-5 sm:h-5 text-slate-700" />
      )}
    </button>
  );
}
