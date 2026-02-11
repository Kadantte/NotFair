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

interface GoogleAdsAuthProps {
    onConnect?: (customerId: string) => void;
    onDisconnect?: () => void;
    className?: string;
    size?: "default" | "sm" | "lg" | "icon";
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

export function GoogleAdsAuth({ onConnect, onDisconnect, className, size = "sm", variant = "outline" }: GoogleAdsAuthProps) {
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [customerId, setCustomerId] = useState<string | null>(null);
    const [customerName, setCustomerName] = useState<string | null>(null);
    const [availableCustomers, setAvailableCustomers] = useState<{ id: string, name: string, status: string, error?: string, isTest: boolean }[]>([]);
    const [loading, setLoading] = useState(false);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        // Check local storage on mount
        const storedRefresh = localStorage.getItem("google_ads_refresh_token");
        const storedCustomer = localStorage.getItem("google_ads_customer_id");
        const storedName = localStorage.getItem("google_ads_customer_name");

        if (storedRefresh) {
            setRefreshToken(storedRefresh);
            // If we have token but don't know customers yet, we could fetch, but simple is better.
            // User can click menu to fetch if needed or we fetch on mount
        }
        if (storedCustomer) setCustomerId(storedCustomer);
        if (storedName) setCustomerName(storedName);

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
            // @ts-ignore
            const customers = await listAccessibleCustomersAction(token);
            // @ts-ignore
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

    const handleSelectCustomer = (customer: { id: string, name: string }) => {
        // cid is 'customers/123-456-7890'
        const id = customer.id.replace("customers/", "");
        localStorage.setItem("google_ads_customer_id", id);
        localStorage.setItem("google_ads_customer_name", customer.name);
        setCustomerId(id);
        setCustomerName(customer.name);
        onConnect?.(id);
    };

    const handleDisconnect = () => {
        localStorage.removeItem("google_ads_refresh_token");
        localStorage.removeItem("google_ads_customer_id");
        localStorage.removeItem("google_ads_customer_name");
        setRefreshToken(null);
        setCustomerId(null);
        setCustomerName(null);
        setAvailableCustomers([]);
        onDisconnect?.();
    };

    if (!isClient) return null;

    if (!refreshToken) {
        return (
            <Button
                variant={variant}
                onClick={handleConnect}
                className={className || "gap-2 bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 backdrop-blur-sm"}
                size={size}
            >
                <Settings className="w-3.5 h-3.5 mr-2" />
                Connect to Google Ads
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-2 animate-in fade-in duration-500">
            <DropdownMenu onOpenChange={(open: boolean) => {
                if (open && availableCustomers.length === 0 && refreshToken) {
                    fetchCustomers(refreshToken);
                }
            }}>
                <DropdownMenuTrigger asChild>
                    {customerId ? (
                        <button className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 border border-green-900/30 rounded-full backdrop-blur-sm group hover:border-green-800/50 transition-colors outline-none text-left">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            <div className="flex flex-col leading-none gap-0.5 text-left">
                                <span className="text-xs text-zinc-200 font-semibold max-w-[140px] truncate">{customerName || 'Unknown Account'}</span>
                                <span className="text-[10px] text-zinc-500 font-mono">{customerId}</span>
                            </div>
                            <ChevronDown className="w-3 h-3 text-zinc-600 ml-1 opacity-50 group-hover:opacity-100" />
                        </button>
                    ) : (
                        <Button variant="outline" className="gap-2 text-amber-500 border-amber-900/30 bg-amber-950/10 hover:bg-amber-950/20">
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
                            Select Account
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800 text-zinc-200 min-w-[320px]">
                    {loading && <div className="p-2 text-xs text-zinc-500 text-center">Loading accounts...</div>}

                    {!loading && availableCustomers.length === 0 && (
                        <div className="p-2 text-xs text-zinc-500 text-center">No accounts found</div>
                    )}

                    {availableCustomers.map(c => (
                        <DropdownMenuItem
                            key={c.id}
                            disabled={c.status === "ERROR"}
                            onSelect={() => c.status !== "ERROR" && handleSelectCustomer(c)}
                            className={`text-xs flex flex-col items-start gap-1 py-2 ${c.status === "ERROR" ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer focus:bg-zinc-900 focus:text-white'}`}
                        >
                            <div className="flex items-center justify-between w-full">
                                <span className="font-medium text-zinc-100 truncate max-w-[200px]">{c.name}</span>
                                {c.isTest && <span className="bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/20">TEST</span>}
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono">{c.id.replace('customers/', '')}</span>
                            {c.error && (
                                <span className="text-[10px] text-red-400 bg-red-950/20 p-1 rounded border border-red-900/30 mt-1 w-full whitespace-normal leading-tight">
                                    {c.error}
                                </span>
                            )}
                        </DropdownMenuItem>
                    ))}



                    <div className="h-px bg-zinc-800 my-1" />

                    <DropdownMenuItem
                        onSelect={handleDisconnect}
                        className="text-red-400 focus:text-red-300 focus:bg-red-900/20 cursor-pointer text-xs font-medium"
                    >
                        Disconnect
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>


        </div>
    );
}
