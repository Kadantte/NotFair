'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/session-provider';

export default function Home() {
    const session = useSession();

    function handleCTA() {
        if (session.connected) {
            window.location.assign('/campaigns');
        } else {
            window.location.assign('/api/auth/signin');
        }
    }

    return (
        <section className="relative flex flex-col items-center justify-center min-h-[90vh] py-20 px-4 overflow-hidden">
            <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] pointer-events-none"
            />
            <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-600/20 rounded-full blur-[128px] pointer-events-none"
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="z-10 flex flex-col items-center max-w-3xl mx-auto text-center space-y-8"
            >
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight drop-shadow-2xl leading-[0.95]">
                    <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/50">Let your AI agent</span>
                    <br />
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400">manage your ads</span>
                </h1>

                <p className="text-zinc-400 text-lg md:text-xl font-light tracking-wide max-w-xl mx-auto leading-relaxed">
                    Connect your Google Ads. Paste a prompt into Claude Coworker. Start optimizing.
                </p>

                <div className="flex flex-col items-center gap-4">
                    <Button
                        size="lg"
                        onClick={handleCTA}
                        className="h-14 px-10 text-lg font-semibold bg-white text-black hover:bg-zinc-200 rounded-full transition-all hover:scale-105 shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                    >
                        {session.connected ? 'Go to Dashboard' : 'Connect Google Ads'} <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>

                    <div className="flex items-center gap-6 text-zinc-500 text-sm">
                        <span>3 steps</span>
                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                        <span>30 seconds</span>
                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                        <span>Free</span>
                    </div>
                </div>

                {/* How it works - inline */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 w-full max-w-2xl">
                    {[
                        { step: "1", text: "Connect your Google Ads account" },
                        { step: "2", text: "Copy the prompt into Claude Coworker" },
                        { step: "3", text: "Ask about your campaigns" },
                    ].map((item) => (
                        <div key={item.step} className="flex items-start gap-3 text-left">
                            <span className="text-2xl font-bold text-zinc-700">{item.step}</span>
                            <p className="text-zinc-400 text-sm leading-relaxed pt-1">{item.text}</p>
                        </div>
                    ))}
                </div>
            </motion.div>
        </section>
    );
}
