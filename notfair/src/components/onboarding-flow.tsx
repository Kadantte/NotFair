"use client";

import { Suspense, useActionState, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ChevronRight, FolderOpen, Loader2, Plug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { McpFlashBanner } from "@/components/mcp-flash-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/project-href";
import { startMcpConnect } from "@/server/actions/mcp";
import { createProjectForOnboardingAction } from "@/server/actions/projects";
import {
  listGoogleAdsAccounts,
  setOnboardingAccountAction,
  getConnectStepStateAction,
  listMetaAdsAccounts,
  setOnboardingMetaAdsAccountAction,
  listGscProperties,
  setOnboardingGscPropertyAction,
  type GoogleAdsAccount,
  type MetaAdsAccount,
  type GscProperty,
  type ConnectStepState,
} from "@/server/onboarding/accounts";
import { AddMcpServerMenu } from "@/components/add-mcp-server-card";
import { McpIcon } from "@/components/mcp-icon";

type Step =
  | "name"
  | "connect"
  | "account"
  | "meta-account"
  | "gsc-property";

export function OnboardingFlow() {
  return (
    <Suspense fallback={null}>
      <OnboardingFlowInner />
    </Suspense>
  );
}

function OnboardingFlowInner() {
  const router = useRouter();
  const params = useSearchParams();
  const stepParam = params.get("step");
  const slug = params.get("slug") ?? null;
  const mcpConnected = params.get("mcp_connected") ?? undefined;
  const mcpError = params.get("mcp_error") ?? undefined;
  const mcpAnalyzing = params.get("mcp_analyzing") === "1";
  const step: Step =
    stepParam === "connect" ||
    stepParam === "account" ||
    stepParam === "meta-account" ||
    stepParam === "gsc-property"
      ? stepParam
      : "name";

  // Step → progress-pip state mapping. The pickers (account, meta-account,
  // gsc-property) all roll up under "Connect" because they're sub-flows
  // launched from the connect step and return to it.
  const phase: "name" | "connect" = step === "name" ? "name" : "connect";

  return (
    <div className="ns-page">
      <a
        href="#onboarding-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      {/* Brand row + progress pips. The mark anchors the wizard so the user
          always sees where they are; the pips show how far they've gone. */}
      <div className="ns-topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/notfair-mark.svg" alt="Notfair" className="dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/notfair-mark-dark.svg" alt="Notfair" className="hidden dark:block" />
        <span className="ns-topbar-label">NotFair</span>
        <div className="ml-auto">
          <div className="ns-progress">
            <Pip n={1} label="Workspace" state={phase === "name" ? "active" : "done"} />
            <span className="ns-pip-line" />
            <Pip
              n={2}
              label="Connect"
              state={phase === "name" ? "pending" : "active"}
            />
          </div>
        </div>
      </div>

      <main id="onboarding-main">
        <McpFlashBanner
          connected={mcpConnected}
          error={mcpError}
          analyzing={mcpAnalyzing}
          goalsHref={slug ? `/${slug}` : undefined}
        />
        {step === "name" && (
          <NameStep
            onCreated={(s) =>
              router.push(`/onboarding?step=connect&slug=${encodeURIComponent(s)}`)
            }
          />
        )}
        {step === "connect" && slug && <ConnectStep slug={slug} />}
        {step === "account" && slug && <AccountStep slug={slug} />}
        {step === "meta-account" && slug && <MetaAccountStep slug={slug} />}
        {step === "gsc-property" && slug && <GscPropertyStep slug={slug} />}
        {(step === "connect" ||
          step === "account" ||
          step === "meta-account" ||
          step === "gsc-property") &&
          !slug && <MissingSlug />}
      </main>
    </div>
  );
}

function Pip({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: "pending" | "active" | "done";
}) {
  return (
    <div
      className={`ns-pip ${state === "done" ? "is-done" : ""} ${state === "active" ? "is-active" : ""}`}
    >
      <span className="ns-pip-dot">{state === "done" ? "✓" : n}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

// ── Codebase folder picker (Step 1 helper) ─────────────────────────
//
// Browsers don't expose absolute paths from `<input type="file"
// webkitdirectory>` or `showDirectoryPicker()` — security. Since this
// server runs on the user's own machine (loopback only), we shell out
// to the OS-native folder dialog via POST /api/fs/pick-folder and let
// the OS handle the picker UI. The field stays editable so users on
// platforms we don't yet support natively (Linux, Windows) can paste.

function CodebasePathPicker({ disabled }: { disabled: boolean }) {
  const [value, setValue] = useState("");
  const [picking, setPicking] = useState(false);

  async function onBrowse() {
    setPicking(true);
    try {
      const res = await fetch("/api/fs/pick-folder", { method: "POST" });
      const body = (await res.json()) as
        | { ok: true; path: string }
        | { ok: false; kind: "cancelled" }
        | { ok: false; kind: "unsupported" | "error"; message?: string };
      if (body.ok) {
        setValue(body.path);
        return;
      }
      if (body.kind === "cancelled") return; // silent — user closed dialog
      toast.error(body.message ?? "Couldn't open the folder picker.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        id="codebase_path"
        name="codebase_path"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="No folder selected"
        maxLength={500}
        disabled={disabled || picking}
        readOnly={picking}
        aria-label="Local codebase folder"
      />
      <Button
        type="button"
        variant="outline"
        onClick={onBrowse}
        disabled={disabled || picking}
        aria-label="Browse for a folder"
      >
        {picking ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <FolderOpen className="mr-1.5 size-4" />
        )}
        Browse&hellip;
      </Button>
    </div>
  );
}

// ── Step 1: Name ───────────────────────────────────────────────────

function NameStep({ onCreated }: { onCreated: (slug: string) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [state, formAction, isPending] = useActionState<
    | { ok: true; data: { slug: string; display_name: string } }
    | { ok: false; error: string }
    | null,
    FormData
  >(async (_prev, formData) => createProjectForOnboardingAction(formData), null);

  useEffect(() => {
    if (state && state.ok) onCreated(state.data.slug);
  }, [state, onCreated]);

  const errorMessage = state && !state.ok ? state.error : null;

  return (
    <>
      <header>
        <h1 className="ns-hero-title">Let&rsquo;s set up your workspace.</h1>
        <p className="ns-hero-sub">
          Name it, point at your site, and pick which local AI runtime does the work.
        </p>
      </header>

      <form action={formAction} className="mt-5 space-y-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="display_name" className="text-[13px] font-medium">
            Workspace name
          </Label>
          <Input
            id="display_name"
            name="display_name"
            required
            autoFocus
            placeholder="Acme Inc"
            maxLength={80}
            disabled={isPending}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-9 rounded-lg text-[14px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="website_url" className="text-[13px] font-medium">
            Website URL{" "}
            <span className="text-[12px] font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id="website_url"
            name="website_url"
            type="url"
            placeholder="https://acme.com"
            maxLength={500}
            disabled={isPending}
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className="h-9 rounded-lg text-[14px]"
          />
          <p className="text-[11.5px] text-muted-foreground leading-tight">
            Your agents skim a few pages to learn what you sell.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="codebase_path" className="text-[13px] font-medium">
            Local codebase folder{" "}
            <span className="text-[12px] font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <CodebasePathPicker disabled={isPending} />
          <p className="text-[11.5px] text-muted-foreground leading-tight">
            Folder your agents can read locally — README, package.json, top-level
            files. Skim only.
          </p>
        </div>

        <HarnessPicker disabled={isPending} />

        {errorMessage && (
          <p role="alert" className="text-[13px] text-destructive">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="ns-btn ns-btn-primary"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Continue
        </button>
      </form>
    </>
  );
}

// ── Harness picker ─────────────────────────────────────────────────
//
// Two adapters: Codex (recommended default) and Claude Code. Persisted on
// the project row so different projects can use different harnesses. The
// chosen CLI must be on PATH when chats run — adapter testEnvironment is
// surfaced via the doctor command for diagnostic feedback.

function HarnessPicker({ disabled }: { disabled: boolean }) {
  const [value, setValue] = useState<"claude-code-local" | "codex-local">(
    "codex-local",
  );
  const options: Array<{
    id: "claude-code-local" | "codex-local";
    label: string;
    description: string;
    recommended: boolean;
  }> = [
    {
      id: "codex-local",
      label: "Codex",
      description: "Uses your local `codex` CLI. Recommended.",
      recommended: true,
    },
    {
      id: "claude-code-local",
      label: "Claude Code",
      description: "Uses your local `claude` CLI.",
      recommended: false,
    },
  ];
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 space-y-3">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          AI agent runtime
        </Label>
        <p className="text-xs text-muted-foreground">
          Pick which local CLI runs your agents. You can have different
          projects on different harnesses.
        </p>
      </div>
      <input type="hidden" name="harness_adapter" value={value} />
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => setValue(opt.id)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-left transition-colors",
              value === opt.id
                ? "bg-[hsl(var(--notfair-surface-2))] shadow-[var(--notfair-shadow-sm)]"
                : "bg-background/40 hover:bg-[hsl(var(--notfair-surface-2)/0.6)]",
              disabled && "opacity-60",
            )}
            aria-pressed={value === opt.id}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-medium text-foreground">{opt.label}</span>
              {opt.recommended && (
                <span className="rounded-full bg-[hsl(var(--notfair-accent-soft))] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[hsl(var(--notfair-accent))]">
                  Recommended
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{opt.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Connect ────────────────────────────────────────────────

/**
 * Spec for one of the recommended-MCP tiles in the connect step. The core
 * ad/search platforms get first-class tiles because they are what goal
 * agents measure and act on; everything else lives in the "More tools"
 * browse dialog.
 */
type RecommendedTile = {
  mcp_key: string;
  /** Primary row title — the MCP name, e.g. "Google Ads MCP". Doubles
   *  as the tile's aria-label so existing tests that match by platform
   *  prefix (`/^Google Ads/`) still resolve. */
  mcp_display_name: string;
  /** What the user gets — phrased as "Gives the <X> agent the ability
   *  to …" so the MCP↔agent dependency reads in plain language instead
   *  of a badge. */
  description: string;
  /** Resource URL the OAuth flow targets — also feeds <McpIcon>'s icon
   *  lookup so each tile shows the brand mark the connections page uses. */
  resource_url: string;
  /** Sub-step the OAuth callback should land on so the user can pick an
   *  account/property when their token covers more than one. Absent when
   *  the MCP has no picker — OAuth returns straight to the connect step. */
  account_step?: "account" | "meta-account" | "gsc-property";
  /** Label for the "Select X" sub-action when connected but not selected. */
  account_action_label?: string;
};

const RECOMMENDED_TILES: RecommendedTile[] = [
  {
    mcp_key: "notfair-googleads",
    mcp_display_name: "Google Ads MCP",
    description:
      "Google Ads campaigns, spend, conversions — the richest ground for CAC and wasted-spend goals.",
    resource_url: "https://notfair.co/api/mcp/google_ads",
    account_step: "account",
    account_action_label: "Select Google Ads account",
  },
  {
    mcp_key: "notfair-metaads",
    mcp_display_name: "Meta Ads MCP",
    description:
      "Meta (Facebook + Instagram) ad sets, ROAS, creative performance — for paid-social goals.",
    resource_url: "https://notfair.co/api/mcp/meta_ads",
    account_step: "meta-account",
    account_action_label: "Select Meta ad account",
  },
  {
    mcp_key: "notfair-googlesearchconsole",
    mcp_display_name: "Google Search Console MCP",
    // SEO agent owns Search Console — there's no dedicated GSC agent.
    description:
      "Organic search performance — queries, pages, indexing. Lets a goal agent measure and grow organic traffic.",
    resource_url: "https://notfair.co/api/mcp/google_search_console",
    account_step: "gsc-property",
    account_action_label: "Select GSC property",
  },
  // Google Analytics deliberately lives under "More tools".
  {
    mcp_key: "notfair-xads",
    mcp_display_name: "X Ads MCP",
    description:
      "X (Twitter) Ads campaigns, line items, spend and engagement — measurable ground for a goal agent.",
    resource_url: "https://notfair.co/api/mcp/x_ads",
  },
];

type ConnectStepStateView =
  | { phase: "loading" }
  | { phase: "loaded"; state: ConnectStepState }
  | { phase: "error"; message: string };

function ConnectStep({ slug }: { slug: string }) {
  const router = useRouter();
  const [view, setView] = useState<ConnectStepStateView>({ phase: "loading" });
  const [tileBusy, setTileBusy] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const connectionsHref = projectHref(slug, "/connections");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getConnectStepStateAction(slug);
      if (cancelled) return;
      if (!result.ok) {
        setView({ phase: "error", message: result.error });
        return;
      }
      setView({ phase: "loaded", state: result.state });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onConnectTile(tile: RecommendedTile) {
    setTileBusy(tile.mcp_key);
    try {
      const result = await startMcpConnect({
        mcp_key: tile.mcp_key,
        // After OAuth lands, route through the matching account-picker
        // step. That step auto-skips if the bearer covers a single
        // account/property; otherwise it shows a picker. Both paths
        // ultimately redirect back to /onboarding?step=connect so the
        // user can continue adding tools. MCPs without a picker return
        // straight to the connect step.
        return_to: `/onboarding?step=${tile.account_step ?? "connect"}&slug=${encodeURIComponent(slug)}`,
      });
      if (!result.ok) {
        toast.error(result.error);
        setTileBusy(null);
        return;
      }
      window.location.href = result.authorize_url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setTileBusy(null);
    }
  }

  function onPickAccount(tile: RecommendedTile) {
    if (!tile.account_step) return;
    router.push(
      `/onboarding?step=${tile.account_step}&slug=${encodeURIComponent(slug)}`,
    );
  }

  async function onDone() {
    setAdvancing(true);
    // Straight to the workspace: the user mints their first goal agent
    // there and defines the goal in its chat. Nothing to provision here.
    router.replace(projectHref(slug, ""));
  }

  function onSkip() {
    router.replace(projectHref(slug, ""));
  }

  if (view.phase === "loading") {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground py-8">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        <span>Loading your connections&hellip;</span>
      </div>
    );
  }

  if (view.phase === "error") {
    return (
      <div role="alert" className="ns-list p-6 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-[hsl(var(--notfair-warn))]" aria-hidden />
          <span className="font-medium text-sm">
            Couldn&rsquo;t load connection state.
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{view.message}</p>
        <Link href="/onboarding" className="ns-btn ns-btn-primary">
          Start over
        </Link>
      </div>
    );
  }

  const { state } = view;
  const tileStateByKey = {
    "notfair-googleads": state.googleads,
    "notfair-metaads": state.metaads,
    "notfair-googlesearchconsole": state.gsc,
    "notfair-xads": state.xads,
  } as const;
  const anyConnected =
    state.googleads.connected ||
    state.metaads.connected ||
    state.gsc.connected ||
    state.xads.connected ||
    state.extra_connected_count > 0;

  return (
    <>
      <header>
        <h1 className="ns-hero-title">Connect your data sources.</h1>
        <p className="ns-hero-sub">
          Every goal agent shares these — they are what your agents
          measure and act on.
        </p>
      </header>

      <ol className="ns-list">
        {RECOMMENDED_TILES.map((tile) => (
          <RecommendedConnectorTile
            key={tile.mcp_key}
            tile={tile}
            state={tileStateByKey[tile.mcp_key as keyof typeof tileStateByKey]}
            busy={tileBusy === tile.mcp_key}
            disabled={tileBusy !== null && tileBusy !== tile.mcp_key}
            onConnect={() => onConnectTile(tile)}
            onPickAccount={() => onPickAccount(tile)}
          />
        ))}
        {/* Connected extras (Stripe, Supabase, …) added via the "More tools"
            dialog land here, between the recommended trio and the More row,
            so the list stays in the user's mental order: top tier first,
            extras next, the door to add more last. */}
        {state.extras.map((extra) => (
          <ExtraConnectorTile key={extra.key} extra={extra} />
        ))}
        <li>
          {/* Reuse the connections-page Add-MCP menu so onboarding gets the
              same Browse + Custom paths. The trigger is a tile-shaped
              button so it sits naturally as the last row of the grouped
              list; the dropdown opens from there. */}
          <AddMcpServerMenu
            align="start"
            // Hide the three recommended MCPs from Browse — they each have
            // their own row above already, no point re-listing them.
            hideKeys={RECOMMENDED_TILES.map((t) => t.mcp_key)}
            // Filter already-connected entries from Browse. The dialog
            // already filters via connectedKeys; the recommended trio is
            // also in hideKeys above for belt-and-suspenders.
            connectedKeys={[
              ...(state.googleads.connected ? ["notfair-googleads"] : []),
              ...(state.metaads.connected ? ["notfair-metaads"] : []),
              ...(state.gsc.connected ? ["notfair-googlesearchconsole"] : []),
              ...(state.xads.connected ? ["notfair-xads"] : []),
              // Google Analytics + Stripe/Supabase/etc. arrive here — a
              // connected GA is an extras row, which also hides it in Browse.
              ...state.extras.map((e) => e.key),
            ]}
            trigger={
              <button
                type="button"
                aria-label="More tools"
                className="ns-tile w-full"
              >
                <span className="ns-tile-glyph" aria-hidden>
                  +
                </span>
                <span className="ns-tile-body">
                  <span className="ns-tile-name-row">
                    <span className="ns-tile-name">More tools</span>
                  </span>
                  <span className="ns-tile-desc block">
                    Browse Google Analytics, Stripe, Supabase, PostHog, or
                    paste a custom MCP URL.
                  </span>
                </span>
                <span className="ns-tile-status">
                  {state.extra_connected_count > 0 ? (
                    <span>{state.extra_connected_count} connected</span>
                  ) : (
                    <span className="arrow" aria-hidden>
                      ›
                    </span>
                  )}
                </span>
              </button>
            }
          />
        </li>
      </ol>

      <div className="ns-foot">
        <p className="ns-footnote">You can set up MCPs later in the app.</p>
        {anyConnected ? (
          <button
            type="button"
            onClick={onDone}
            disabled={advancing}
            className="ns-btn ns-btn-primary"
          >
            {advancing && <Loader2 className="size-4 animate-spin" />}
            Next{" "}
            <span aria-hidden style={{ fontWeight: 400 }}>
              ›
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            disabled={advancing}
            className="ns-btn ns-btn-ghost"
          >
            Skip
          </button>
        )}
      </div>

    </>
  );
}

function RecommendedConnectorTile({
  tile,
  state,
  busy,
  disabled,
  onConnect,
  onPickAccount,
}: {
  tile: RecommendedTile;
  state: { connected: boolean; account_selected: boolean };
  busy: boolean;
  disabled: boolean;
  onConnect: () => void;
  onPickAccount: () => void;
}) {
  // The row can't be a real <button>: the "Select account" sub-action
  // below is a button too, and HTML forbids nested interactive elements
  // (React 19 surfaces it as a hydration error). div[role=button] keeps
  // the accessible name + role (so `getByRole('button', { name: /…/ })`
  // still resolves) while making the nesting legal.
  const inert = state.connected || busy || disabled;
  const activate = () => {
    if (!inert) onConnect();
  };
  return (
    <li>
      <div
        role="button"
        tabIndex={inert ? -1 : 0}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        }}
        aria-disabled={busy || disabled ? true : undefined}
        aria-label={tile.mcp_display_name}
        className={`ns-tile w-full ${state.connected ? "is-connected" : ""}`}
        // When already connected, the row itself is non-actionable; the
        // sub-action below handles "pick account" and the row would
        // navigate nowhere otherwise.
        style={state.connected ? { cursor: "default" } : undefined}
      >
        <McpIcon resourceUrl={tile.resource_url} alt={tile.mcp_display_name} size="lg" />
        <span className="ns-tile-body">
          <span className="ns-tile-name-row">
            <span className="ns-tile-name">{tile.mcp_display_name}</span>
          </span>
          <span className="ns-tile-desc block">{tile.description}</span>
          {tile.account_step && state.connected && !state.account_selected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPickAccount();
              }}
              disabled={disabled}
              className="ns-subaction"
            >
              {tile.account_action_label}
            </button>
          )}
        </span>
        <span className="ns-tile-status">
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : state.connected ? (
            <span className="ns-status-connected">Connected</span>
          ) : (
            // Visual pill — the surrounding row IS the actual click target,
            // so this is intentionally a span (not nested <button>) to keep
            // HTML valid. The pill is the affordance saying "click this row
            // to connect this MCP."
            <span className="ns-btn ns-btn-primary ns-btn-sm">
              Connect{" "}
              <span className="arrow" aria-hidden style={{ fontWeight: 400 }}>
                ›
              </span>
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

function ExtraConnectorTile({
  extra,
}: {
  extra: {
    key: string;
    display_name: string;
    description?: string;
    resource_url: string;
  };
}) {
  return (
    <li>
      <div
        className="ns-tile is-connected"
        style={{ cursor: "default", width: "100%" }}
        aria-label={extra.display_name}
      >
        <McpIcon resourceUrl={extra.resource_url} alt={extra.display_name} size="lg" />
        <span className="ns-tile-body">
          <span className="ns-tile-name block">{extra.display_name}</span>
          {extra.description && (
            <span className="ns-tile-desc block">{extra.description}</span>
          )}
        </span>
        <span className="ns-tile-status">
          <span className="ns-status-connected">Connected</span>
        </span>
      </div>
    </li>
  );
}


// ── Step 3: Pick Google Ads account (auto-skipped if only 1) ───────

type AccountListState =
  | { phase: "loading" }
  | { phase: "loaded"; accounts: GoogleAdsAccount[]; default_account_id: string | null }
  | { phase: "error"; message: string };

function AccountStep({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<AccountListState>({ phase: "loading" });
  const [pickingId, setPickingId] = useState<string | null>(null);
  // Guard against StrictMode double-mount auto-selecting twice.
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listGoogleAdsAccounts(slug);
      if (cancelled) return;
      if (!result.ok) {
        setState({
          phase: "error",
          message: result.error,
        });
        return;
      }
      setState({
        phase: "loaded",
        accounts: result.accounts,
        default_account_id: result.default_account_id,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Auto-skip when there's exactly one account — no point making the user
  // pick from a list of one. We still call the server action so the project
  // row gets the id persisted, then forward to the audit step.
  useEffect(() => {
    if (state.phase !== "loaded") return;
    if (state.accounts.length !== 1) return;
    if (autoSelectedRef.current) return;
    autoSelectedRef.current = true;
    (async () => {
      const only = state.accounts[0]!;
      const result = await setOnboardingAccountAction(slug, only.id);
      if (!result.ok) {
        toast.error(result.error);
        setState({ phase: "error", message: result.error });
        return;
      }
      // Back to the connect step so the user can wire up the rest of
      // their tools.
      // setOnboardingAccountAction and stays blocked behind the
      // project-onboarding task until the user clicks "Done — next step".
      router.replace(
        `/onboarding?step=connect&slug=${encodeURIComponent(slug)}`,
      );
    })();
  }, [state, slug, router]);

  async function onPick(account: GoogleAdsAccount) {
    setPickingId(account.id);
    try {
      const result = await setOnboardingAccountAction(slug, account.id);
      if (!result.ok) {
        toast.error(result.error);
        setPickingId(null);
        return;
      }
      router.replace(
        `/onboarding?step=connect&slug=${encodeURIComponent(slug)}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setPickingId(null);
    }
  }

  if (state.phase === "loading") {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6 pb-6">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="font-medium">Loading your Google Ads accounts&hellip;</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.phase === "error") {
    return (
      <Card role="alert">
        <CardContent className="space-y-3 pt-6 pb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-[hsl(var(--notfair-warn))]" aria-hidden />
            <span className="font-medium text-sm">
              Couldn&rsquo;t load your Google Ads accounts.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{state.message}</p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/onboarding">Retry from start</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={projectHref(slug, "")}>Skip to project</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.accounts.length === 0) {
    return (
      <Card role="alert">
        <CardContent className="space-y-3 pt-6 pb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-[hsl(var(--notfair-warn))]" aria-hidden />
            <span className="font-medium text-sm">
              No Google Ads accounts found on this connection.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            The connected user has no Google Ads customer accounts. Connect a
            different account or skip for now.
          </p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href={`/onboarding?step=connect&slug=${encodeURIComponent(slug)}`}>
                Reconnect
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={projectHref(slug, "")}>Skip to project</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // length === 1 → auto-selecting via effect above; render the same loading
  // card so there's no flash of the picker UI.
  if (state.accounts.length === 1) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6 pb-6">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="font-medium">
              Using your only Google Ads account&hellip;
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // length > 1 → picker.
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Which Google Ads account?
        </h1>
        <p className="text-sm text-muted-foreground">
          Your connection has {state.accounts.length} accounts. Pick the one
          you want me to audit for this workspace. You can switch later in
          Settings.
        </p>
      </header>

      <ul className="space-y-2 list-none p-0">
        {state.accounts.map((account) => {
          const isDefault = account.id === state.default_account_id;
          const isPicking = pickingId === account.id;
          const isOtherPicking = pickingId !== null && !isPicking;
          return (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => onPick(account)}
                disabled={pickingId !== null}
                aria-label={`Audit ${account.name} (${account.id})`}
                className={cn(
                  "block w-full rounded-md border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:cursor-not-allowed",
                  isOtherPicking && "opacity-50",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{account.name}</span>
                      {isDefault && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Customer ID {account.id}
                    </p>
                  </div>
                  {isPicking ? (
                    <Loader2
                      className="size-4 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ── Step 3b: Pick Meta Ads ad-account (auto-skipped if only 1) ─────
//
// Mirrors AccountStep but for the notfair-metaads MCP. Lands the user
// back on the connect step after picking so they can wire up another
// MCP or finish onboarding.

type MetaListState =
  | { phase: "loading" }
  | { phase: "loaded"; accounts: MetaAdsAccount[]; default_account_id: string | null }
  | { phase: "error"; message: string };

function MetaAccountStep({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<MetaListState>({ phase: "loading" });
  const [pickingId, setPickingId] = useState<string | null>(null);
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listMetaAdsAccounts(slug);
      if (cancelled) return;
      if (!result.ok) {
        setState({ phase: "error", message: result.error });
        return;
      }
      setState({
        phase: "loaded",
        accounts: result.accounts,
        default_account_id: result.default_account_id,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (state.phase !== "loaded") return;
    if (state.accounts.length !== 1) return;
    if (autoSelectedRef.current) return;
    autoSelectedRef.current = true;
    (async () => {
      const only = state.accounts[0]!;
      const result = await setOnboardingMetaAdsAccountAction(slug, only.id);
      if (!result.ok) {
        toast.error(result.error);
        setState({ phase: "error", message: result.error });
        return;
      }
      router.replace(
        `/onboarding?step=connect&slug=${encodeURIComponent(slug)}`,
      );
    })();
  }, [state, slug, router]);

  async function onPick(account: MetaAdsAccount) {
    setPickingId(account.id);
    try {
      const result = await setOnboardingMetaAdsAccountAction(slug, account.id);
      if (!result.ok) {
        toast.error(result.error);
        setPickingId(null);
        return;
      }
      router.replace(
        `/onboarding?step=connect&slug=${encodeURIComponent(slug)}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setPickingId(null);
    }
  }

  return (
    <AccountPickerScaffold
      slug={slug}
      mcpDisplayName="Meta Ads"
      idLabel="Ad account ID"
      state={
        state.phase === "loading"
          ? { phase: "loading" }
          : state.phase === "error"
            ? { phase: "error", message: state.message }
            : {
                phase: "loaded",
                items: state.accounts.map((a) => ({
                  id: a.id,
                  name: a.name,
                  isDefault: a.id === state.default_account_id,
                  isPicking: pickingId === a.id,
                })),
                anyPicking: pickingId !== null,
              }
      }
      onPick={(id) => {
        const a = state.phase === "loaded" ? state.accounts.find((x) => x.id === id) : null;
        if (a) onPick(a);
      }}
    />
  );
}

// ── Step 3c: Pick Google Search Console property (auto-skipped if only 1) ──

type GscListState =
  | { phase: "loading" }
  | { phase: "loaded"; properties: GscProperty[]; default_property_id: string | null }
  | { phase: "error"; message: string };

function GscPropertyStep({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<GscListState>({ phase: "loading" });
  const [pickingId, setPickingId] = useState<string | null>(null);
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listGscProperties(slug);
      if (cancelled) return;
      if (!result.ok) {
        setState({ phase: "error", message: result.error });
        return;
      }
      setState({
        phase: "loaded",
        properties: result.properties,
        default_property_id: result.default_property_id,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (state.phase !== "loaded") return;
    if (state.properties.length !== 1) return;
    if (autoSelectedRef.current) return;
    autoSelectedRef.current = true;
    (async () => {
      const only = state.properties[0]!;
      const result = await setOnboardingGscPropertyAction(slug, only.id);
      if (!result.ok) {
        toast.error(result.error);
        setState({ phase: "error", message: result.error });
        return;
      }
      router.replace(
        `/onboarding?step=connect&slug=${encodeURIComponent(slug)}`,
      );
    })();
  }, [state, slug, router]);

  async function onPick(property: GscProperty) {
    setPickingId(property.id);
    try {
      const result = await setOnboardingGscPropertyAction(slug, property.id);
      if (!result.ok) {
        toast.error(result.error);
        setPickingId(null);
        return;
      }
      router.replace(
        `/onboarding?step=connect&slug=${encodeURIComponent(slug)}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setPickingId(null);
    }
  }

  return (
    <AccountPickerScaffold
      slug={slug}
      mcpDisplayName="Google Search Console"
      idLabel="Property"
      state={
        state.phase === "loading"
          ? { phase: "loading" }
          : state.phase === "error"
            ? { phase: "error", message: state.message }
            : {
                phase: "loaded",
                items: state.properties.map((p) => ({
                  id: p.id,
                  name: p.name,
                  isDefault: p.id === state.default_property_id,
                  isPicking: pickingId === p.id,
                })),
                anyPicking: pickingId !== null,
              }
      }
      onPick={(id) => {
        const p = state.phase === "loaded" ? state.properties.find((x) => x.id === id) : null;
        if (p) onPick(p);
      }}
    />
  );
}

// ── Shared picker shell for Meta + GSC ─────────────────────────────
//
// Visually identical to the Google Ads picker but parameterized by the
// MCP display label and the id-label shown under each row. Used by
// MetaAccountStep + GscPropertyStep to avoid duplicating ~80 lines of
// loading / error / empty / single-item / picker JSX three times.

type AccountPickerScaffoldState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "loaded";
      items: { id: string; name: string; isDefault: boolean; isPicking: boolean }[];
      anyPicking: boolean;
    };

function AccountPickerScaffold({
  slug,
  mcpDisplayName,
  idLabel,
  state,
  onPick,
}: {
  slug: string;
  mcpDisplayName: string;
  idLabel: string;
  state: AccountPickerScaffoldState;
  onPick: (id: string) => void;
}) {
  if (state.phase === "loading") {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6 pb-6">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="font-medium">
              Loading your {mcpDisplayName} accounts&hellip;
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (state.phase === "error") {
    return (
      <Card role="alert">
        <CardContent className="space-y-3 pt-6 pb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-[hsl(var(--notfair-warn))]" aria-hidden />
            <span className="font-medium text-sm">
              Couldn&rsquo;t load your {mcpDisplayName} accounts.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{state.message}</p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href={`/onboarding?step=connect&slug=${encodeURIComponent(slug)}`}>
                Back to connect
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (state.items.length === 0) {
    return (
      <Card role="alert">
        <CardContent className="space-y-3 pt-6 pb-6">
          <p className="text-sm font-medium">
            No {mcpDisplayName} accounts on this connection.
          </p>
          <p className="text-xs text-muted-foreground">
            Try a different account or skip this connector for now.
          </p>
          <Button asChild>
            <Link href={`/onboarding?step=connect&slug=${encodeURIComponent(slug)}`}>
              Back to connect
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (state.items.length === 1) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6 pb-6">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="font-medium">
              Using your only {mcpDisplayName} account&hellip;
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Which {mcpDisplayName} account?
        </h1>
        <p className="text-sm text-muted-foreground">
          Your connection has {state.items.length} accounts. Pick the one
          you want me to use for this workspace. You can switch later in
          Settings.
        </p>
      </header>
      <ul className="space-y-2 list-none p-0">
        {state.items.map((item) => {
          const isOtherPicking = state.anyPicking && !item.isPicking;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item.id)}
                disabled={state.anyPicking}
                aria-label={`Use ${item.name} (${item.id})`}
                className={cn(
                  "block w-full rounded-md border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:cursor-not-allowed",
                  isOtherPicking && "opacity-50",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.name}</span>
                      {item.isDefault && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {idLabel} {item.id}
                    </p>
                  </div>
                  {item.isPicking ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function MissingSlug() {
  return (
    <div className="mt-10 space-y-4">
      <p className="text-[15px] text-muted-foreground">
        This step needs a workspace. Start from the beginning.
      </p>
      <Link href="/onboarding" className="ns-btn ns-btn-primary">
        Start over
      </Link>
    </div>
  );
}
