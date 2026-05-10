import { createContext, useState, useEffect } from "react";

const ThemeContext = createContext();

function getInitialTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    return saved === "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(getInitialTheme());

  useEffect(() => {
    // Apply theme to HTML element and localStorage
    localStorage.setItem("theme", isDark ? "dark" : "light");
    const html = document.documentElement;
    if (isDark) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export { ThemeContext };
