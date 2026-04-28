"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export type ModelId = "gpt-5-mini" | "gpt-5.4" | "claude-opus-4.7";

export const MODELS: { id: ModelId; label: string; sublabel: string; locked: boolean }[] = [
  { id: "gpt-5-mini", label: "GPT-5 mini", sublabel: "Fast · Free", locked: false },
  { id: "gpt-5.4", label: "GPT-5.4", sublabel: "OpenAI frontier", locked: true },
  { id: "claude-opus-4.7", label: "Claude Opus 4.7", sublabel: "Anthropic frontier", locked: true },
];

const STORAGE_KEY = "adsagent:selected-model";

export function ModelSelector({
  value,
  onChange,
  surface,
}: {
  value: ModelId;
  onChange: (id: ModelId) => void;
  surface: "chat_page" | "audit_drawer";
}) {
  const [open, setOpen] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find(m => m.id === value) ?? MODELS[0];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription", { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        const paid = !!data?.plan && data.plan !== "free";
        setIsPaid(paid);
        if (paid) {
          const stored = localStorage.getItem(STORAGE_KEY) as ModelId | null;
          const model = stored && MODELS.some(m => m.id === stored) ? stored : null;
          if (model && model !== value) onChange(model);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isPaid) return;
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }, [value, isPaid]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-[#b0b0ae] transition-colors hover:text-white"
      >
        {current.label}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-[#4a4a48] bg-[#2c2c2b] shadow-xl">
          {MODELS.map(m => {
            const selected = m.id === value;
            const showUpgrade = m.locked && !isPaid;
            const inner = (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-left">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm text-white">
                    <span className="truncate">{m.label}</span>
                    {selected && <Check className="h-3.5 w-3.5 text-[#4CAF6E]" />}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#C4C0B6]">{m.sublabel}</div>
                </div>
                {showUpgrade && (
                  <span className="shrink-0 rounded-full bg-[#4CAF6E]/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#4CAF6E]">
                    Upgrade
                  </span>
                )}
              </div>
            );
            return showUpgrade ? (
              <Link
                key={m.id}
                href="/upgrade"
                prefetch
                onClick={() => {
                  trackEvent("chat_model_option_clicked", {
                    model_id: m.id,
                    action: "upgrade_redirect",
                    surface,
                    is_paid: isPaid,
                  });
                  setOpen(false);
                }}
                className="block transition-colors hover:bg-[#3a3a39]"
              >
                {inner}
              </Link>
            ) : (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  trackEvent("chat_model_option_clicked", {
                    model_id: m.id,
                    action: isPaid && m.locked ? "paid_switched" : "selected",
                    surface,
                    is_paid: isPaid,
                  });
                  onChange(m.id);
                  setOpen(false);
                }}
                className="block w-full transition-colors hover:bg-[#3a3a39]"
              >
                {inner}
              </button>
            );
          })}
          <Link
            href="/connect/claude-connector"
            prefetch
            onClick={() => {
              trackEvent("chat_model_option_clicked", {
                model_id: "connect_claude",
                action: "connect_claude_redirect",
                surface,
                is_paid: isPaid,
              });
              setOpen(false);
            }}
            className="flex items-center gap-3 border-t border-[#4a4a48] px-3 py-2.5 transition-colors hover:bg-[#3a3a39]"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#D97757]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-white" aria-hidden="true">
              <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/>
            </svg>
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">Connect to Your Claude</div>
              <div className="mt-0.5 text-[11px] text-[#C4C0B6]">Use NotFair inside Claude app, Claude Cowork, and Claude Code</div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
