"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Facebook, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MetaAccount = {
  id: string;
  name?: string;
  currency?: string;
  timezone?: string;
  business_id?: string;
};

export type MetaConnection = {
  id: number;
  /** Curated subset NotFair is allowed to touch. */
  selectedAccountIds: MetaAccount[];
  /** Full Meta-side enumeration; used as the picker's universe. */
  availableAccountIds: MetaAccount[];
  /** Per-session default. Changed in the navbar account switcher, NOT here. */
  activeAccountId: string | null;
  fbUserName: string | null;
  fbUserEmail: string | null;
  accessTokenExpiresAt: string | null;
};

export function AddMetaAdsAccountPage({
  initialConnection,
  userEmail,
}: {
  initialConnection: MetaConnection | null;
  userEmail: string;
}) {
  const router = useRouter();
  const [connection, setConnection] = useState<MetaConnection | null>(initialConnection);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const handleConnect = useCallback(() => {
    window.location.href = "/api/oauth/meta/start?next=%2Fadd-meta-ads-account";
  }, []);

  const handleDisconnect = useCallback(async () => {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/disconnect-meta", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to disconnect");
        return;
      }
      setConnection(null);
      setConfirmDisconnect(false);
      router.refresh();
    } catch {
      setError("Network error — please retry.");
    } finally {
      setUpdating(false);
    }
  }, [router]);

  return (
    <section className="px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.16em] text-[#C4C0B6]">
            <span className="rounded-full border border-[#D89344]/40 bg-[#D89344]/10 px-2 py-0.5 text-[#D89344]">
              Dev preview
            </span>
            <span>signed in as {userEmail}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-[#E8E4DD]">Connect Meta Ads</h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
            Authorize NotFair to read and manage your Meta (Facebook + Instagram) ad accounts.
            Once connected, the Meta MCP at{" "}
            <code className="font-mono-jb text-[13px] text-[#E8E4DD]">/api/mcp/meta_ads</code> can
            be used by Claude.ai, Codex, and any other MCP client tied to your NotFair account.
            Switch which account you&apos;re working on from the navbar dropdown.
          </p>
          <p className="mt-2 text-sm text-[#C4C0B6]/70">
            Gated to dev emails until Meta App Review approves advanced access on{" "}
            <code className="font-mono-jb text-[12px]">ads_management</code>,{" "}
            <code className="font-mono-jb text-[12px]">ads_read</code>, and{" "}
            <code className="font-mono-jb text-[12px]">business_management</code>.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
            {error}
          </div>
        )}

        {!connection ? (
          <NotConnected onConnect={handleConnect} />
        ) : (
          <Connected
            connection={connection}
            updating={updating}
            setUpdating={setUpdating}
            setError={setError}
            onConnectionChange={setConnection}
            onReauthorize={handleConnect}
            confirmDisconnect={confirmDisconnect}
            onRequestDisconnect={() => setConfirmDisconnect(true)}
            onCancelDisconnect={() => setConfirmDisconnect(false)}
            onConfirmDisconnect={handleDisconnect}
          />
        )}
      </div>
    </section>
  );
}

