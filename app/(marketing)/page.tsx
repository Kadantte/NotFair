'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useMotionTemplate, useMotionValue } from 'framer-motion';
import { ArrowRight, Zap, ShieldCheck, TrendingUp, Layers } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GoogleAdsAuth } from '@/components/google-ads-auth';

function GridPattern() {
    return (
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.15] pointer-events-none">
            <div className="absolute h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-blue-500 opacity-20 blur-[100px]"></div>
        </div>
    );
}

function SpotlightCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    const divRef = useRef<HTMLDivElement>(null);
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <div
            className={`group relative border border-zinc-800 bg-zinc-900/50 overflow-hidden ${className}`}
            onMouseMove={handleMouseMove}
            ref={divRef}
        >
            <motion.div
                className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
                style={{
                    background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              rgba(59, 130, 246, 0.15),
              transparent 80%
            )
          `,
                }}
            />
            <div className="relative h-full">{children}</div>
        </div>
    );
}

export default function Home() {
    const [isConnected, setIsConnected] = useState(false);
    const { scrollY } = useScroll();
    const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
    const heroScale = useTransform(scrollY, [0, 300], [1, 0.95]);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            const token = localStorage.getItem('google_ads_refresh_token');
            const cid = localStorage.getItem('google_ads_customer_id');
            setIsConnected(Boolean(token && cid));
        });

        return () => window.cancelAnimationFrame(frame);
    }, []);

    return (
        <>
            {/* Hero Section */}
            <section className="relative flex flex-col items-center justify-center min-h-[90vh] py-20 px-4 overflow-hidden">
                <GridPattern />

                {/* Animated Orbs - Blue (Trust) and Emerald (Growth) */}
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.5, 0.3],
                        rotate: [0, 180, 360]
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] pointer-events-none"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.2, 0.4, 0.2],
                        rotate: [360, 180, 0]
                    }}
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                    className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-600/20 rounded-full blur-[128px] pointer-events-none"
                />

                <motion.div
                    style={{ opacity: heroOpacity, scale: heroScale }}
                    className="z-10 flex flex-col items-center max-w-5xl mx-auto text-center space-y-8"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                        <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300 backdrop-blur-xl mb-8 shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                            <span className="flex h-2 w-2 rounded-full bg-blue-400 mr-2 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                            ADSAGENT v1.0
                        </div>
                        <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight mb-8 drop-shadow-2xl leading-[0.9]">
                            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/50">Put your ads on</span>
                            <br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 animate-gradient-x bg-[length:200%_auto]">autopilot</span>
                        </h1>
                        <p className="text-zinc-400 text-lg md:text-xl font-light tracking-wide max-w-2xl mx-auto leading-relaxed">
                            The intelligent agent that optimizes your ad spend, scales your high-performing campaigns, and saves you hours every week.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="flex flex-col items-center gap-6 w-full"
                    >
                        {isConnected && (
                            <Link href="/chat">
                                <Button size="lg" className="h-14 px-10 text-lg font-semibold bg-white text-black hover:bg-zinc-200 rounded-full transition-all hover:scale-105 shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)]">
                                    Launch AdsAgent <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>
                            </Link>
                        )}

                        <div className="flex flex-col items-center gap-4">
                            <GoogleAdsAuth
                                onConnect={() => {
                                    setIsConnected(true);
                                }}
                                onDisconnect={() => {
                                    setIsConnected(false);
                                }}
                                variant="default"
                                size="lg"
                                className="h-14 px-8 font-semibold bg-white text-black hover:bg-zinc-200 rounded-full transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)]"
                            />
                            <p className="text-zinc-500 text-sm">No credit card required for connection.</p>
                        </div>
                    </motion.div>
                </motion.div>
            </section>

            {/* Features Grid with Glow Effect */}
            <section id="features" className="py-32 bg-black px-4 relative z-10">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

                <div className="container mx-auto max-w-7xl">
                    <div className="text-center mb-20">
                        <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500 mb-6">
                            Why choose AdsAgent?
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                            Built for performance marketers who demand efficiency and scale.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                icon: <Zap className="w-8 h-8 text-blue-400" />,
                                title: "Smart Optimization",
                                description: "AI-driven adjustments to bids and budgets 24/7 to maximize your ROAS. We analyze thousands of signals in real-time."
                            },
                            {
                                icon: <TrendingUp className="w-8 h-8 text-emerald-400" />,
                                title: "Scalable Campaigns",
                                description: "Automatically identify winning creatives and audiences to scale profitably. Never miss a growth opportunity again."
                            },
                            {
                                icon: <Layers className="w-8 h-8 text-amber-400" />,
                                title: "Deep Insights",
                                description: "Get actionable insights without drowning in spreadsheets. We boil down complex data into clear next steps."
                            }
                        ].map((feature, i) => (
                            <SpotlightCard key={i} className="rounded-3xl p-8 hover:bg-zinc-900/80 transition-colors">
                                <div className="w-14 h-14 rounded-2xl bg-zinc-900/50 flex items-center justify-center mb-6 border border-zinc-800">
                                    {feature.icon}
                                </div>
                                <h3 className="text-2xl font-bold mb-3 text-white">{feature.title}</h3>
                                <p className="text-zinc-400 leading-relaxed text-lg">{feature.description}</p>
                            </SpotlightCard>
                        ))}
                    </div>
                </div>
            </section>

            {/* Stats / Trust Section */}
            <section className="py-24 border-t border-zinc-900 bg-zinc-950/50 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

                <div className="container mx-auto max-w-6xl px-4 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
                        {[
                            { label: "Ad Spend Managed", value: "$500M+" },
                            { label: "Campaigns Optimized", value: "10k+" },
                            { label: "Hours Saved", value: "50k+" },
                            { label: "ROAS Increase", value: "35%" }
                        ].map((stat, i) => (
                            <div key={i} className="p-6">
                                <div className="text-4xl md:text-5xl font-bold text-white mb-2">{stat.value}</div>
                                <div className="text-zinc-500 font-medium">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Security Section */}
            <section className="py-24 px-4 bg-black border-t border-zinc-900">
                <div className="container mx-auto max-w-4xl text-center">
                    <div className="inline-flex items-center justify-center p-3 rounded-full bg-green-900/10 border border-green-900/30 mb-8 text-green-400 ring-4 ring-green-900/5">
                        <ShieldCheck className="w-6 h-6 mr-2" />
                        <span className="text-sm font-semibold tracking-wide">ENTERPRISE GRADE SECURITY</span>
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white tracking-tight">Your data is safe with us.</h2>
                    <p className="text-zinc-400 text-lg md:text-xl mb-8 max-w-2xl mx-auto leading-relaxed">
                        We use industry-standard encryption and OAuth protocols. We never store your payment information, and our access is strictly limited to campaign management.
                    </p>
                </div>
            </section>
        </>
    );
}
