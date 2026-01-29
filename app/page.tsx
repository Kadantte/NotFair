'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { GoogleAdsAuth } from '@/components/google-ads-auth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CreateAccountDialog } from '@/components/create-account-dialog';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('google_ads_refresh_token');
    const cid = localStorage.getItem('google_ads_customer_id');
    if (token && cid) {
      setIsConnected(true);
      setCustomerId(cid);
      setRefreshToken(token);
    }
  }, []);


  return (
    <main className="flex min-h-screen flex-col items-center justify-start bg-black text-white relative overflow-hidden font-sans py-8">
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
          <GoogleAdsAuth
            onConnect={(cid) => {
              setIsConnected(true);
              setCustomerId(cid);
              setRefreshToken(localStorage.getItem('google_ads_refresh_token'));
            }}
            onDisconnect={() => {
              setIsConnected(false);
              setCustomerId(null);
              setRefreshToken(null);
            }}
          />
        </motion.div>


        {isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6 flex flex-col items-center gap-4"
          >
            <div className="flex gap-4">
              <Button
                size="lg"
                onClick={() => setShowCreateDialog(true)}
                className="font-semibold bg-white text-black hover:bg-zinc-200 rounded-full px-8"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Account
              </Button>
              <Link href="/campaigns">
                <Button size="lg" className="font-semibold bg-white text-black hover:bg-zinc-200 rounded-full px-8">
                  View Campaigns <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </div>

      {customerId && refreshToken && (
        <CreateAccountDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          managerId={customerId}
          refreshToken={refreshToken}
        />
      )}
    </main >
  );
}
