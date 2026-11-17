import Image from "next/image";
import Link from "next/link";
import type { ModelCard } from "@/lib/catalog";
import { formatPriceRange } from "@/lib/format";
import type { Powertrain } from "@/lib/powertrain";

const BADGE: Record<Powertrain, { label: string; className: string }> = {
  ev: { label: "전기차", className: "bg-ok-soft text-ok" },
  hev: { label: "HEV", className: "bg-warn-soft text-warn" },
  phev: { label: "PHEV", className: "bg-warn-soft text-warn" },
  ice: { label: "내연", className: "bg-soft text-muted" },
};

export function ModelCardView({ model }: { model: ModelCard }) {
  const badge = BADGE[model.powertrain];
  return (
    <Link
      href={`/shop/models/${model.id}`}
      className="block overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-accent"
    >
      <div className="relative aspect-[4/3] bg-soft">
        {model.coverUrl ? (
          <Image
            src={model.coverUrl}
            alt={`${model.brandName} ${model.name}`}
            fill
            sizes="(max-width: 448px) 50vw, 220px"
            className="object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted">이미지 없음</div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
          <span className="truncate text-xs text-muted">{model.brandName}</span>
        </div>
        <h3 className="truncate font-bold">{model.name}</h3>
        <p className="text-sm text-muted">{formatPriceRange(model.priceMin, model.priceMax)}</p>
      </div>
    </Link>
  );
}
