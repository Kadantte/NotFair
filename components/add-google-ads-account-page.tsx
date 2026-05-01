"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertTriangle, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export type GoogleAccount = {
  id: string;
  name: string;
  loginCustomerId?: string;
  loginCustomerName?: string;
};

export function AddGoogleAdsAccountPage({
  userEmail,
  userId: _userId,
  availableAccounts,
  selectedAccounts,
  activeCustomerId,
  enumerationError,
}: {
  userEmail: string;
  userId: string | null;
  availableAccounts: GoogleAccount[];
  selectedAccounts: GoogleAccount[];
  activeCustomerId: string | null;
  enumerationError: string | null;
}) {
  const router = useRouter();

  const [draftSelected, setDraftSelected] = useState<Set<string>>(
    () => new Set(selectedAccounts.map((a) => a.id)),
  );
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(enumerationError);

  useEffect(() => {
    setDraftSelected(new Set(selectedAccounts.map((a) => a.id)));
  }, [selectedAccounts]);

  const persistedIds = useMemo(
    () => new Set(selectedAccounts.map((a) => a.id)),
    [selectedAccounts],
  );

  const isDirty = useMemo(() => {
    if (draftSelected.size !== persistedIds.size) return true;
    for (const id of draftSelected) if (!persistedIds.has(id)) return true;
    return false;
  }, [draftSelected, persistedIds]);

  const toggleAccount = useCallback((id: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setDraftSelected(new Set(availableAccounts.map((a) => a.id)));
  }, [availableAccounts]);

  const handleSelectNone = useCallback(() => {
    setDraftSelected(new Set());
  }, []);

  const handleAddAccount = useCallback(() => {
    // /api/auth/add-account triggers Google OAuth with prompt=select_account
    // so the user can sign into a different Google account, then bounces
    // through /connect?mode=update where they pick the subset.
    window.location.href = "/api/auth/add-account";
  }, []);

  const handleSave = useCallback(async () => {
    setUpdating(true);
    setError(null);
    const accounts = availableAccounts
      .filter((a) => draftSelected.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        ...(a.loginCustomerId ? { loginCustomerId: a.loginCustomerId } : {}),
      }));
    if (accounts.length === 0) {
      setError("Pick at least one ad account.");
      setUpdating(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/select-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts, next: "/add-google-ads-account" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        setError(body.error ?? "Failed to save");
        return;
      }
      // Server may have rotated the active customer or redirected; refresh
      // the server-rendered page so it shows the new persisted state.
      router.refresh();
    } catch {
      setError("Network error — please retry.");
    } finally {
      setUpdating(false);
    }
  }, [draftSelected, availableAccounts, router]);

  const handleReset = useCallback(() => {
    setDraftSelected(new Set(selectedAccounts.map((a) => a.id)));
  }, [selectedAccounts]);

  const accounts = availableAccounts;
  const selectedCount = draftSelected.size;

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
          <h1 className="mt-3 text-3xl font-bold text-[#E8E4DD]">Add Google Ads Account</h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
            Manage which Google Ads accounts NotFair is allowed to access. The Google MCP at{" "}
            <code className="font-mono-jb text-[13px] text-[#E8E4DD]">/api/mcp/google_ads</code>{" "}
            (and the legacy <code className="font-mono-jb text-[13px] text-[#E8E4DD]">/api/mcp</code>)
            target the accounts you select here. Switch which account you&apos;re working on from
            the navbar dropdown.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#4CAF6E]/30 bg-[#4CAF6E]/[0.06] p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#4CAF6E]/15">
                <Check className="h-6 w-6 text-[#4CAF6E]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-[#E8E4DD]">Connected to Google</h2>
                <p className="mt-1 text-sm text-[#C4C0B6]">
                  {accounts.length} ad {accounts.length === 1 ? "account" : "accounts"} available,{" "}
                  {selectedAccounts.length} linked.
                  {activeCustomerId && (
                    <>
                      {" "}Active: <code className="font-mono-jb text-[12px] text-[#E8E4DD]">{activeCustomerId}</code>.
                    </>
                  )}
                </p>
              </div>
              <Button
                type="button"
                onClick={handleAddAccount}
                disabled={updating}
                className="h-9 shrink-0 rounded-lg bg-[#4CAF6E] px-4 text-sm font-semibold text-[#1A1917] hover:bg-[#3D9A5C]"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add another Google account
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6">
            <h3 className="text-base font-semibold text-[#E8E4DD]">
              Choose which ad accounts NotFair can access
            </h3>
            <p className="mt-1 text-sm text-[#C4C0B6]">
              Check the accounts you want NotFair to manage. Click &ldquo;Add another Google
              account&rdquo; above to sign into a different Google account and link more.
            </p>

            {accounts.length === 0 ? (
              <div className="mt-4 rounded-lg border border-[#D89344]/40 bg-[#D89344]/10 px-4 py-3 text-sm text-[#D89344]">
                {enumerationError
                  ? "We couldn't enumerate your Google ad accounts. Try re-authorizing or contact support."
                  : "No Google ad accounts found. Click \"Add another Google account\" above to link one."}
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
                    const isActive = account.id === activeCustomerId;
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
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-[#E8E4DD]">
                              {account.name}
                            </span>
                            {isActive && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#4CAF6E]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E]">
                                <Check className="h-2.5 w-2.5" /> active
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-[#C4C0B6]">
                            <code className="font-mono-jb">{account.id}</code>
                            {account.loginCustomerName && (
                              <span>· via manager {account.loginCustomerName}</span>
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

          {enumerationError && (
            <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#D89344]" />
                <div>
                  <h3 className="text-sm font-semibold text-[#E8E4DD]">
                    Couldn&apos;t enumerate Google accounts
                  </h3>
                  <p className="mt-1 text-sm text-[#C4C0B6]">
                    {enumerationError}. Try refreshing the page, or click &ldquo;Add another
                    Google account&rdquo; above to re-authorize.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
