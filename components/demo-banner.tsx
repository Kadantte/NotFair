'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { DEMO_CUSTOMER_ID } from '@/lib/demo/constants';

/**
 * Sticky banner that renders at the top of the app shell whenever the current
 * session is a demo session. Pulls the session from /api/auth/session so it
 * doesn't have to be threaded through from the server layout.
 */
export function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((session) => {
        if (cancelled) return;
        setIsDemo(
          Boolean(
            session?.connected &&
              typeof session.customerId === 'string' &&
              session.customerId === DEMO_CUSTOMER_ID,
          ),
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!isDemo) return null;

  async function exitDemo() {
    if (exiting) return;
    setExiting(true);
    trackEvent('demo_mode_exited');
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore — cookies get cleared by route; we redirect below anyway.
    }
    window.location.assign('/connect');
  }

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-b border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-4 py-2 text-[12px] text-[#E8E4DD]">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#4CAF6E]" />
      <span className="text-[#C4C0B6]">
        You&apos;re in <strong className="text-[#E8E4DD]">demo mode</strong> — data is simulated and changes aren&apos;t saved.
      </span>
      <Link
        href="/connect"
        prefetch
        onClick={() => trackEvent('demo_connect_cta_clicked')}
        className="inline-flex items-center gap-1 rounded-full border border-[#4CAF6E]/40 bg-[#4CAF6E]/20 px-3 py-0.5 text-[11px] font-semibold text-[#4CAF6E] transition-colors hover:bg-[#4CAF6E]/30"
      >
        Connect real account
        <ArrowRight className="h-3 w-3" />
      </Link>
      <button
        type="button"
        onClick={exitDemo}
        disabled={exiting}
        className="inline-flex items-center gap-1 text-[11px] text-[#C4C0B6] underline-offset-2 hover:text-[#E8E4DD] hover:underline disabled:opacity-50"
      >
        {exiting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        Exit demo
      </button>
    </div>
  );
}
