import { Moon, Sun } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "redhero-theme";
const ThemeContext = createContext(null);

function readInitialTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selected theme still works when storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    function syncTheme(event) {
      if (event.key !== THEME_STORAGE_KEY) return;
      setTheme(event.newValue === "dark" ? "dark" : "light");
    }
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

export function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const nextTheme = dark ? "light" : "dark";

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={dark}
      title={`Switch to ${nextTheme} mode`}
      onClick={toggleTheme}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <Sun size={15} />
        <Moon size={15} />
        <i />
      </span>
      <span className="theme-toggle-label">{dark ? "Dark" : "Light"}</span>
    </button>
  );
}
