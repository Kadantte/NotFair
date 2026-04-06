"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getContactsAction,
  importContactsAction,
  createCampaignAction,
} from "../actions";

type Contact = Awaited<ReturnType<typeof getContactsAction>>[number];

export default function NewCampaignPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sendRate, setSendRate] = useState(50);

  const fetchContacts = useCallback(async () => {
    setLoadingContacts(true);
    const data = await getContactsAction();
    setContacts(data);
    setLoadingContacts(false);
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      setImporting(false);
      return;
    }

    // Parse header
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const emailIdx = header.findIndex((h) =>
      ["email", "e-mail", "email_address", "emailaddress"].includes(h)
    );
    const firstNameIdx = header.findIndex((h) =>
      ["first_name", "firstname", "first name", "name"].includes(h)
    );
    const lastNameIdx = header.findIndex((h) =>
      ["last_name", "lastname", "last name", "surname"].includes(h)
    );
    const companyIdx = header.findIndex((h) =>
      ["company", "organization", "org", "company_name"].includes(h)
    );

    if (emailIdx === -1) {
      alert('CSV must have an "email" column');
      setImporting(false);
      return;
    }

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return {
        email: cols[emailIdx] || "",
        firstName: firstNameIdx >= 0 ? cols[firstNameIdx] : undefined,
        lastName: lastNameIdx >= 0 ? cols[lastNameIdx] : undefined,
        company: companyIdx >= 0 ? cols[companyIdx] : undefined,
      };
    }).filter((r) => r.email && r.email.includes("@"));

    const result = await importContactsAction(rows);
    await fetchContacts();
    setImporting(false);
    alert(`Imported ${result.imported} contacts (${result.skipped} skipped)`);

    // Reset file input
    e.target.value = "";
  }

  function toggleAll() {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  }

  function toggleContact(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function handleCreate() {
    if (!name || !subject || !bodyHtml || !fromName || selectedIds.size === 0) {
      alert("Fill in all required fields and select at least one contact.");
      return;
    }

    setCreating(true);
    const campaign = await createCampaignAction({
      name,
      subject,
      bodyHtml,
      fromName,
      replyTo: replyTo || undefined,
      sendRate,
      contactIds: Array.from(selectedIds),
    });
    router.push(`/outreach/${campaign.id}`);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Back */}
        <Link
          href="/outreach"
          prefetch
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-[#9B9689] transition hover:text-[#E8E4DD]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to campaigns
        </Link>

        <h1 className="mb-8 font-['General_Sans'] text-2xl font-semibold text-[#E8E4DD]">
          New Campaign
        </h1>

        {/* Campaign details */}
        <div className="space-y-5">
          <div>
            <Label className="text-[#9B9689]">Campaign Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q2 Outreach"
              className="mt-1.5 border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] placeholder:text-[#9B9689]/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[#9B9689]">From Name *</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Tong Chen"
                className="mt-1.5 border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] placeholder:text-[#9B9689]/40"
              />
            </div>
            <div>
              <Label className="text-[#9B9689]">Reply-To</Label>
              <Input
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="tong@example.com"
                className="mt-1.5 border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] placeholder:text-[#9B9689]/40"
              />
            </div>
          </div>

          <div>
            <Label className="text-[#9B9689]">Subject Line *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick question about {{company}}"
              className="mt-1.5 border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] placeholder:text-[#9B9689]/40"
            />
            <p className="mt-1 text-[11px] text-[#9B9689]/60">
              Use {"{{firstName}}"}, {"{{lastName}}"}, {"{{company}}"}, {"{{email}}"} as variables
            </p>
          </div>

          <div>
            <Label className="text-[#9B9689]">Email Body (HTML) *</Label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={10}
              placeholder={`Hi {{firstName}},\n\nI noticed {{company}} is doing great work...\n\nBest,\nTong`}
              className="mt-1.5 w-full rounded-md border border-[#3D3C36] bg-[#24231F] px-3 py-2 text-[14px] text-[#E8E4DD] placeholder:text-[#9B9689]/40 focus:border-[#4CAF6E] focus:outline-none focus:ring-1 focus:ring-[#4CAF6E] font-['JetBrains_Mono']"
            />
          </div>

          <div>
            <Label className="text-[#9B9689]">Send Rate</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                type="number"
                value={sendRate}
                onChange={(e) => setSendRate(Number(e.target.value))}
                min={1}
                max={500}
                className="w-24 border-[#3D3C36] bg-[#24231F] text-[#E8E4DD]"
              />
              <span className="text-[13px] text-[#9B9689]">emails / hour</span>
            </div>
          </div>
        </div>

        {/* Contacts */}
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-['General_Sans'] text-lg font-semibold text-[#E8E4DD]">
              Select Contacts
            </h2>
            <label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                className="gap-2 border-[#3D3C36] text-[#9B9689] hover:text-[#E8E4DD]"
                asChild
              >
                <span>
                  {importing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Import CSV
                </span>
              </Button>
            </label>
          </div>

          {loadingContacts ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#9B9689]" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#3D3C36] p-8 text-center">
              <p className="text-sm text-[#9B9689]">
                No contacts yet. Upload a CSV with columns: email, first_name, last_name, company
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-[#3D3C36] bg-[#24231F]">
              {/* Select all header */}
              <div className="flex items-center gap-3 border-b border-[#3D3C36] px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={selectedIds.size === contacts.length}
                  onChange={toggleAll}
                  className="accent-[#4CAF6E]"
                />
                <span className="text-[12px] text-[#9B9689]">
                  {selectedIds.size} of {contacts.length} selected
                </span>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-[#3D3C36]/50">
                {contacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-[#E8E4DD]/3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="accent-[#4CAF6E]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] text-[#E8E4DD]">
                          {c.email}
                        </span>
                        {c.unsubscribed && (
                          <span className="shrink-0 rounded bg-[#C45D4A]/15 px-1.5 py-0.5 text-[10px] text-[#C45D4A]">
                            unsub
                          </span>
                        )}
                      </div>
                      {(c.firstName || c.company) && (
                        <span className="text-[12px] text-[#9B9689]">
                          {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                          {c.company && ` · ${c.company}`}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="mt-8 flex justify-end gap-3 pb-8">
          <Link href="/outreach" prefetch>
            <Button
              variant="outline"
              className="border-[#3D3C36] text-[#9B9689] hover:text-[#E8E4DD]"
            >
              Cancel
            </Button>
          </Link>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="gap-2 bg-[#4CAF6E] text-[#E8E4DD] hover:bg-[#3D9A5C]"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Campaign
          </Button>
        </div>
      </div>
    </div>
  );
}
