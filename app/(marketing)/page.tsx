'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/session-provider';
import { startGoogleConnect } from '@/lib/google-oauth';

const CYCLING_WORDS = ['Claude', 'ChatGPT', 'OpenClaw', 'AI agent'];
const CYCLE_INTERVAL_MS = 2000;

export default function Home() {
    const session = useSession();
    const [wordIndex, setWordIndex] = useState(0);

    useEffect(() => {
        const id = setInterval(() => {
            setWordIndex(i => (i + 1) % CYCLING_WORDS.length);
        }, CYCLE_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

    async function handleCTA() {
        if (session.connected) {
            window.location.assign('/connect');
        } else {
            try {
                await startGoogleConnect('/connect');
            } catch {
                window.location.assign('/login?error=auth_failed');
            }
        }
    }

    return (
        <section className="relative flex flex-col items-center justify-center min-h-[90vh] pt-10 pb-20 px-4 overflow-hidden">

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="z-10 flex flex-col items-center max-w-3xl mx-auto text-center space-y-8"
            >
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight drop-shadow-2xl leading-[1.0]">
                    <span className="block text-[#E8E4DD]">Let your</span>
                    <span className="block h-[1.05em] overflow-hidden">
                        <AnimatePresence mode="wait">
                            <motion.span
                                key={wordIndex}
                                initial={{ opacity: 0, y: '100%' }}
                                animate={{ opacity: 1, y: '0%' }}
                                exit={{ opacity: 0, y: '-100%' }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                className="block text-[#4CAF6E]"
                            >
                                {CYCLING_WORDS[wordIndex]}
                            </motion.span>
                        </AnimatePresence>
                    </span>
                    <span className="block text-[#E8E4DD]">manage your ads</span>
                </h1>

                <p className="text-[#9B9689] text-lg md:text-xl font-light tracking-wide max-w-xl mx-auto leading-relaxed">
                    Connect your Google Ads. Paste a prompt into Claude Coworker. Start optimizing.
                </p>

                <div className="flex flex-col items-center gap-4">
                    <Button
                        size="lg"
                        onClick={handleCTA}
                        className="h-14 px-10 text-lg font-semibold bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C] rounded-full transition-all hover:scale-105"
                    >
                        {session.connected ? 'Go to Connect' : 'Connect Google Ads'} <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>

                    <div className="flex items-center gap-6 text-[#9B9689] text-sm">
                        <span>3 steps</span>
                        <span className="w-1 h-1 rounded-full bg-[#3D3C36]" />
                        <span>30 seconds</span>
                        <span className="w-1 h-1 rounded-full bg-[#3D3C36]" />
                        <span>Free</span>
                    </div>

                    <p className="max-w-md text-center text-sm leading-relaxed text-[#9B9689]">
                        By connecting Google Ads, you agree to our{' '}
                        <Link href="/privacy" className="font-medium text-[#E8E4DD] underline underline-offset-4 transition-colors hover:text-[#4CAF6E]">
                            Privacy Policy
                        </Link>{' '}
                        and{' '}
                        <Link href="/terms" className="font-medium text-[#E8E4DD] underline underline-offset-4 transition-colors hover:text-[#4CAF6E]">
                            Terms of Service
                        </Link>.
                    </p>
                </div>

                {/* How it works - inline */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 w-full max-w-2xl">
                    {[
                        { step: "1", text: "Connect your Google Ads account" },
                        { step: "2", text: "Copy the prompt into Claude Coworker" },
                        { step: "3", text: "Ask about your campaigns" },
                    ].map((item) => (
                        <div key={item.step} className="flex items-start gap-3 text-left">
                            <span className="text-2xl font-bold text-[#3D3C36]">{item.step}</span>
                            <p className="text-[#9B9689] text-sm leading-relaxed pt-1">{item.text}</p>
                        </div>
                    ))}
                </div>
            </motion.div>
        </section>
    );
}
