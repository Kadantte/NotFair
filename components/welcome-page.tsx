'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startGoogleConnect } from '@/lib/google-oauth';
import { trackEvent } from '@/lib/analytics';

type WelcomePageProps = {
    googleEmail: string | null;
};

/**
 * One row in the platform list. New platforms (Meta, TikTok, etc.) get a
 * card by appending an entry; the page layout doesn't have to change.
 *
 * `enabled: false` keeps a platform in the source for visibility but hides
 * the row — used while a connector is built but not yet ready to ship.
 */
type Platform = {
    id: string;
    label: string;
    description: string;
    /** Click handler returning a promise (for OAuth bounces) or void (for nav). */
    onConnect: () => void | Promise<void>;
    /** CTA label, optionally pending-aware. */
    ctaLabel: string | ((pending: boolean) => string);
    /** Hex color for the CTA button. Defaults to brand green. */
    accent?: string;
    enabled: boolean;
};

export function WelcomePage({ googleEmail }: WelcomePageProps) {
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    async function startGoogleAds() {
        setPending('google-ads');
        setError(null);
        try {
            trackEvent('welcome_connect_clicked', { platform: 'google-ads' });
            await startGoogleConnect('/connect', { prompt: 'select_account consent' });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start Google sign-in.');
            setPending(null);
        }
    }

    const platforms: Platform[] = [
        {
            id: 'google-ads',
            label: 'Connect Google Ads',
            description:
                "Sign in with a Google account that has Google Ads access. If the current account isn't right, switch to one that is.",
            onConnect: startGoogleAds,
            ctaLabel: (isPending) => (isPending ? 'Redirecting…' : 'Use a different Google account'),
            enabled: true,
        },
        // Meta lives behind enabled:false until the onboarding flow is ready.
        // Flip the flag to surface the row.
        {
            id: 'meta-ads',
            label: 'Connect Meta Ads',
            description: 'Manage Facebook and Instagram campaigns from NotFair.',
            onConnect: () => {
                window.location.href = '/api/oauth/meta/start?next=%2Fmanage-ads-accounts%2Fmeta-ads';
            },
            ctaLabel: (isPending) => (isPending ? 'Redirecting…' : 'Connect Meta'),
            accent: '#1877F2',
            enabled: false,
        },
    ];

    const visiblePlatforms = platforms.filter((p) => p.enabled);

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-12">
                <div className="mx-auto max-w-2xl">
                    <div className="rounded-2xl border border-[#D4882A]/40 bg-[#D4882A]/10 p-8">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#D4882A]/20">
                                <AlertTriangle className="h-6 w-6 text-[#D4882A]" />
                            </div>
                            <div className="space-y-3">
                                <h1 className="text-2xl font-bold text-[#E8E4DD] md:text-3xl">
                                    No ad platform connected
                                </h1>
                                {googleEmail ? (
                                    <p className="text-base leading-relaxed text-[#C4C0B6]">
                                        We didn&apos;t find any Google Ads accounts on{' '}
                                        <span className="font-medium text-[#E8E4DD]">{googleEmail}</span>.
                                        NotFair needs at least one ad platform connected to read your campaigns and make changes for you.
                                    </p>
                                ) : (
                                    <p className="text-base leading-relaxed text-[#C4C0B6]">
                                        We didn&apos;t find any ad platform connected to this account.
                                        NotFair needs at least one ad platform connected to read your campaigns and make changes for you.
                                    </p>
                                )}
                            </div>
                        </div>

                        {error && (
                            <div className="mt-6 ml-15 rounded-lg border border-[#D4882A]/40 bg-[#1A1917]/40 p-3 text-sm text-[#D4882A]">
                                {error}
                            </div>
                        )}

                        <div className="mt-7 ml-15 space-y-3">
                            {visiblePlatforms.map((p) => {
                                const isPending = pending === p.id;
                                const label = typeof p.ctaLabel === 'function' ? p.ctaLabel(isPending) : p.ctaLabel;
                                const accent = p.accent ?? '#4CAF6E';
                                return (
                                    <div key={p.id} className="space-y-2">
                                        <p className="text-sm leading-relaxed text-[#C4C0B6]">{p.description}</p>
                                        <Button
                                            size="lg"
                                            onClick={() => void p.onConnect()}
                                            disabled={isPending}
                                            style={{ backgroundColor: accent }}
                                            className="h-12 rounded-full px-7 text-base font-semibold text-[#1A1917] hover:brightness-110 disabled:opacity-60"
                                        >
                                            {label}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
