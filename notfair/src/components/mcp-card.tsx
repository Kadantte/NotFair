"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  BookOpenText,
  Trash2,
  MoreHorizontal,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import {
  startMcpConnect,
  disconnectMcpAction,
  listMcpToolsAction,
  removeUserMcpServerAction,
} from "@/server/actions/mcp";
import type { McpSpec } from "@/server/mcp-catalog";
import type { McpRuntimeStatus } from "@/server/mcp/state";
import { McpToolsDialog } from "@/components/mcp-tools-dialog";
import {
  McpAccountPickerDialog,
  type AccountPickerPrefetch,
} from "@/components/mcp-account-picker-dialog";
import { McpIcon } from "@/components/mcp-icon";
import { accountPickerFor } from "@/lib/mcp-account-pickers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  spec: McpSpec;
  status: McpRuntimeStatus;
  /** Needed by the account picker's list/set server actions. */
  projectSlug: string;
  /**
   * Persisted account/property selection for pickable MCPs (Google Ads,
   * Meta Ads, Search Console) — null when unset or not pickable.
   */
  selectedAccountId?: string | null;
  /**
   * Set when this card's MCP just finished OAuth (`?mcp_key=` matches) and
   * the bearer offers a real account/property choice: the page prefetched
   * the list server-side, and the card auto-opens the picker with it.
   */
  pickerPrefetch?: AccountPickerPrefetch | null;
  /**
   * Fired after any mutation (disconnect, remove, account picked), on top
   * of the router.refresh() the card always does. Hosts whose data comes
   * from a client-side action (onboarding's connect step) pass their
   * reload here; server-rendered hosts (Connections page) omit it.
   */
  onMutated?: () => void;
};

/**
 * One row in the Connections list — Apple-style settings row with brand
 * glyph, name + status, and a single primary action that tracks setup
 * state: **Connect** when there's no token, **Choose account/property**
 * when the token spans multiple accounts and none is picked yet, and a
 * quiet **Switch account/property** once configured (the ⋯ menu holds
 * Disconnect / Remove).
 */
