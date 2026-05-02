import Image from "next/image";
import { BRAND_NAME } from "@/lib/brand";

type Size = "xs" | "sm" | "md" | "lg";

const SIZES: Record<Size, { mark: number; text: string; stroke: string; divider: string; gap: string }> = {
    xs: { mark: 18, text: "text-[13px]", stroke: "[-webkit-text-stroke:0.5px_currentColor]", divider: "h-4", gap: "gap-2" },
    sm: { mark: 24, text: "text-[20px]", stroke: "[-webkit-text-stroke:1px_currentColor]", divider: "h-5", gap: "gap-2.5" },
    md: { mark: 30, text: "text-[28px]", stroke: "[-webkit-text-stroke:1.25px_currentColor]", divider: "h-7", gap: "gap-3" },
    lg: { mark: 38, text: "text-[36px]", stroke: "[-webkit-text-stroke:1.5px_currentColor]", divider: "h-9", gap: "gap-3.5" },
};

export function BrandLockup({
    size = "md",
    className = "",
    dividerClassName = "bg-[#3D3C36]",
    textClassName = "text-[#E8E4DD]",
}: {
    size?: Size;
    className?: string;
    dividerClassName?: string;
    textClassName?: string;
}) {
    const s = SIZES[size];
    return (
        <span className={`inline-flex items-center ${s.gap} ${className}`}>
            <Image
                src="/notfiar_logo/notfair-mark-dark.svg"
                alt={BRAND_NAME}
                width={s.mark}
                height={s.mark}
                priority
                className="w-auto"
                style={{ height: s.mark }}
            />
            <span aria-hidden="true" className={`w-px ${s.divider} ${dividerClassName}`} />
            <span className={`${s.text} font-sans font-black tracking-tighter ${textClassName} ${s.stroke}`}>
                Not Fair
            </span>
        </span>
    );
}
