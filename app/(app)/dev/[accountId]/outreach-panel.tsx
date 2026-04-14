"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCustomerOutreachAction,
  saveDraftForCustomerAction,
  sendDraftForCustomerAction,
  type CustomerOutreachState,
} from "../../outreach/actions";
import { DraftEditor } from "../contacts/[id]/draft-editor";
import { ThreadCard, formatDateTime } from "@/components/outreach/thread-card";

const STORAGE_PREFIX = "outreach-panel:expanded:";

function storageKey(email: string): string {
  return `${STORAGE_PREFIX}${email.toLowerCase()}`;
}

function readExpanded(email: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(email)) === "1";
  } catch {
    return false;
  }
}

function writeExpanded(email: string, expanded: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (expanded) window.localStorage.setItem(storageKey(email), "1");
    else window.localStorage.removeItem(storageKey(email));
  } catch {
    /* storage unavailable (private mode, quota) — collapse state resets per visit */
  }
}

/**
 * Inline reach-out surface on the customer detail page. Collapsed by default
 * so browsing customers does zero DB writes and zero Gmail API calls; opens
 * on click, lazy-loads state, and remembers the open state per-customer in
 * localStorage so repeated visits feel instant.
 *
 * Set `alwaysOpen` for a layout where the panel is the primary surface (e.g.,
 * the two-column command center). In that mode the toggle button is hidden,
 * state is loaded immediately, and localStorage is bypassed.
 */
export function OutreachPanel({ email, alwaysOpen = false }: { email: string; alwaysOpen?: boolean }) {
  const [expanded, setExpanded] = useState(alwaysOpen);
  const [state, setState] = useState<CustomerOutreachState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError(null);
      try {
        const next = await getCustomerOutreachAction(email);
        setState(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [email],
  );

  // On mount / email change: load immediately if alwaysOpen, otherwise restore
  // collapse state for this customer.
  useEffect(() => {
    setState(null);
    setError(null);
    if (alwaysOpen) {
      setExpanded(true);
      load();
      return;
    }
    const wasOpen = readExpanded(email);
    setExpanded(wasOpen);
    if (wasOpen) load();
  }, [email, load, alwaysOpen]);

  const toggle = useCallback(() => {
    if (alwaysOpen) return;
    setExpanded((prev) => {
      const next = !prev;
      writeExpanded(email, next);
      if (next && !state && !loading) {
        // Fire lazy load without awaiting — the loading spinner will show.
        void load();
      }
      return next;
    });
  }, [email, load, loading, state, alwaysOpen]);

  const handleSave = useCallback(
    async (subject: string, body: string) => {
      const result = await saveDraftForCustomerAction(email, subject, body);
      return { gmailSynced: result.gmailSynced, syncError: result.syncError };
    },
    [email],
  );

  const handleSend = useCallback(async () => {
    await sendDraftForCustomerAction(email);
  }, [email]);

  const HeaderInner = (
    <>
      <span className="shrink-0 rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 p-1.5">
        <Mail className="w-4 h-4 text-[#4CAF6E]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-[#E8E4DD]">Reach out</div>
        <div className="text-[11px] text-[#C4C0B6] font-mono truncate">{email}</div>
      </div>
      {state && state.lastContactedAt && (
        <span className="hidden sm:inline text-[11px] text-[#C4C0B6]/70">
          last contact {formatDateTime(new Date(state.lastContactedAt))}
        </span>
      )}
      {state && state.threads.length > 0 && (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-[#C4C0B6] bg-[#3D3C36]">
          {state.threads.length} thread{state.threads.length === 1 ? "" : "s"}
        </span>
      )}
      {!alwaysOpen && (expanded ? (
        <ChevronDown className="w-4 h-4 text-[#C4C0B6] shrink-0" />
      ) : (
        <ChevronRight className="w-4 h-4 text-[#C4C0B6] shrink-0" />
      ))}
    </>
  );

  return (
    <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
      {alwaysOpen ? (
        <div className="w-full flex items-center gap-3 px-4 py-3">{HeaderInner}</div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#24231F]/70 transition-colors text-left"
          aria-expanded={expanded}
        >
          {HeaderInner}
        </button>
      )}

      {expanded && (
        <div className="border-t border-[#3D3C36] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#C4C0B6] uppercase tracking-wider">
              Gmail draft + thread history
            </span>
            <Button
              type="button"
              onClick={() => load(true)}
              disabled={loading}
              variant="outline"
              size="sm"
              className="gap-1.5 border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] h-7 text-[11px] px-2"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loading && !state && (
            <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] px-4 py-6 text-[13px] text-[#C4C0B6] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading outreach…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-4 py-3 text-[13px] text-[#C45D4A] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {state && (
            <>
              <DraftEditor
                key={email}
                initialSubject={state.draftSubject}
                initialBody={state.draftBody}
                hasGmailDraftId={state.hasGmailDraftId}
                canSend={state.canSend}
                onSave={handleSave}
                onSend={handleSend}
                onChanged={() => load(true)}
              />

              {!state.gmailConfigured && (
                <div className="rounded-lg border border-[#D4882A]/40 bg-[#D4882A]/10 px-4 py-3 text-[13px] text-[#D4882A] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    Gmail not configured. Set{" "}
                    <code className="font-mono text-[12px]">GMAIL_REFRESH_TOKEN</code> to
                    load thread history and send via Gmail.
                  </div>
                </div>
              )}
              {state.gmailError && (
                <div className="rounded-lg border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-4 py-3 text-[13px] text-[#C45D4A] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>Failed to load Gmail threads: {state.gmailError}</div>
                </div>
              )}

              {state.gmailConfigured && !state.gmailError && (
                <div>
                  <h3 className="text-[11px] text-[#C4C0B6] uppercase tracking-wider mb-2">
                    Email thread
                  </h3>
                  {state.threads.length === 0 ? (
                    <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] px-4 py-6 text-[13px] text-[#C4C0B6] text-center">
                      No Gmail threads with {state.email} yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {state.threads.map((t) => (
                        <ThreadCard key={t.id} thread={t} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
