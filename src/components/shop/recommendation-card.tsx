import Image from "next/image";
import Link from "next/link";
import { formatManwon } from "@/lib/format";
import type { Powertrain } from "@/lib/powertrain";
import type { RecommendationItem } from "@/lib/recommend";

const BADGE: Record<Powertrain, { label: string; className: string }> = {
  ev: { label: "전기차", className: "bg-ok-soft text-ok" },
  hev: { label: "HEV", className: "bg-warn-soft text-warn" },
  phev: { label: "PHEV", className: "bg-warn-soft text-warn" },
  ice: { label: "내연", className: "bg-soft text-muted" },
};

export function RecommendationCard({ item, rank }: { item: RecommendationItem; rank: number }) {
  const badge = BADGE[item.powertrain];
  const { minWon, maxWon } = item.affordable;
  const price = minWon === maxWon ? formatManwon(minWon) : `${formatManwon(minWon)} ~ ${formatManwon(maxWon)}`;

  return (
    <li>
      <Link
        href={`/shop/models/${item.modelId}`}
        className="flex gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-accent"
      >
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
            rank <= 3 ? "bg-accent text-white" : "bg-accent-soft text-accent"
          }`}
          aria-label={`${rank}위`}
        >
          {rank}
        </span>
        <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg bg-soft">
          {item.coverUrl ? (
            <Image src={item.coverUrl} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-[11px] text-muted">이미지 없음</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
            {item.isNew && <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] text-muted">신규</span>}
            <span className="truncate text-xs text-muted">{item.brandName}</span>
          </div>
          <h3 className="truncate font-bold">{item.name}</h3>
          <p className="text-sm">
            <span className="text-muted">예산 내 </span>
            <b>{price}</b>
          </p>
          <ul className="flex flex-wrap gap-1">
            {item.reasons.map((r) => (
              <li key={r} className="rounded-full bg-soft px-2 py-0.5 text-[11px] text-muted">
                {r}
              </li>
            ))}
          </ul>
        </div>
      </Link>
    </li>
  );
}
