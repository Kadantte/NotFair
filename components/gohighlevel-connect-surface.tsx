"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Key, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GHL_MCP_CONNECTOR_NAME, GHL_MCP_SERVER_URL } from "@/lib/brand";
import { GOHIGHLEVEL_READONLY_SCOPES } from "@/lib/gohighlevel/scopes";
import type { Session } from "@/lib/session";

// Single source of truth — keeps the displayed scopes list in lock-step
// with what the OAuth flow actually requests.
const REQUESTED_SCOPES: readonly string[] = GOHIGHLEVEL_READONLY_SCOPES;

type Connection = {
  id: number;
  companyId: string | null;
  locationId: string | null;
  userType: string;
  companyName: string | null;
  locationName: string | null;
  scopes: string[];
  agencyConnectionId: number | null;
  uninstalledAt: string | null;
  activePatCount: number;
  updatedAt: string;
};

type Status = {
  connected: boolean;
  connections: Connection[];
};

export function GoHighLevelConnectSurface({ session }: { session: Session }) {
  const t = useTranslations('GoHighLevelConnect');
  const [status, setStatus] = useState<Status | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [issuedToken, setIssuedToken] = useState<{ token: string; connectionId: number } | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const [serverUrlCopyOk, setServerUrlCopyOk] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch('/api/integrations/gohighlevel/status', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setStatus({ connected: false, connections: [] });
        return;
      }
      const data: Status = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false, connections: [] });
    }
  };

  useEffect(() => {
    let cancelled = false;
    refresh().catch(() => {
      if (!cancelled) setStatus({ connected: false, connections: [] });
    });

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refresh().catch(() => {
          if (!cancelled) setStatus({ connected: false, connections: [] });
        });
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const canConnect = session.connected;

  const handleDisconnect = async (connectionId: number) => {
    if (busyId !== null) return;
    if (!confirm(t('disconnect.confirm'))) return;
    setBusyId(connectionId);
    try {
      const res = await fetch(`/api/integrations/gohighlevel/disconnect?connectionId=${connectionId}&cascade=true`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(t('disconnect.error') + (json?.error ? `: ${json.error}` : ''));
        return;
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleMintPat = async (connectionId: number) => {
    if (busyId !== null) return;
    setBusyId(connectionId);
    try {
      const res = await fetch('/api/integrations/gohighlevel/pat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId, label: 'Generated from connect page' }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(t('pat.error') + (json?.error ? `: ${json.error}` : ''));
        return;
      }
      const json: { token: string; connectionId: number } = await res.json();
      setIssuedToken(json);
      setCopyOk(false);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const copyToken = async () => {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1800);
    } catch {
      // Clipboard may be blocked — leave the token visible for manual copy.
    }
  };

  const copyServerUrl = async () => {
    try {
      await navigator.clipboard.writeText(GHL_MCP_SERVER_URL);
      setServerUrlCopyOk(true);
      setTimeout(() => setServerUrlCopyOk(false), 1800);
    } catch {
      // Keep the URL visible for manual copy if clipboard access is blocked.
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 py-8 text-left">
      <div className="space-y-4 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-4 py-2 text-sm font-medium text-[#4CAF6E]">
          <ShieldCheck className="h-4 w-4" /> {t('badge')}
        </div>
        <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">{t('title')}</h2>
        <p className="mx-auto max-w-2xl text-lg text-[#C4C0B6]">{t('body')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[#3D3C36] bg-[#1A1917] p-5">
          <h3 className="text-base font-semibold text-[#E8E4DD]">{t('access.title')}</h3>
          <p className="mt-1 text-sm text-[#C4C0B6]">{t('access.body')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {REQUESTED_SCOPES.map((scope) => (
              <span
                key={scope}
                className="rounded-full border border-[#3D3C36] bg-[#24231F] px-3 py-1 text-xs text-[#C4C0B6]"
              >
                {scope}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#3D3C36] bg-[#1A1917] p-5">
          <h3 className="text-base font-semibold text-[#E8E4DD]">{t('model.title')}</h3>
          <ul className="mt-3 space-y-2 text-sm text-[#C4C0B6]">
            <li>• {t('model.items.0')}</li>
            <li>• {t('model.items.1')}</li>
            <li>• {t('model.items.2')}</li>
          </ul>
        </div>
      </div>

      {issuedToken && (
        <div className="rounded-2xl border border-[#FFB74D]/40 bg-[#FFB74D]/10 p-5 text-left">
          <div className="flex items-start gap-2 text-sm font-semibold text-[#FFB74D]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('pat.heading')}</span>
          </div>
          <p className="mt-2 text-sm text-[#E8E4DD]">{t('pat.body')}</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-xs text-[#E8E4DD] break-all">
            {issuedToken.token}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={copyToken} className="rounded-full bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C]">
              <Copy className="mr-2 h-4 w-4" /> {copyOk ? t('pat.copied') : t('pat.copy')}
            </Button>
            <Button
              onClick={() => setIssuedToken(null)}
              variant="outline"
              className="rounded-full border-[#3D3C36] text-[#C4C0B6] hover:bg-[#24231F]"
            >
              {t('pat.dismiss')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-[#C4C0B6]/80">
            {t('pat.mcpUrl')}{' '}
            <code className="rounded bg-[#1A1917] px-1.5 py-0.5 text-[#E8E4DD]">/api/mcp/gohighlevel</code>
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6 text-center">
        {!canConnect ? (
          <div className="space-y-3">
            <p className="font-medium text-[#E8E4DD]">{t('signedOut.title')}</p>
            <p className="text-sm text-[#C4C0B6]">{t('signedOut.body')}</p>
            <Button asChild className="rounded-full bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C]">
              <Link href="/connect" prefetch>
                {t('signedOut.cta')}
              </Link>
            </Button>
          </div>
        ) : status === null ? (
          <div className="flex items-center justify-center gap-2 text-sm text-[#C4C0B6]">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('checking')}
          </div>
        ) : (
          <div className="space-y-5">
            {status.connected && (
              <div className="mx-auto max-w-2xl space-y-4 text-left">
                <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#4CAF6E]">
                    <CheckCircle2 className="h-4 w-4" /> {t("connected")}
                  </div>
                  <div className="mt-3 space-y-2">
                    {status.connections.map((connection) => (
                      <div
                        key={connection.id}
                        className="rounded-lg border border-[#3D3C36] bg-[#1A1917] p-3 text-sm text-[#C4C0B6]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[#E8E4DD]">
                              {connection.locationName
                                || connection.companyName
                                || connection.locationId
                                || connection.companyId
                                || t("fallbackConnection")}
                              {connection.uninstalledAt && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#FFB74D]/40 bg-[#FFB74D]/10 px-2 py-0.5 text-xs text-[#FFB74D]">
                                  <AlertTriangle className="h-3 w-3" /> {t("uninstalled")}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-[#C4C0B6]/80">
                              {connection.userType} · {t("company")}{" "}
                              {connection.companyId ?? t("unknown")}
                              {connection.locationId ? ` · ${t("location")} ${connection.locationId}` : ""}
                              {connection.activePatCount > 0
                                ? ` · ${t("patCount", { count: connection.activePatCount })}`
                                : ""}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === connection.id}
                              onClick={() => handleMintPat(connection.id)}
                              className="rounded-full border-[#3D3C36] text-[#C4C0B6] hover:bg-[#24231F]"
                            >
                              {busyId === connection.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Key className="h-4 w-4" />
                              )}
                              <span className="ml-1 hidden sm:inline">{t("pat.mint")}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === connection.id}
                              onClick={() => handleDisconnect(connection.id)}
                              className="rounded-full border-[#FF6B6B]/30 bg-[#FF6B6B]/5 text-[#FF6B6B] hover:bg-[#FF6B6B]/10"
                            >
                              {busyId === connection.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              <span className="ml-1 hidden sm:inline">{t("disconnect.label")}</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[#E8E4DD]">{t("claude.title")}</h3>
                      <p className="mt-1 text-sm text-[#C4C0B6]">{t("claude.body")}</p>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      className="shrink-0 rounded-full bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C]"
                    >
                      <a
                        href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("claude.open")} <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase text-[#C4C0B6]/80">{t("claude.nameLabel")}</p>
                      <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] px-3 py-2 font-mono text-sm text-[#E8E4DD]">
                        {GHL_MCP_CONNECTOR_NAME}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase text-[#C4C0B6]/80">{t("claude.urlLabel")}</p>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1 truncate rounded-lg border border-[#3D3C36] bg-[#24231F] px-3 py-2 font-mono text-sm text-[#E8E4DD]">
                          {GHL_MCP_SERVER_URL}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={copyServerUrl}
                          className="shrink-0 rounded-lg border-[#3D3C36] text-[#C4C0B6] hover:bg-[#24231F]"
                          aria-label={t("claude.copyUrlAria")}
                        >
                          {serverUrlCopyOk ? (
                            <Check className="h-4 w-4 text-[#4CAF6E]" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                          <span className="ml-2 hidden sm:inline">
                            {serverUrlCopyOk ? t("claude.copied") : t("claude.copyUrl")}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[#C4C0B6]/70">{t("claude.note")}</p>
                </div>
              </div>
            )}
            <Button
              asChild
              size="lg"
              className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] hover:bg-[#3D9A5C]"
            >
              <Link
                href="/api/oauth/gohighlevel/start?next=/connect/gohighlevel"
                prefetch={false}
                target="_blank"
                rel="noopener noreferrer"
              >
                {status.connected ? t("connectAnother") : t("connect")}{" "}
                <ExternalLink className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <p className="text-xs text-[#C4C0B6]/60">{t("marketplaceNote")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