function NotConnected({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/15">
          <Facebook className="h-6 w-6 text-[#1877F2]" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[#E8E4DD]">No Meta connection yet</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#C4C0B6]">
            Click below to grant NotFair access to your Meta Business Manager and ad accounts.
            You&apos;ll be redirected to Facebook to choose which assets to share, then back
            here to pick which ad accounts NotFair can manage.
          </p>
          <Button
            type="button"
            onClick={onConnect}
            className="mt-5 h-10 rounded-lg bg-[#1877F2] px-5 text-sm font-semibold text-white hover:bg-[#0F66D9]"
          >
            <Facebook className="mr-2 h-4 w-4" />
            Connect Meta
          </Button>
          <p className="mt-3 text-xs text-[#C4C0B6]/70">
            Permissions requested: <code className="font-mono-jb">ads_management</code>,{" "}
            <code className="font-mono-jb">ads_read</code>,{" "}
            <code className="font-mono-jb">business_management</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

function Connected({
  connection,
  updating,
  setUpdating,
  setError,
  onConnectionChange,
  onReauthorize,
  confirmDisconnect,
  onRequestDisconnect,
  onCancelDisconnect,
  onConfirmDisconnect,
}: {
  connection: MetaConnection;
  updating: boolean;
  setUpdating: (v: boolean) => void;
  setError: (v: string | null) => void;
  onConnectionChange: (c: MetaConnection) => void;
  onReauthorize: () => void;
  confirmDisconnect: boolean;
  onRequestDisconnect: () => void;
  onCancelDisconnect: () => void;
  onConfirmDisconnect: () => void;
}) {
  const [draftSelected, setDraftSelected] = useState<Set<string>>(
    () => new Set(connection.selectedAccountIds.map((a) => a.id)),
  );

  // If the upstream connection changes (e.g. re-OAuth refreshed available),
  // reset the draft to match.
  useEffect(() => {
    setDraftSelected(new Set(connection.selectedAccountIds.map((a) => a.id)));
  }, [connection]);

  const persistedSelectedIds = useMemo(
    () => new Set(connection.selectedAccountIds.map((a) => a.id)),
    [connection.selectedAccountIds],
  );

  const isDirty = useMemo(() => {
    if (draftSelected.size !== persistedSelectedIds.size) return true;
    for (const id of draftSelected) if (!persistedSelectedIds.has(id)) return true;
    return false;
  }, [draftSelected, persistedSelectedIds]);

  const expiresInDays = connection.accessTokenExpiresAt
    ? Math.max(
        0,
        Math.floor(
          (new Date(connection.accessTokenExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      )
    : null;
  const expiringSoon = expiresInDays !== null && expiresInDays < 7;

  const toggleAccount = useCallback((id: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setDraftSelected(new Set(connection.availableAccountIds.map((a) => a.id)));
  }, [connection.availableAccountIds]);

  const handleSelectNone = useCallback(() => {
    setDraftSelected(new Set());
  }, []);

  const handleSave = useCallback(async () => {
    setUpdating(true);
    setError(null);
    const selectedIds = Array.from(draftSelected);
    try {
      const res = await fetch("/api/auth/update-meta-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        setError(body.error_description ?? body.error ?? "Failed to save");
        return;
      }
      const newSelected = connection.availableAccountIds.filter((a) => draftSelected.has(a.id));
      onConnectionChange({
        ...connection,
        selectedAccountIds: newSelected,
        // Server may have re-defaulted active to first selected if the
        // previously-active account got unchecked. Reflect that.
        activeAccountId: body.activeAccountId ?? null,
      });
    } catch {
      setError("Network error — please retry.");
    } finally {
      setUpdating(false);
    }
  }, [draftSelected, connection, setUpdating, setError, onConnectionChange]);

  const handleReset = useCallback(() => {
    setDraftSelected(new Set(connection.selectedAccountIds.map((a) => a.id)));
  }, [connection]);

  const accounts = connection.availableAccountIds;
  const selectedCount = draftSelected.size;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#4CAF6E]/30 bg-[#4CAF6E]/[0.06] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#4CAF6E]/15">
            <Check className="h-6 w-6 text-[#4CAF6E]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[#E8E4DD]">Connected to Meta</h2>
            <p className="mt-1 text-sm text-[#C4C0B6]">
              {connection.fbUserName ? `${connection.fbUserName} · ` : ""}
              {accounts.length} ad {accounts.length === 1 ? "account" : "accounts"} available,{" "}
              {connection.selectedAccountIds.length} linked.
            </p>
            {expiresInDays !== null && (
              <p
                className={`mt-2 inline-flex items-center gap-1.5 text-xs ${
                  expiringSoon ? "text-[#D89344]" : "text-[#C4C0B6]/70"
                }`}
              >
                {expiringSoon && <AlertTriangle className="h-3.5 w-3.5" />}
                Token {expiresInDays > 0 ? `expires in ${expiresInDays} days` : "expired"}.{" "}
                {expiringSoon && (
                  <button
                    type="button"
                    onClick={onReauthorize}
                    className="underline-offset-2 hover:underline"
                  >
                    Re-authorize
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6">
        <h3 className="text-base font-semibold text-[#E8E4DD]">
          Choose which ad accounts NotFair can access
        </h3>
        <p className="mt-1 text-sm text-[#C4C0B6]">
          Check the accounts you want NotFair to manage. Re-authorize Meta if your account list
          has changed.
        </p>

        {accounts.length === 0 ? (
          <div className="mt-4 rounded-lg border border-[#D89344]/40 bg-[#D89344]/10 px-4 py-3 text-sm text-[#D89344]">
            We didn&apos;t find any Meta ad accounts you can manage. Make sure the Meta account you
            signed in with has access to a Business Manager or a direct ad account, then{" "}
            <button type="button" onClick={onReauthorize} className="underline">
              try connecting again
            </button>
            .
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={updating || selectedCount === accounts.length}
                className="rounded-md border border-[#3D3C36] bg-[#1A1917] px-2.5 py-1 text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD] disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleSelectNone}
                disabled={updating || selectedCount === 0}
                className="rounded-md border border-[#3D3C36] bg-[#1A1917] px-2.5 py-1 text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD] disabled:opacity-50"
              >
                Select none
              </button>
              <span className="text-[#C4C0B6]/70">
                {selectedCount} of {accounts.length} selected
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {accounts.map((account) => {
                const isSelected = draftSelected.has(account.id);
                return (
                  <label
                    key={account.id}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition cursor-pointer ${
                      isSelected
                        ? "border-[#3D3C36] bg-[#1A1917]"
                        : "border-[#3D3C36] bg-[#1A1917]/50 opacity-70 hover:opacity-100"
                    } ${updating ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAccount(account.id)}
                      disabled={updating}
                      className="h-4 w-4 shrink-0 rounded border-[#3D3C36] bg-[#1A1917] accent-[#4CAF6E]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[#E8E4DD]">
                        {account.name || `Ad Account ${account.id}`}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[#C4C0B6]">
                        <code className="font-mono-jb">act_{account.id}</code>
                        {account.currency && <span>· {account.currency}</span>}
                        {account.timezone && <span>· {account.timezone}</span>}
                        {account.business_id && (
                          <span>
                            · BM <code className="font-mono-jb">{account.business_id}</code>
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-[#3D3C36] pt-4">
              {isDirty && (
                <span className="mr-auto text-xs text-[#D89344]">Unsaved changes</span>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                disabled={updating || !isDirty}
                className="h-9 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-4 text-sm text-[#C4C0B6] hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
              >
                Reset
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={updating || !isDirty}
                className="h-9 rounded-lg bg-[#4CAF6E] px-5 text-sm font-semibold text-[#1A1917] hover:bg-[#3D9A5C]"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save selection"}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6">
        <h3 className="text-base font-semibold text-[#E8E4DD]">Manage</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onReauthorize}
            disabled={updating}
            className="h-9 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-4 text-sm text-[#C4C0B6] hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
          >
            Re-authorize Meta
          </Button>
          {!confirmDisconnect ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onRequestDisconnect}
              disabled={updating}
              className="h-9 rounded-lg border border-[#C45D4A]/30 bg-transparent px-4 text-sm text-[#C45D4A] hover:bg-[#C45D4A]/10"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-3 py-2">
              <span className="text-sm text-[#C45D4A]">
                Disconnect this Meta connection? Tokens will be invalidated.
              </span>
              <Button
                type="button"
                onClick={onConfirmDisconnect}
                disabled={updating}
                className="h-8 rounded-md bg-[#C45D4A] px-3 text-xs font-semibold text-white hover:bg-[#B54E3D]"
              >
                {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onCancelDisconnect}
                disabled={updating}
                className="h-8 rounded-md px-3 text-xs text-[#C4C0B6]"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
