'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { GoogleAdsAuth } from '@/components/google-ads-auth';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('GOOGLE_ADS_REFRESH_TOKEN');
    const cid = localStorage.getItem('GOOGLE_ADS_CUSTOMER_ID');
    if (token && cid) {
      setIsConnected(true);
      setCustomerId(cid);
    }
  }, []);


  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white relative overflow-hidden font-sans">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />

      <div className="z-10 flex flex-col items-center gap-8 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-zinc-500 mb-6 drop-shadow-sm">
            Ads Agent
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl font-light tracking-wide max-w-lg mx-auto">
            {isConnected ? `Connected to account ${customerId}` : "Connect your Google Ads account to start automating your campaigns."}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-4"
        >
          <GoogleAdsAuth />
        </motion.div>
      </div>
    </main>
  );
}
