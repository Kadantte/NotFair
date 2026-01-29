"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createSubAccountAction } from "@/app/actions";
import { Loader2 } from "lucide-react";

interface CreateAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    managerId: string;
    refreshToken: string;
    onAccountCreated?: () => void;
}

export function CreateAccountDialog({ open, onOpenChange, managerId, refreshToken, onAccountCreated }: CreateAccountDialogProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [timezone, setTimezone] = useState("America/New_York");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await createSubAccountAction(refreshToken, managerId, name, currency, timezone);
            if (res.success) {
                onOpenChange(false);
                setName("");
                onAccountCreated?.();
            } else {
                setError(res.error || "Failed to create account");
            }
        } catch (err) {
            setError("An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create Client Account</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Create a new Google Ads account under {managerId}.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-zinc-300">Account Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. My New Brand"
                            className="bg-zinc-900 border-zinc-800 focus:ring-indigo-500/50"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Currency</Label>
                            <Select value={currency} onValueChange={setCurrency}>
                                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="EUR">EUR</SelectItem>
                                    <SelectItem value="GBP">GBP</SelectItem>
                                    <SelectItem value="AUD">AUD</SelectItem>
                                    <SelectItem value="CAD">CAD</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-zinc-300">Timezone</Label>
                            <Select value={timezone} onValueChange={setTimezone}>
                                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                                    <SelectItem value="America/New_York">New York</SelectItem>
                                    <SelectItem value="America/Chicago">Chicago</SelectItem>
                                    <SelectItem value="America/Denver">Denver</SelectItem>
                                    <SelectItem value="America/Los_Angeles">Los Angeles</SelectItem>
                                    <SelectItem value="Europe/London">London</SelectItem>
                                    <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                                    <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {error && <p className="text-red-400 text-xs bg-red-950/30 p-2 rounded border border-red-900/50">{error}</p>}

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-zinc-900 text-zinc-400 hover:text-white">Cancel</Button>
                        <Button type="submit" disabled={loading || !name} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                            {loading && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                            Create Account
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
