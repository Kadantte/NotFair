import { ArrowDown, ArrowUp, ChevronRight, Minus } from 'lucide-react';

export function DeltaBadge({ before, after, size = 14 }: { before: string; after: string; size?: number }) {
  const cls = `shrink-0`;
  const style = { width: size, height: size };

  if (before === after) return <Minus className={cls} style={style} color="#9B968966" />;
  if (after === 'PAUSED') return <ArrowDown className={cls} style={style} color="#D4882A" />;
  if (after === 'ENABLED') return <ArrowUp className={cls} style={style} color="#4CAF6E" />;
  if (!before || !after) return <ChevronRight className={cls} style={style} color="#9B968966" />;
  const bNum = Number(before);
  const aNum = Number(after);
  if (!isNaN(bNum) && !isNaN(aNum)) {
    if (aNum < bNum) return <ArrowDown className={cls} style={style} color="#4CAF6E" />;
    if (aNum > bNum) return <ArrowUp className={cls} style={style} color="#D4882A" />;
  }
  return <ChevronRight className={cls} style={style} color="#9B968966" />;
}
