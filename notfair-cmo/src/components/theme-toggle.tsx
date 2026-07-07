"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Light/dark switch for the sidebar footer. Renders after mount only —
 * next-themes resolves the stored/system theme on the client, so a
 * server-rendered icon would flash the wrong glyph.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="size-6" aria-hidden />;

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid size-6 place-items-center rounded-md text-[hsl(var(--notfair-ink-4))] transition-colors hover:bg-[hsl(var(--notfair-surface-2))] hover:text-[hsl(var(--notfair-ink-2))]"
    >
      {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
    </button>
  );
}
