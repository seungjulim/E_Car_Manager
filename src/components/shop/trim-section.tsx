"use client";

import { useState } from "react";
import { CompareToggle } from "@/components/shop/compare-basket";
import { WishlistButton } from "@/components/shop/wishlist-button";
import type { TrimView } from "@/lib/model-detail";
import { SPEC_FIELDS } from "@/lib/car-draft";
import { formatManwon } from "@/lib/format";
import type { Powertrain } from "@/lib/powertrain";

/** 트림 선택 + 선택한 트림의 가격·사양·편의사양·장단점 */
export function TrimSection({
  powertrain,
  trims,
  wishlistEntries = {},
}: {
  powertrain: Powertrain;
  trims: TrimView[];
  /** 내가 관심 목록에 담은 트림 id → 관심 항목 id */
  wishlistEntries?: Record<string, string>;
}) {
  const [selected, setSelected] = useState(0);

  if (trims.length === 0) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">등록된 트림이 없어요.</p>;
  }

  const trim = trims[Math.min(selected, trims.length - 1)];
  const specs = (trim.powertrainSpecs ?? {}) as Record<string, unknown>;
  const specRows = SPEC_FIELDS[powertrain]
    .map((f) => ({ field: f, value: specs[f.key] }))
    .filter((r) => r.value !== undefined && r.value !== null && r.value !== "");
  const featureEntries = Object.entries(trim.features).filter(([, items]) => items.length > 0);
  const actualPrice = trim.price != null && trim.subsidyEstimate ? trim.price - trim.subsidyEstimate : null;

  return (
    <section className="space-y-3" aria-label="트림 정보">
      <h2 className="font-bold">트림</h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="트림 선택">
        {trims.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={i === selected}
            onClick={() => setSelected(i)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              i === selected ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* 선택한 트림을 관심 목록·비교에 담기 (트림을 바꾸면 버튼 상태도 그 트림 기준으로 바뀐다) */}
      <div className="grid grid-cols-2 items-start gap-3">
        <WishlistButton key={trim.id} trimId={trim.id} entryId={wishlistEntries[trim.id]} />
        <CompareToggle trimId={trim.id} />
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted">차량 가격</p>
            <p className="text-xl font-bold">{trim.price != null ? formatManwon(trim.price) : "가격 미등록"}</p>
          </div>
          {actualPrice != null && (
            <div className="text-right">
              <p className="text-xs text-muted">보조금 반영 시 (추정)</p>
              <p className="font-bold text-ok">{formatManwon(actualPrice)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="mb-2 font-bold">주요 사양</h3>
        {specRows.length === 0 ? (
          <p className="text-sm text-muted">등록된 사양이 없어요.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            {specRows.map(({ field, value }) => (
              <div key={field.key}>
                <dt className="text-xs text-muted">{field.label}</dt>
                <dd className="font-semibold">
                  {typeof value === "number" ? value.toLocaleString("ko-KR") : String(value)}
                  {field.unit ? ` ${field.unit}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="mb-2 font-bold">운전자 편의사양</h3>
        {featureEntries.length === 0 ? (
          <p className="text-sm text-muted">등록된 편의사양이 없어요.</p>
        ) : (
          <div className="divide-y divide-line">
            {featureEntries.map(([category, items], i) => (
              <details key={category} open={i === 0} className="py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {category}
                  <span className="text-xs font-normal text-muted">{items.length}개</span>
                </summary>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <li key={item} className="rounded-full bg-soft px-2.5 py-1 text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ProsCons title="장점" tone="ok" items={trim.pros} />
        <ProsCons title="단점" tone="bad" items={trim.cons} />
      </div>

      {trim.sourceUrl && (
        <p className="truncate text-xs text-muted">
          출처:{" "}
          <a href={trim.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {trim.sourceUrl}
          </a>
        </p>
      )}
    </section>
  );
}

function ProsCons({ title, tone, items }: { title: string; tone: "ok" | "bad"; items: string[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <h3 className={`mb-1 font-bold ${tone === "ok" ? "text-ok" : "text-bad"}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">없음</p>
      ) : (
        <ul className="list-disc space-y-1 pl-4 text-sm">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
