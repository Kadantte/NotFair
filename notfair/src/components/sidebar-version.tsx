"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type VersionInfo = {
  current: string;
  latest: string | null;
  has_update: boolean;
};

type Phase = "idle" | "upgrading" | "restartable" | "restarting" | "manual";

/**
 * Sidebar footer: current version + the update flow. When npm reports a
 * newer version an Update button appears; clicking it runs
 * `npm i -g notfair@latest` via /api/upgrade. Background/launchd servers
 * then offer one-click Restart (/api/restart) and the page reloads on the
 * new version; foreground/dev runs are told to restart from the terminal.
 */
export function SidebarVersion() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.json() as Promise<VersionInfo>)
      .then((v) => {
        if (!cancelled) setInfo(v);
      })
      .catch(() => {
        // Offline / blocked — keep the bar empty rather than spam errors.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upgrade() {
    if (!info?.has_update || phase !== "idle") return;
    setPhase("upgrading");
    try {
      const res = await fetch("/api/upgrade", { method: "POST" });
      const body = (await res.json()) as
        | { ok: true; note?: string; can_restart?: boolean }
        | { ok: false; error?: string; command?: string; hint?: string };
      if (!res.ok || !body.ok) {
        const msg = !body.ok
          ? body.hint ?? body.error ?? "Upgrade failed"
          : "Upgrade failed";
        if (!body.ok && body.command) {
          await navigator.clipboard.writeText(body.command).catch(() => {});
          toast.error(`${msg}\nCommand copied to clipboard.`, { duration: 10_000 });
        } else {
          toast.error(msg, { duration: 8_000 });
        }
        setPhase("idle");
        return;
      }
      if (body.can_restart) {
        setPhase("restartable");
        toast.success(`v${info.latest} installed — restart to apply.`, {
          duration: 10_000,
        });
      } else {
        setPhase("manual");
        toast.success(
          body.note ?? "Upgraded. Restart NotFair in your terminal to apply.",
          { duration: 15_000 },
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }

  async function restart() {
    if (phase !== "restartable") return;
    setPhase("restarting");
    try {
      const res = await fetch("/api/restart", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; hint?: string };
      if (!res.ok || !body.ok) {
        toast.error(body.hint ?? "Could not restart from here — use your terminal.", {
          duration: 10_000,
        });
        setPhase("manual");
        return;
      }
    } catch {
      // The server may die mid-response — that's the restart happening.
    }
    // Poll until the new version answers, then hard-reload so the client
    // bundle matches the server again.
    const target = info?.latest ?? null;
    const deadline = Date.now() + 60_000;
    const poll = async () => {
      try {
        const v = (await (
          await fetch("/api/version", { cache: "no-store" })
        ).json()) as VersionInfo;
        if (!target || v.current === target) {
          window.location.reload();
          return;
        }
      } catch {
        // Still down — keep waiting.
      }
      if (Date.now() < deadline) {
        setTimeout(poll, 1_500);
      } else {
        toast.error("The server hasn't come back yet — check `notfair status`.", {
          duration: 10_000,
        });
        setPhase("manual");
      }
    };
    setTimeout(poll, 2_000);
  }

  if (!info) {
    return (
      <div className="px-1 text-[11px] font-mono text-[hsl(var(--notfair-ink-4))]">
        NotFair
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
      <span className="font-mono text-[hsl(var(--notfair-ink-4))]">
        NotFair v{info.current}
      </span>

      {info.has_update && (phase === "idle" || phase === "upgrading") && (
        <Button
          size="sm"
          variant="outline"
          disabled={phase === "upgrading"}
          onClick={upgrade}
          title={`Update available: v${info.latest}`}
          className="h-6 gap-1 px-2 text-[10.5px] font-medium"
        >
          {phase === "upgrading" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              v{info.latest} available
            </>
          )}
        </Button>
      )}

      {(phase === "restartable" || phase === "restarting") && (
        <Button
          size="sm"
          variant="outline"
          disabled={phase === "restarting"}
          onClick={restart}
          className="h-6 gap-1 px-2 text-[10.5px] font-medium"
        >
          {phase === "restarting" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Restarting…
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" />
              Restart now
            </>
          )}
        </Button>
      )}

      {phase === "manual" && (
        <span className="text-[10.5px] text-[hsl(var(--notfair-accent))]">
          Restart to apply
        </span>
      )}
    </div>
  );
}
