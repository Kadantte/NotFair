'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

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

  const handleConnect = () => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      "/api/auth/google/signin",
      "Google Ads Auth",
      `width=${width},height=${height},top=${top},left=${left}`
    );
  };

  const handleDisconnect = () => {
    localStorage.removeItem('GOOGLE_ADS_REFRESH_TOKEN');
    localStorage.removeItem('GOOGLE_ADS_CUSTOMER_ID');
    setIsConnected(false);
    setCustomerId(null);
  }

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
          {!isConnected ? (
            <button
              onClick={handleConnect}
              className="group relative inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-black transition-all hover:bg-zinc-200 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] ring-offset-black focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              <span className="font-semibold text-lg tracking-tight">Connect to Google</span>
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-3 text-emerald-400 bg-emerald-950/30 px-6 py-3 rounded-full border border-emerald-500/20 backdrop-blur-md">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium tracking-wide">Ready to Optimize</span>
              </div>
              <button
                onClick={handleDisconnect}
                className="text-sm text-zinc-600 hover:text-red-400 transition-colors duration-300"
              >
                Disconnect Account
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
