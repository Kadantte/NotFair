"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Save, Send, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DraftSaveResult = {
  gmailSynced: boolean;
  syncError: string | null;
};

export function DraftEditor({
  initialSubject,
  initialBody,
  hasGmailDraftId,
  canSend,
  onSave,
  onSend,
  onChanged,
}: {
  initialSubject: string;
  initialBody: string;
  hasGmailDraftId: boolean;
  canSend: boolean;
  onSave: (subject: string, body: string) => Promise<DraftSaveResult>;
  onSend: () => Promise<void>;
  onChanged?: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [savedSnapshot, setSavedSnapshot] = useState({
    subject: initialSubject,
    body: initialBody,
  });
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [syncedToGmail, setSyncedToGmail] = useState(hasGmailDraftId);
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync local state when parent hands us a new initial draft (e.g., after
  // expanding the panel for a different customer or after background reload).
  useEffect(() => {
    setSubject(initialSubject);
    setBody(initialBody);
    setSavedSnapshot({ subject: initialSubject, body: initialBody });
    setSyncedToGmail(hasGmailDraftId);
  }, [initialSubject, initialBody, hasGmailDraftId]);

  useEffect(() => {
    return () => {
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    };
  }, []);

  const dirty = subject !== savedSnapshot.subject || body !== savedSnapshot.body;

  function handleSave() {
    setError(null);
    startSave(async () => {
      try {
        const result = await onSave(subject, body);
        setSavedSnapshot({ subject, body });
        setJustSaved(true);
        setSyncedToGmail(result.gmailSynced);
        if (result.syncError) {
          setError(`Saved locally, but Gmail sync failed: ${result.syncError}`);
        }
        if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
        justSavedTimer.current = setTimeout(() => setJustSaved(false), 2000);
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleSend() {
    if (!canSend) return;
    if (dirty) {
      setError("Save your changes before sending.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required.");
      return;
    }
    if (!confirm("Send this email via Gmail?")) return;
    setError(null);
    startSend(async () => {
      try {
        await onSend();
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const busy = saving || sending;

  return (
    <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] p-4">
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-3 py-2 text-[12px] text-[#C45D4A]">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}
      <label className="block">
        <span className="text-[11px] text-[#C4C0B6] uppercase tracking-wider">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={busy}
          placeholder="Subject"
          className="mt-1 w-full rounded border border-[#3D3C36] bg-[#24231F] px-3 py-2 text-[14px] text-[#E8E4DD] font-medium outline-none focus:border-[#4CAF6E] disabled:opacity-60"
        />
      </label>
      <label className="block mt-3">
        <span className="text-[11px] text-[#C4C0B6] uppercase tracking-wider">Body</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          rows={12}
          placeholder="Write your message..."
          className="mt-1 w-full rounded border border-[#3D3C36] bg-[#24231F] px-3 py-2 text-[13px] text-[#E8E4DD]/90 font-sans leading-relaxed outline-none focus:border-[#4CAF6E] resize-y disabled:opacity-60"
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={busy || !dirty}
          className="gap-1.5 bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD] border border-[#3D3C36] h-8 text-[12px] px-3"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : justSaved ? (
            <Check className="h-3.5 w-3.5 text-[#4CAF6E]" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving" : justSaved ? "Saved" : "Save draft"}
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={busy || !canSend || dirty || !subject.trim() || !body.trim()}
          className="gap-1.5 bg-[#4CAF6E] text-[#E8E4DD] hover:bg-[#3D9A5C] h-8 text-[12px] px-3"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send via Gmail
        </Button>
        <span className="ml-auto text-[11px] text-[#C4C0B6]/70">
          {syncedToGmail ? "Synced to Gmail Drafts" : "Local draft only"}
        </span>
      </div>
    </div>
  );
}
