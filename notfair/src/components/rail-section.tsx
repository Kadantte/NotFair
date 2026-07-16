"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible goal-rail section: the uppercase heading doubles as the
 * toggle. Collapsing hides (not unmounts) the body so client state inside
 * — e.g. the checks list's loaded pages — survives the fold.
 */
export function RailSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="mb-2 flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent p-0 text-left"
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--notfair-ink-4))]">
          {title}
          {count !== undefined && (
            <span className="ml-1 font-normal tabular-nums">({count})</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-[hsl(var(--notfair-ink-4))] transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      <div hidden={!open}>{children}</div>
    </section>
  );
}
