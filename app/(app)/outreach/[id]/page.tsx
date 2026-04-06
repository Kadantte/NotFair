"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCampaignAction, updateCampaignStatusAction } from "../actions";

type CampaignData = NonNullable<Awaited<ReturnType<typeof getCampaignAction>>>;

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = Number(params.id);
  const [data, setData] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchData = useCallback(async () => {
    const result = await getCampaignAction(campaignId);
    if (result) setData(result);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh while active
  useEffect(() => {
    if (data?.campaign.status !== "active") return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [data?.campaign.status, fetchData]);

  async function toggleStatus() {
    if (!data) return;
    setToggling(true);
    const newStatus =
      data.campaign.status === "active" ? "paused" : "active";
    await updateCampaignStatusAction(campaignId, newStatus);
    await fetchData();
    setToggling(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#9B9689]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[#9B9689]">Campaign not found</p>
      </div>
    );
  }

  const { campaign, emails } = data;
  const total = emails.length;
  const sent = emails.filter(
    (e) => e.status === "sent" || e.status === "opened"
  ).length;
  const opened = emails.filter((e) => e.status === "opened").length;
  const failed = emails.filter((e) => e.status === "failed").length;
  const pending = emails.filter((e) => e.status === "pending").length;

  const statusIcon: Record<string, React.ReactNode> = {
    pending: <Clock className="h-3.5 w-3.5 text-[#9B9689]" />,
    sent: <CheckCircle2 className="h-3.5 w-3.5 text-[#4CAF6E]" />,
    opened: <Eye className="h-3.5 w-3.5 text-[#5DBE82]" />,
    failed: <XCircle className="h-3.5 w-3.5 text-[#C45D4A]" />,
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Back */}
        <Link
          href="/outreach"
          prefetch
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-[#9B9689] transition hover:text-[#E8E4DD]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to campaigns
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-['General_Sans'] text-2xl font-semibold text-[#E8E4DD]">
              {campaign.name}
            </h1>
            <p className="mt-1 text-[13px] text-[#9B9689]">
              {campaign.subject}
            </p>
          </div>
          <Button
            onClick={toggleStatus}
            disabled={toggling}
            className={
              campaign.status === "active"
                ? "gap-2 bg-[#D4882A] text-[#E8E4DD] hover:bg-[#C07B24]"
                : "gap-2 bg-[#4CAF6E] text-[#E8E4DD] hover:bg-[#3D9A5C]"
            }
          >
            {toggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : campaign.status === "active" ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {campaign.status === "active" ? "Pause" : "Start Sending"}
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: total, color: "text-[#E8E4DD]" },
            { label: "Sent", value: sent, color: "text-[#4CAF6E]" },
            { label: "Opened", value: opened, color: "text-[#5DBE82]" },
            { label: "Pending", value: pending, color: "text-[#9B9689]" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-4"
            >
              <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">
                {s.label}
              </div>
              <div
                className={`mt-1 font-['JetBrains_Mono'] text-2xl font-semibold ${s.color}`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {failed > 0 && (
          <div className="mb-4 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/5 px-4 py-3 text-[13px] text-[#C45D4A]">
            {failed} email{failed > 1 ? "s" : ""} failed to send
          </div>
        )}

        {/* Email list */}
        <div className="rounded-lg border border-[#3D3C36] bg-[#24231F]">
          <div className="border-b border-[#3D3C36] px-4 py-3">
            <h2 className="text-[13px] font-medium text-[#9B9689]">
              Recipients
            </h2>
          </div>
          <div className="divide-y divide-[#3D3C36]/50">
            {emails.map((email) => (
              <div
                key={email.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                {statusIcon[email.status]}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] text-[#E8E4DD]">
                      {email.contactEmail}
                    </span>
                    {email.contactFirstName && (
                      <span className="text-[12px] text-[#9B9689]">
                        {email.contactFirstName} {email.contactLastName}
                      </span>
                    )}
                  </div>
                  {email.error && (
                    <p className="mt-0.5 truncate text-[11px] text-[#C45D4A]">
                      {email.error}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {email.sentAt && (
                    <span className="font-['JetBrains_Mono'] text-[11px] text-[#9B9689]">
                      {new Date(email.sentAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
