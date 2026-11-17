"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BUDGET_PRESETS,
  MAX_BUDGET_MAN,
  SEGMENT_OPTIONS,
  SORT_LABEL,
  toBudgetQuery,
  type BudgetCondition,
} from "@/lib/budget-query";
import { POWERTRAINS, type Powertrain } from "@/lib/powertrain";
import type { SortMode } from "@/lib/recommend";

const PT_LABEL: Record<Powertrain, string> = { ev: "⚡ 전기차", hev: "🔋 HEV", phev: "🔋 PHEV", ice: "⛽ 내연기관" };
const SORTS: SortMode[] = ["popular", "taste", "combined"];
const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";

const toNumber = (s: string): number | null => {
  const t = s.replace(/[,\s]/g, "");
  return /^\d+$/.test(t) ? Number(t) : null;
};

export function BudgetForm({ initial }: { initial: BudgetCondition }) {
  const router = useRouter();
  const [min, setMin] = useState(String(initial.minMan));
  const [max, setMax] = useState(String(initial.maxMan));
  const [subsidy, setSubsidy] = useState(initial.subsidy);
  const [powertrains, setPowertrains] = useState<Powertrain[]>(initial.powertrains);
  const [segments, setSegments] = useState<string[]>(initial.segments);
  const [sort, setSort] = useState<SortMode>(initial.sort);
  const [error, setError] = useState("");

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const minN = toNumber(min);
  const maxN = toNumber(max);
  const showsSubsidy = powertrains.some((p) => p !== "ice");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (minN == null || maxN == null) return setError("예산은 숫자(만원)로 입력해 주세요.");
    if (maxN <= 0) return setError("최대 예산을 입력해 주세요.");
    if (minN > maxN) return setError("최소 예산이 최대 예산보다 클 수 없어요.");
    if (maxN > MAX_BUDGET_MAN) return setError("예산이 너무 커요. 10억(100,000만원) 이하로 입력해 주세요.");
    if (powertrains.length === 0) return setError("차량 유형을 하나 이상 선택해 주세요.");
    setError("");
    const condition: BudgetCondition = { minMan: minN, maxMan: maxN, subsidy, powertrains, segments, sort };
    router.push(`/shop/budget/result?${toBudgetQuery(condition)}`);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="space-y-3">
        <h2 className="font-bold">구입 예산</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="예산 빠른 선택">
          {BUDGET_PRESETS.map((p) => {
            const active = minN === p.min && maxN === p.max;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setMin(String(p.min));
                  setMax(String(p.max));
                }}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  active ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">최소 (만원)</span>
            <input className={inputCls} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">최대 (만원)</span>
            <input className={inputCls} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
        <input
          type="range"
          min={1000}
          max={15000}
          step={100}
          value={Math.min(15000, Math.max(1000, maxN ?? 5000))}
          onChange={(e) => setMax(e.target.value)}
          className="w-full accent-[var(--accent)]"
          aria-label="최대 예산 조절"
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">차량 유형</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="차량 유형">
          {POWERTRAINS.map((p) => (
            <Chip key={p} active={powertrains.includes(p)} onClick={() => setPowertrains(toggle(powertrains, p))}>
              {PT_LABEL[p]}
            </Chip>
          ))}
        </div>
      </section>

      {showsSubsidy && (
        <section className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <b>보조금 반영한 실구매가로 계산</b>
            <p className="text-sm text-muted">전기차·하이브리드는 등록해 둔 추정 보조금을 뺀 가격으로 예산을 비교해요. 지자체마다 금액이 달라요.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={subsidy}
            aria-label="보조금 반영"
            onClick={() => setSubsidy(!subsidy)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${subsidy ? "bg-accent" : "bg-line"}`}
          >
            <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${subsidy ? "left-6" : "left-1"}`} />
          </button>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-bold">
          차급 <span className="text-sm font-normal text-muted">(선택 안 하면 전체)</span>
        </h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="차급">
          {SEGMENT_OPTIONS.map((s) => (
            <Chip key={s} active={segments.includes(s)} onClick={() => setSegments(toggle(segments, s))}>
              {s}
            </Chip>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">선호도 기준</h2>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-line" role="group" aria-label="선호도 기준">
          {SORTS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={`min-h-11 border-r border-line text-sm last:border-r-0 ${
                sort === s ? "bg-accent-soft font-semibold text-accent" : "bg-surface"
              }`}
            >
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          인기순은 최근 3개월 판매 순위, 가족 취향순은 저장된 취향과의 일치도, 종합은 인기 70%·취향 30%예요.
        </p>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <button type="submit" className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white">
        TOP 10 추천 보기
      </button>
    </form>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
      }`}
    >
      {children}
    </button>
  );
}
