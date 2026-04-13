'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { DiscordLink } from '@/components/discord-link';
import { trackEvent } from '@/lib/analytics';
import { submitFeedback } from '@/app/actions';

export function FeedbackButton() {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    async function handleSubmit() {
        if (!message.trim() || sending) return;
        setSending(true);
        try {
            await submitFeedback(message.trim());
            trackEvent('feedback_submitted', { message: message.trim(), length: message.trim().length });
            setSent(true);
            setTimeout(() => {
                setOpen(false);
                setSent(false);
                setMessage('');
            }, 1500);
        } catch {
            // still close gracefully
        } finally {
            setSending(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    setOpen(true);
                    trackEvent('feedback_opened');
                }}
                className="text-[13px] text-[#C4C0B6] transition hover:text-[#E8E4DD]"
            >
                Feedback
            </button>

            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSent(false); setMessage(''); } }}>
                <DialogContent className="border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="text-[16px] font-semibold text-[#E8E4DD]">
                            Send feedback
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-[#C4C0B6]">
                            Bug reports, feature requests, or anything on your mind.
                        </DialogDescription>
                    </DialogHeader>

                    {sent ? (
                        <div className="flex flex-col items-center gap-2 py-6">
                            <span className="text-[14px] font-medium text-[#4CAF6E]">Thanks for your feedback!</span>
                        </div>
                    ) : (
                        <>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="What's on your mind?"
                                rows={4}
                                className="w-full resize-none rounded-md border border-[#3D3C36] bg-[#1A1917] px-3 py-2.5 text-[14px] text-[#E8E4DD] placeholder-[#C4C0B6]/50 outline-none transition focus:border-[#4CAF6E]/50"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                                }}
                            />
                            <div className="flex items-center justify-center">
                                <Button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={!message.trim() || sending}
                                    className="h-8 rounded-md bg-[#4CAF6E] px-4 text-[13px] font-semibold text-[#1A1917] hover:bg-[#3D9A5C] disabled:opacity-40"
                                >
                                    {sending ? 'Sending...' : 'Send'}
                                </Button>
                            </div>
                        </>
                    )}

                    {/* Discord option */}
                    <div className="flex items-center gap-3 pt-1">
                        <div className="h-px flex-1 bg-[#3D3C36]" />
                        <span className="text-[11px] text-[#C4C0B6]">or</span>
                        <div className="h-px flex-1 bg-[#3D3C36]" />
                    </div>
                    <div className="flex justify-center">
                        <DiscordLink
                            location="feedback_modal"
                            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#8B9FF5] transition hover:text-[#B0BFF9]"
                            iconClassName="h-3.5 w-3.5 shrink-0 fill-current"
                        >
                            chat with us on Discord
                        </DiscordLink>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
