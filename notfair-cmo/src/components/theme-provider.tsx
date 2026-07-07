"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * next-themes wrapper. `attribute="class"` toggles the `.dark` class
 * that globals.css keys every token off. Dark is the design's native
 * mode (Codex dark-first); "system" is available from the toggle.
 * `disableTransitionOnChange` avoids a flash of mistimed CSS
 * transitions when every token flips at once.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