export function McpCard({
  spec,
  status,
  projectSlug,
  selectedAccountId = null,
  pickerPrefetch = null,
  onMutated,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"connect" | "disconnect" | "remove" | null>(
    null,
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const autoOpenedRef = useRef(false);
  const router = useRouter();

  const picker = accountPickerFor(spec.key);
  const isConnected = status.state === "connected";

  // Post-OAuth landing: open the picker exactly once with the prefetched
  // list. The flash banner strips ?mcp_key from the URL right after mount,
  // so the intent is captured in state before the prop disappears.
  useEffect(() => {
    if (!pickerPrefetch || !picker || !isConnected) return;
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    setPickerOpen(true);
  }, [pickerPrefetch, picker, isConnected]);

  async function onConnect() {
    setBusy("connect");
    try {
      const return_to = window.location.pathname + window.location.search;
      const result = await startMcpConnect({ mcp_key: spec.key, return_to });
      if (!result.ok) {
        toast.error(result.error);
        setBusy(null);
        return;
      }
      window.location.href = result.authorize_url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  function onDisconnect() {
    setBusy("disconnect");
    startTransition(async () => {
      const result = await disconnectMcpAction({ mcp_key: spec.key });
      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success(`${spec.display_name} disconnected`);
        router.refresh();
        onMutated?.();
      }
      setBusy(null);
    });
  }

  function onRemove() {
    setBusy("remove");
    startTransition(async () => {
      const result = await removeUserMcpServerAction({ mcp_key: spec.key });
      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success(`${spec.display_name} removed`);
        router.refresh();
        onMutated?.();
      }
      setBusy(null);
    });
  }

  const isBusy = busy !== null || pending;

  return (
    <>
      <article className={`ns-row ${isConnected ? "is-connected" : ""}`}>
        <McpIcon
          resourceUrl={spec.resource_url}
          alt={spec.display_name}
          size="lg"
        />

        <div className="ns-row-body">
          <div className="ns-row-title-row">
            <h3 className="ns-row-title">{spec.display_name}</h3>
            <StatusLabel status={status} />
          </div>
          <p className="ns-row-desc line-clamp-1">{spec.description}</p>
          <StatusLine status={status} resourceUrl={spec.resource_url} />
          {picker && isConnected && selectedAccountId && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
              <span>{picker.noun}:</span>
              <span className="ns-tag-mono">{selectedAccountId}</span>
            </p>
          )}
        </div>

        <div className="ns-row-meta">
          {/* One primary action per setup state; a fully configured row
              has none — its remaining actions live in the ⋯ menu. */}
          {!isConnected ? (
            <button
              type="button"
              className="ns-btn ns-btn-primary ns-btn-sm"
              disabled={isBusy}
              onClick={onConnect}
            >
              {busy === "connect" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {status.state === "stale_token" ? "Reconnect" : "Connect"}
            </button>
          ) : picker ? (
            // Unset gets the loud primary style (setup isn't done);
            // switching an already-chosen account is a quiet outline.
            <button
              type="button"
              className={`ns-btn ns-btn-sm ${selectedAccountId ? "ns-btn-outline" : "ns-btn-primary"}`}
              disabled={isBusy}
              onClick={() => setPickerOpen(true)}
            >
              {selectedAccountId ? "Switch" : "Choose"} {picker.short_noun}
            </button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid size-7 place-items-center rounded-md text-[hsl(var(--notfair-ink-4))] transition-colors hover:bg-[hsl(var(--notfair-surface-2))] hover:text-[hsl(var(--notfair-ink-2))]"
                aria-label={`More options for ${spec.display_name}`}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-xl p-1">
              {isConnected && (
                <DropdownMenuItem
                  onSelect={() => setToolsOpen(true)}
                  className="gap-2 rounded-md px-2 py-1.5 text-[13px]"
                >
                  <BookOpenText className="size-3.5 text-muted-foreground" />
                  View tools
                </DropdownMenuItem>
              )}
              {isConnected && (
                <DropdownMenuItem
                  onSelect={onDisconnect}
                  disabled={isBusy}
                  className="gap-2 rounded-md px-2 py-1.5 text-[13px]"
                >
                  {busy === "disconnect" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Unplug className="size-3.5 text-muted-foreground" />
                  )}
                  Disconnect
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={onRemove}
                disabled={isBusy}
                className="gap-2 rounded-md px-2 py-1.5 text-[13px] text-destructive focus:text-destructive"
              >
                {busy === "remove" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Remove server
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>

      <McpToolsDialog
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        mcpName={spec.display_name}
        mcpDescription={spec.description}
        loadTools={() => listMcpToolsAction({ mcp_key: spec.key })}
      />

      {picker && (
        <McpAccountPickerDialog
          projectSlug={projectSlug}
          mcpKey={spec.key}
          selectedId={selectedAccountId}
          open={pickerOpen}
          prefetch={pickerPrefetch}
          onOpenChange={setPickerOpen}
          onPicked={() => {
            router.refresh();
            onMutated?.();
          }}
        />
      )}
    </>
  );
}

function StatusLabel({ status }: { status: McpRuntimeStatus }) {
  // Labels are intentionally lowercase + terse — they read as a quiet
  // status tag, not a sentence. Mirrors the tokens the tests assert on
  // (`connected`, `no token`, `unreachable`, `token expired`).
  if (status.state === "connected") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[hsl(var(--notfair-accent))]"
        role="status"
      >
        <span aria-hidden className="ns-dot ns-dot-on" />
        connected
      </span>
    );
  }
  const map: Record<
    Exclude<McpRuntimeStatus["state"], "connected">,
    { tone: string; label: string }
  > = {
    stale_token: { tone: "ns-tag-amber", label: "token expired" },
    unreachable: { tone: "ns-tag-red", label: "unreachable" },
    configured_no_token: { tone: "ns-tag-amber", label: "no token" },
    not_configured: { tone: "ns-tag", label: "not connected" },
  };
  const { tone, label } = map[status.state];
  return <span className={tone}>{label}</span>;
}

function StatusLine({
  status,
  resourceUrl,
}: {
  status: McpRuntimeStatus;
  resourceUrl: string;
}) {
  const host = (() => {
    try {
      return new URL(resourceUrl).host;
    } catch {
      return resourceUrl;
    }
  })();
  const detail = describeStatus(status);
  return (
    <p className="mt-1 truncate font-mono text-[10.5px] text-[hsl(var(--notfair-ink-4))]">
      <span>{host}</span>
      {detail ? (
        <>
          <span className="mx-1.5 opacity-50">·</span>
          <span>{detail}</span>
        </>
      ) : null}
    </p>
  );
}

function describeStatus(status: McpRuntimeStatus): string | null {
  switch (status.state) {
    case "connected":
      // The "connected" indicator next to the title already says
      // everything the user needs at a glance. Show just the host on
      // this line — no verified timestamp, no live label.
      return null;
    case "stale_token":
      return `token rejected (HTTP ${status.http_status})`;
    case "unreachable":
      return status.error;
    case "configured_no_token":
      return "config saved, awaiting bearer";
    case "not_configured":
      return "one-click OAuth saves the token locally";
  }
}
