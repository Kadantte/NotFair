"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { saveSharedContextAction } from "@/server/actions/shared-context";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";

/**
 * Shared workspace context (PROJECT.md): rendered markdown at rest, raw
 * markdown while editing. Saving pushes the new brief into every goal
 * agent's identity immediately — same path the agents' own
 * `set_shared_context` tool uses.
 */
export function SharedContextEditor({
  projectSlug,
  initialContent,
}: {
  projectSlug: string;
  initialContent: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(initialContent);
  const [content, setContent] = useState(initialContent);
  // Nothing written yet → straight into edit mode.
  const [editing, setEditing] = useState(initialContent.trim() === "");
  const dirty = content.trim() !== saved.trim();

  function save() {
    startTransition(async () => {
      const r = await saveSharedContextAction({
        project_slug: projectSlug,
        content,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.synced_agents > 0
          ? `Saved — synced to ${r.synced_agents} goal agent${r.synced_agents === 1 ? "" : "s"}.`
          : "Saved.",
      );
      setSaved(content);
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-[14px] bg-[hsl(var(--notfair-surface-2)/0.5)] px-5 py-4">
          <Markdown>{saved}</Markdown>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 text-[12px] text-[hsl(var(--notfair-ink-4))]">
            Shared with every goal agent — they update it too when they learn
            something workspace-wide.
          </p>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={pending}
        spellCheck={false}
        autoFocus
        className="min-h-[420px] w-full resize-y rounded-[14px] bg-[hsl(var(--notfair-surface-2))] px-4 py-3.5 font-mono text-[12.5px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--notfair-accent))]"
        placeholder={
          "# Company\nWhat you sell, to whom, and what matters…\n\nAgents usually write this during their first goal's intake — but you know the business best. Anything here reaches every goal agent."
        }
      />
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[12px] text-[hsl(var(--notfair-ink-4))]">
          Raw markdown — rendered once saved. Keep it a curated brief, not a
          dump.
        </p>
        <div className="flex items-center gap-2">
          {saved.trim() !== "" && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setContent(saved);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          )}
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save & sync"}
          </Button>
        </div>
      </div>
    </div>
  );
}
