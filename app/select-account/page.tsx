'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronRight, Loader2, AlertCircle } from 'lucide-react';

function getCookie(name: string) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
}

export default function SelectAccount() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [setupData, setSetupData] = useState<{ refresh_token: string, customers: string[] } | null>(null);

    useEffect(() => {
        // Small delay to ensure cookie is set/readable after redirect
        const timer = setTimeout(() => {
            const cookieData = getCookie('ads_setup_data');
            if (!cookieData) {
                console.warn("No setup cookie found");
                router.push('/');
                return;
            }
            try {
                // Try decoding, fallback to raw if already raw
                let raw = cookieData;
                try {
                    raw = decodeURIComponent(cookieData);
                } catch (e) {
                    // ignore
                }
                const parsed = JSON.parse(raw);
                setSetupData(parsed);
            } catch (e) {
                console.error("Failed to parse cookie", e);
                router.push('/');
            } finally {
                setLoading(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [router]);

    const handleSelect = (resourceName: string) => {
        if (!setupData) return;

        const customerId = resourceName.replace('customers/', '');

        localStorage.setItem('GOOGLE_ADS_REFRESH_TOKEN', setupData.refresh_token);
        localStorage.setItem('GOOGLE_ADS_CUSTOMER_ID', customerId);

        // Expire the cookie
        document.cookie = "ads_setup_data=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-white">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-3"
                >
                    <Loader2 className="animate-spin w-8 h-8 text-indigo-500" />
                    <span className="text-zinc-500 text-sm">Fetching accounts...</span>
                </motion.div>
            </div>
        );
    }

    if (!setupData || setupData.customers.length === 0) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-4">
                <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md text-center">
                    <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">No Accounts Found</h2>
                    <p className="text-zinc-400 mb-6 text-sm leading-relaxed">
                        We couldn't find any Google Ads accounts associated with your login.
                        Please ensure you have access to a Google Ads account.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-3 bg-white text-black rounded-xl font-medium hover:bg-zinc-200 transition-colors"
                    >
                        Return Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-black text-white p-8 md:p-24 selection:bg-indigo-500/30">
            <div className="max-w-2xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-10"
                >
                    <h1 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
                        Select Account
                    </h1>
                    <p className="text-zinc-400">Choose the Google Ads account you want to manage.</p>
                </motion.div>

                <div className="grid gap-3">
                    {setupData.customers.map((customer, i) => (
                        <motion.button
                            key={customer}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => handleSelect(customer)}
                            className="flex items-center justify-between p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-indigo-500/50 hover:bg-zinc-800 transition-all group text-left backdrop-blur-sm"
                        >
                            <div className="flex flex-col">
                                <span className="text-lg font-medium tracking-wide text-zinc-200 group-hover:text-white transition-colors">
                                    {customer.replace('customers/', '')}
                                </span>
                                <span className="text-xs text-zinc-500 font-mono mt-1">
                                    CUSTOMER ID
                                </span>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                <ChevronRight className="w-4 h-4" />
                            </div>
                        </motion.button>
                    ))}
                </div>
            </div>
        </main>
    );
}
