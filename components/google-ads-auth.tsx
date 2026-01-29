"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listAccessibleCustomersAction } from "@/app/actions";
import { Loader2, Settings, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";

export function GoogleAdsAuth() {
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [customerId, setCustomerId] = useState<string | null>(null);
    const [availableCustomers, setAvailableCustomers] = useState<{ id: string, name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        // Check local storage on mount
        const storedRefresh = localStorage.getItem("google_ads_refresh_token");
        const storedCustomer = localStorage.getItem("google_ads_customer_id");

        if (storedRefresh) {
            setRefreshToken(storedRefresh);
            // If we have token but don't know customers yet, we could fetch, but simple is better.
            // User can click menu to fetch if needed or we fetch on mount
        }
        if (storedCustomer) setCustomerId(storedCustomer);

        // Listen for auth success message from popup
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === "GOOGLE_ADS_AUTH_SUCCESS") {
                const newRefresh = event.data.refreshToken;
                if (newRefresh) {
                    localStorage.setItem("google_ads_refresh_token", newRefresh);
                    setRefreshToken(newRefresh);
                    // Auto fetch customers
                    fetchCustomers(newRefresh);
                }
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    const fetchCustomers = async (token: string) => {
        setLoading(true);
        try {
            const customers = await listAccessibleCustomersAction(token);
            setAvailableCustomers(customers);
        } catch (e) {
            console.error(e);
            // Maybe toast error
        } finally {
            setLoading(false);
        }
    };

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

    const handleSelectCustomer = (cid: string) => {
        // cid is 'customers/123-456-7890'
        const id = cid.replace("customers/", "");
        localStorage.setItem("google_ads_customer_id", id);
        setCustomerId(id);
    };

    const handleDisconnect = () => {
        localStorage.removeItem("google_ads_refresh_token");
        localStorage.removeItem("google_ads_customer_id");
        setRefreshToken(null);
        setCustomerId(null);
        setAvailableCustomers([]);
    };

    if (!isClient) return null;

    if (!refreshToken) {
        return (
            <Button
                variant="outline"
                onClick={handleConnect}
                className="gap-2 bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 backdrop-blur-sm"
                size="sm"
            >
                <Settings className="w-3.5 h-3.5" />
                Connect Ads
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-2 animate-in fade-in duration-500">
            {customerId ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 border border-green-900/30 rounded-full backdrop-blur-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs text-green-100 font-mono">{customerId}</span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="ml-1 text-zinc-600 hover:text-red-400 transition-colors outline-none"
                                title="Disconnect"
                            >
                                <div className="w-3 h-3 rounded-full hover:bg-zinc-800 flex items-center justify-center">×</div>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800">
                            <DropdownMenuItem
                                onSelect={handleDisconnect}
                                className="text-red-400 focus:text-red-300 focus:bg-red-900/20 cursor-pointer text-xs font-medium"
                            >
                                Confirm Disconnect
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ) : (
                <DropdownMenu onOpenChange={(open: boolean) => {
                    if (open && availableCustomers.length === 0 && refreshToken) {
                        fetchCustomers(refreshToken);
                    }
                }}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="gap-2 text-amber-500 border-amber-900/30 bg-amber-950/10 hover:bg-amber-950/20">
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
                            Select Account
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800 text-zinc-200">
                        {loading && <div className="p-2 text-xs text-zinc-500 text-center">Loading accounts...</div>}

                        {!loading && availableCustomers.length === 0 && (
                            <div className="p-2 text-xs text-zinc-500 text-center">No accounts found</div>
                        )}

                        {availableCustomers.map(c => (
                            <DropdownMenuItem
                                key={c.id}
                                onSelect={() => handleSelectCustomer(c.id)}
                                className="text-xs focus:bg-zinc-900 focus:text-white cursor-pointer flex flex-col items-start gap-0.5 py-2"
                            >
                                <span className="font-medium text-zinc-100">{c.name}</span>
                                <span className="text-[10px] text-zinc-500 font-mono">{c.id.replace('customers/', '')}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
}
