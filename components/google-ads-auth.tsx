"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, CheckCircle2, ChevronDown } from "lucide-react";
import type { Session } from "@/lib/session";

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
    | { status: "connected"; customerId: string; customerName: string };

type PopupSuccessMessage = {
    type: "GOOGLE_ADS_AUTH_SUCCESS";
    customerId?: string;
    customerName?: string;
    pendingToken?: string;
    accounts?: { id: string; name: string }[];
};

async function readServerSession(): Promise<Session> {
    const response = await fetch("/api/auth/session", {
        credentials: "include",
    });

    return response.json();
}

export function GoogleAdsAuth({ onConnect, onDisconnect, className, size = "sm", variant = "outline" }: GoogleAdsAuthProps) {
    const [auth, setAuth] = useState<AuthState>({ status: "loading" });
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        async function refreshSession() {
            try {
                const session = await readServerSession();
                if (!session.connected) {
                    setAuth({ status: "disconnected" });
                    return;
                }

                setAuth({
                    status: "connected",
                    customerId: session.customerId,
                    customerName: session.customerName ?? "Google Ads Account",
                });
            } catch {
                setAuth({ status: "disconnected" });
            }
        }

        async function handlePopupSuccess(event: MessageEvent<PopupSuccessMessage>) {
            if (event.origin !== window.location.origin) return;
            if (event.data.type !== "GOOGLE_ADS_AUTH_SUCCESS") return;

            try {
                if (event.data.pendingToken && Array.isArray(event.data.accounts)) {
                    const response = await fetch("/api/auth/select-account", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            pendingToken: event.data.pendingToken,
                            accounts: event.data.accounts,
                        }),
                    });

                    if (!response.ok) {
                        throw new Error("Failed to finalize Google Ads account selection");
                    }
                }

                const session = await readServerSession();
                if (!session.connected) {
                    setAuth({ status: "disconnected" });
                    return;
                }

                setAuth({
                    status: "connected",
                    customerId: session.customerId,
                    customerName: session.customerName ?? "Google Ads Account",
                });
                onConnect?.(session.customerId);
            } catch {
                setAuth({ status: "disconnected" });
            }
        }

        refreshSession();
        window.addEventListener("message", handlePopupSuccess);
        return () => window.removeEventListener("message", handlePopupSuccess);
    }, [onConnect]);

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

    const handleDisconnect = async () => {
        await fetch("/api/auth/signout", {
            method: "POST",
            credentials: "include",
        }).catch(() => {});
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
