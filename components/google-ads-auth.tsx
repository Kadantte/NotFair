"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Settings, CheckCircle2, ChevronDown } from "lucide-react";

interface GoogleAdsAuthProps {
    onConnect?: (customerId: string) => void;
    onDisconnect?: () => void;
    className?: string;
    size?: "default" | "sm" | "lg" | "icon";
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

type AuthState =
    | { status: "loading" }
    | { status: "disconnected" }
    | { status: "connected"; customerId: string; customerName: string; source: "local" | "server" };

export function GoogleAdsAuth({ onConnect, onDisconnect, className, size = "sm", variant = "outline" }: GoogleAdsAuthProps) {
    const [auth, setAuth] = useState<AuthState>({ status: "loading" });
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        // 1. Check localStorage first
        const storedRefresh = localStorage.getItem("google_ads_refresh_token");
        const storedCustomer = localStorage.getItem("google_ads_customer_id");
        const storedName = localStorage.getItem("google_ads_customer_name");

        if (storedRefresh && storedCustomer) {
            setAuth({
                status: "connected",
                customerId: storedCustomer,
                customerName: storedName ?? "Google Ads Account",
                source: "local",
            });
            return;
        }

        // 2. Fall back to server session
        fetch("/api/auth/session")
            .then(r => r.json())
            .then(session => {
                if (session.connected) {
                    setAuth({
                        status: "connected",
                        customerId: "",
                        customerName: session.customerName ?? "Google Ads Account",
                        source: "server",
                    });
                } else {
                    setAuth({ status: "disconnected" });
                }
            })
            .catch(() => setAuth({ status: "disconnected" }));

        // Listen for auth success message from popup
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data.type === "GOOGLE_ADS_AUTH_SUCCESS") {
                const newRefresh = event.data.refreshToken;
                if (newRefresh) {
                    localStorage.setItem("google_ads_refresh_token", newRefresh);

                    if (event.data.accounts && Array.isArray(event.data.accounts)) {
                        const accounts = event.data.accounts;
                        localStorage.setItem("google_ads_customer_ids", JSON.stringify(accounts));
                        const primary = accounts[0];
                        const id = primary.id.replace("customers/", "");
                        localStorage.setItem("google_ads_customer_id", id);
                        localStorage.setItem("google_ads_customer_name", primary.name || "Google Ads Account");
                        setAuth({ status: "connected", customerId: id, customerName: primary.name || "Google Ads Account", source: "local" });
                        onConnect?.(id);
                    } else if (event.data.customerId && event.data.customerName) {
                        const id = event.data.customerId.replace("customers/", "");
                        localStorage.setItem("google_ads_customer_id", id);
                        localStorage.setItem("google_ads_customer_name", event.data.customerName);
                        localStorage.setItem("google_ads_customer_ids", JSON.stringify([{ id, name: event.data.customerName }]));
                        setAuth({ status: "connected", customerId: id, customerName: event.data.customerName, source: "local" });
                        onConnect?.(id);
                    }
                }
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    const handleConnect = () => {
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        window.open(
            "/api/auth/signin?popup=1",
            "Google Ads Auth",
            `width=${width},height=${height},top=${top},left=${left}`
        );
    };

    const handleDisconnect = () => {
        localStorage.removeItem("google_ads_refresh_token");
        localStorage.removeItem("google_ads_customer_id");
        localStorage.removeItem("google_ads_customer_name");
        localStorage.removeItem("google_ads_customer_ids");
        setAuth({ status: "disconnected" });
        onDisconnect?.();
    };

    if (auth.status === "loading") return null;

    if (auth.status === "disconnected") {
        return (
            <Button
                variant={variant}
                onClick={handleConnect}
                className={className || "gap-2 bg-[#24231F] border-[#3D3C36] text-[#9B9689] hover:text-[#E8E4DD] hover:bg-[#2E2D28] backdrop-blur-sm"}
                size={size}
            >
                <Settings className="w-3.5 h-3.5 mr-2" />
                Connect to Google Ads
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-[#24231F] border border-[#4CAF6E]/30 rounded-lg backdrop-blur-sm group hover:border-[#4CAF6E]/50 transition-colors outline-none text-left">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#4CAF6E] shrink-0" />
                        <div className="flex flex-col leading-none gap-0.5 text-left">
                            <span className="text-xs text-[#E8E4DD] font-semibold max-w-[140px] truncate">{auth.customerName}</span>
                            {auth.customerId && (
                                <span className="text-[10px] text-[#9B9689] font-mono">{auth.customerId}</span>
                            )}
                        </div>
                        <ChevronDown className="w-3 h-3 text-[#9B9689] ml-1 opacity-50 group-hover:opacity-100" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="bg-[#24231F] border-[#3D3C36] text-[#E8E4DD] min-w-[200px]">
                    <DropdownMenuItem
                        onSelect={handleDisconnect}
                        className="text-[#C45D4A] focus:text-[#C45D4A] focus:bg-[#C45D4A]/10 cursor-pointer text-xs font-medium"
                    >
                        Disconnect
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
