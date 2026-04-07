'use client';

import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';

type ImpersonationState = {
  customerName: string;
  googleEmail: string | null;
  customerId: string;
};

export function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((session) => {
        if (session.connected && session.impersonating) {
          setState({
            customerName: session.customerName,
            googleEmail: session.googleEmail,
            customerId: session.customerId,
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!state) return null;

  async function stopImpersonating() {
    setStopping(true);
    try {
      await fetch('/api/dev/impersonate', { method: 'DELETE' });
      window.location.reload();
    } catch {
      setStopping(false);
    }
  }

  const label = state.customerName || state.googleEmail || state.customerId;

  return (
    <div className="sticky top-0 z-[60] flex h-9 items-center justify-between gap-3 bg-[#D4882A] px-4 text-[#1A1917]">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-[13px] font-medium">
          Viewing as <span className="font-semibold">{label}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={stopImpersonating}
        disabled={stopping}
        className="flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium transition hover:bg-[#1A1917]/15 disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        Stop
      </button>
    </div>
  );
}
