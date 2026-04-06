"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Mail, Play, Pause, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCampaignsAction,
  updateCampaignStatusAction,
  deleteCampaignAction,
} from "./actions";

type Campaign = Awaited<ReturnType<typeof getCampaignsAction>>[number];

let cachedCampaigns: Campaign[] | null = null;

export default function OutreachPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(cachedCampaigns ?? []);
  const [loading, setLoading] = useState(!cachedCampaigns);
  const [actionId, setActionId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCampaigns = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    const data = await getCampaignsAction();
    setCampaigns(data);
    cachedCampaigns = data;
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCampaigns(!!cachedCampaigns);
  }, [fetchCampaigns]);

  async function toggleStatus(campaign: Campaign) {
    setActionId(campaign.id);
    const newStatus = campaign.status === "active" ? "paused" : "active";
    await updateCampaignStatusAction(campaign.id, newStatus);
    await fetchCampaigns(true);
    setActionId(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteCampaignAction(deleteTarget.id);
    await fetchCampaigns(true);
    setDeleting(false);
    setDeleteTarget(null);
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      draft: "bg-[#9B9689]/15 text-[#9B9689]",
      active: "bg-[#4CAF6E]/15 text-[#4CAF6E]",
      paused: "bg-[#D4882A]/15 text-[#D4882A]",
      completed: "bg-[#5DBE82]/15 text-[#5DBE82]",
    };
    return (
      <span
        className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${colors[status] || colors.draft}`}
      >
        {status}
      </span>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-['General_Sans'] text-2xl font-semibold text-[#E8E4DD]">
              Outreach
            </h1>
            <p className="mt-1 text-sm text-[#9B9689]">
              Send cold emails at scale
            </p>
          </div>
          <Link href="/outreach/new" prefetch>
            <Button className="gap-2 bg-[#4CAF6E] text-[#E8E4DD] hover:bg-[#3D9A5C]">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-[#9B9689]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && campaigns.length === 0 && (
          <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-12 text-center">
            <Mail className="mx-auto mb-4 h-10 w-10 text-[#9B9689]/40" />
            <p className="text-sm text-[#9B9689]">
              No campaigns yet. Create one to start sending.
            </p>
          </div>
        )}

        {/* Campaign list */}
        {!loading && campaigns.length > 0 && (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-4 transition hover:border-[#4CAF6E]/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <Link
                    href={`/outreach/${c.id}`}
                    prefetch
                    className="min-w-0 flex-1"
                  >
                    <div className="flex items-center gap-3">
                      <h3 className="truncate text-[15px] font-medium text-[#E8E4DD]">
                        {c.name}
                      </h3>
                      {statusBadge(c.status)}
                    </div>
                    <p className="mt-1 truncate text-[13px] text-[#9B9689]">
                      {c.subject}
                    </p>
                    {/* Stats */}
                    <div className="mt-3 flex gap-6 font-['JetBrains_Mono'] text-[12px] text-[#9B9689]">
                      <span>
                        {c.stats.sent}/{c.stats.total} sent
                      </span>
                      {Number(c.stats.opened) > 0 && (
                        <span className="text-[#4CAF6E]">
                          {c.stats.opened} opened
                        </span>
                      )}
                      {Number(c.stats.failed) > 0 && (
                        <span className="text-[#C45D4A]">
                          {c.stats.failed} failed
                        </span>
                      )}
                    </div>
                  </Link>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={actionId === c.id}
                      onClick={() => toggleStatus(c)}
                      className="text-[#9B9689] hover:text-[#E8E4DD]"
                    >
                      {actionId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : c.status === "active" ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={actionId === c.id}
                      onClick={() => setDeleteTarget(c)}
                      className="text-[#9B9689] hover:text-[#C45D4A]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="border-[#3D3C36] bg-[#24231F]">
          <DialogHeader>
            <DialogTitle className="text-[#E8E4DD]">Delete Campaign</DialogTitle>
            <DialogDescription className="text-[#9B9689]">
              This will permanently delete <span className="font-medium text-[#E8E4DD]">{deleteTarget?.name}</span> and
              all {deleteTarget?.stats.total} queued emails. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="border-[#3D3C36] text-[#9B9689] hover:text-[#E8E4DD]"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="gap-2 bg-[#C45D4A] text-[#E8E4DD] hover:bg-[#B54E3D]"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
