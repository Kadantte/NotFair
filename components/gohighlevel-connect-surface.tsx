'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/session';

const REQUESTED_SCOPES = [
  'locations.readonly',
  'contacts.readonly',
  'conversations.readonly',
  'conversations/message.readonly',
  'opportunities.readonly',
  'calendars.readonly',
  'calendars/events.readonly',
];

type Connection = {
  id: number;
  companyId: string | null;
  locationId: string | null;
  userType: string;
  companyName: string | null;
  locationName: string | null;
  scopes: string[];
  updatedAt: string;
};

type Status = {
  connected: boolean;
  connections: Connection[];
};

export function GoHighLevelConnectSurface({ session }: { session: Session }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/integrations/gohighlevel/status', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.ok ? res.json() : { connected: false, connections: [] })
      .then((data: Status) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false, connections: [] });
      });
    return () => { cancelled = true; };
  }, []);

  const canConnect = session.connected;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 py-8 text-left">
      <div className="space-y-4 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-4 py-2 text-sm font-medium text-[#4CAF6E]">
          <ShieldCheck className="h-4 w-4" /> CRM connector preview
        </div>
        <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Connect GoHighLevel</h2>
        <p className="mx-auto max-w-2xl text-lg text-[#C4C0B6]">
          Link agency or sub-account access so NotFair can read CRM context: contacts, conversations, opportunities, and calendar events.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[#3D3C36] bg-[#1A1917] p-5">
          <h3 className="text-base font-semibold text-[#E8E4DD]">Access requested</h3>
          <p className="mt-1 text-sm text-[#C4C0B6]">Read-only for the MVP. No contact edits, messages, or workflow changes.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {REQUESTED_SCOPES.map((scope) => (
              <span key={scope} className="rounded-full border border-[#3D3C36] bg-[#24231F] px-3 py-1 text-xs text-[#C4C0B6]">
                {scope}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#3D3C36] bg-[#1A1917] p-5">
          <h3 className="text-base font-semibold text-[#E8E4DD]">Connection model</h3>
          <ul className="mt-3 space-y-2 text-sm text-[#C4C0B6]">
            <li>• Supports agencies with multiple HighLevel locations.</li>
            <li>• Stores each connection by company/location identity.</li>
            <li>• Refresh-token rotation is handled server-side.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6 text-center">
        {!canConnect ? (
          <div className="space-y-3">
            <p className="font-medium text-[#E8E4DD]">Sign into NotFair first</p>
            <p className="text-sm text-[#C4C0B6]">Use the main connect flow first so the GoHighLevel connection has a NotFair user to attach to.</p>
            <Button asChild className="rounded-full bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C]">
              <a href="/connect">Sign in</a>
            </Button>
          </div>
        ) : status === null ? (
          <div className="flex items-center justify-center gap-2 text-sm text-[#C4C0B6]">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking GoHighLevel status…
          </div>
        ) : (
          <div className="space-y-5">
            {status.connected && (
              <div className="mx-auto max-w-2xl rounded-xl border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 p-4 text-left">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#4CAF6E]">
                  <CheckCircle2 className="h-4 w-4" /> GoHighLevel connected
                </div>
                <div className="mt-3 space-y-2">
                  {status.connections.map((connection) => (
                    <div key={connection.id} className="rounded-lg border border-[#3D3C36] bg-[#1A1917] p-3 text-sm text-[#C4C0B6]">
                      <div className="font-medium text-[#E8E4DD]">
                        {connection.locationName || connection.companyName || connection.locationId || connection.companyId || 'HighLevel connection'}
                      </div>
                      <div className="mt-1 text-xs text-[#C4C0B6]/80">
                        {connection.userType} · company {connection.companyId ?? 'unknown'}{connection.locationId ? ` · location ${connection.locationId}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button asChild size="lg" className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] hover:bg-[#3D9A5C]">
              <a href="/api/oauth/gohighlevel/start?next=/connect/gohighlevel">
                {status.connected ? 'Connect another HighLevel account' : 'Connect GoHighLevel'} <ExternalLink className="ml-2 h-5 w-5" />
              </a>
            </Button>
            <p className="text-xs text-[#C4C0B6]/60">You’ll be sent to the GoHighLevel Marketplace install flow.</p>
          </div>
        )}
      </div>
    </div>
  );
}
