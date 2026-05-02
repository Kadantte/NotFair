"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManageAdsAccountsShell } from "@/components/manage-ads-accounts-shell";

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
}: {
  initialConnection: MetaConnection | null;
}) {
  const [connection, setConnection] = useState<MetaConnection | null>(initialConnection);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(() => {
    window.location.href = "/api/oauth/meta/start?next=%2Fmanage-ads-accounts%2Fmeta-ads";
  }, []);

  return (
    <ManageAdsAccountsShell error={error}>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[#E8E4DD]">Connect Meta Ads</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
          Authorize NotFair to read and manage your Meta (Facebook + Instagram) ad accounts.
          Once connected, the Meta MCP at{" "}
          <code className="font-mono-jb text-[13px] text-[#E8E4DD]">/api/mcp/meta_ads</code> can
          be used by Claude.ai, Codex, and any other MCP client tied to your NotFair account.
          Switch which account you&apos;re working on from the navbar dropdown.
        </p>
      </header>

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
        />
      )}
    </ManageAdsAccountsShell>
  );
}

function MetaMonoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M6.897 4c1.915 0 3.516.932 5.43 3.376l.282-.373c.19-.246.383-.484.58-.71l.313-.35C14.588 4.788 15.792 4 17.225 4c1.273 0 2.469.557 3.491 1.516l.218.213c1.73 1.765 2.917 4.71 3.053 8.026l.011.392.002.25c0 1.501-.28 2.759-.818 3.7l-.14.23-.108.153c-.301.42-.664.758-1.086 1.009l-.265.142-.087.04a3.493 3.493 0 01-.302.118 4.117 4.117 0 01-1.33.208c-.524 0-.996-.067-1.438-.215-.614-.204-1.163-.56-1.726-1.116l-.227-.235c-.753-.812-1.534-1.976-2.493-3.586l-1.43-2.41-.544-.895-1.766 3.13-.343.592C7.597 19.156 6.227 20 4.356 20c-1.21 0-2.205-.42-2.936-1.182l-.168-.184c-.484-.573-.837-1.311-1.043-2.189l-.067-.32a8.69 8.69 0 01-.136-1.288L0 14.468c.002-.745.06-1.49.174-2.23l.1-.573c.298-1.53.828-2.958 1.536-4.157l.209-.34c1.177-1.83 2.789-3.053 4.615-3.16L6.897 4zm-.033 2.615l-.201.01c-.83.083-1.606.673-2.252 1.577l-.138.199-.01.018c-.67 1.017-1.185 2.378-1.456 3.845l-.004.022a12.591 12.591 0 00-.207 2.254l.002.188c.004.18.017.36.04.54l.043.291c.092.503.257.908.486 1.208l.117.137c.303.323.698.492 1.17.492 1.1 0 1.796-.676 3.696-3.641l2.175-3.4.454-.701-.139-.198C9.11 7.3 8.084 6.616 6.864 6.616zm10.196-.552l-.176.007c-.635.048-1.223.359-1.82.933l-.196.198c-.439.462-.887 1.064-1.367 1.807l.266.398c.18.274.362.56.55.858l.293.475 1.396 2.335.695 1.114c.583.926 1.03 1.6 1.408 2.082l.213.262c.282.326.529.54.777.673l.102.05c.227.1.457.138.718.138.176.002.35-.023.518-.073.338-.104.61-.32.813-.637l.095-.163.077-.162c.194-.459.29-1.06.29-1.785l-.006-.449c-.08-2.871-.938-5.372-2.2-6.798l-.176-.189c-.67-.683-1.444-1.074-2.27-1.074z" />
    </svg>
  );
}

function NotConnected({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/15">
          <Image src="/meta-icon.svg" alt="" width={24} height={24} aria-hidden="true" />
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
            <MetaMonoIcon className="mr-2 h-4 w-4" />
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
}: {
  connection: MetaConnection;
  updating: boolean;
  setUpdating: (v: boolean) => void;
  setError: (v: string | null) => void;
  onConnectionChange: (c: MetaConnection) => void;
  onReauthorize: () => void;
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
    </div>
  );
}
