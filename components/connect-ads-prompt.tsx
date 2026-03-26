"use client";

import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export function ConnectAdsPrompt() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-4">
      <div className="w-16 h-16 rounded-2xl bg-indigo-950/50 border border-indigo-900/50 flex items-center justify-center mb-6">
        <svg
          className="w-8 h-8 text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-1.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.342"
          />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">
        Connect your Google Ads account
      </h2>
      <p className="text-zinc-400 text-sm max-w-md mb-8">
        Link your Google Ads account to start managing your campaigns with AI.
        You'll authorize read and write access to your ad data.
      </p>
      <Button
        asChild
        size="lg"
        className="h-12 px-8 bg-white text-black hover:bg-zinc-200 font-semibold rounded-full transition-all hover:scale-105"
      >
        <a href="/connect">
          Connect Google Ads <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </Button>
    </div>
  );
}
