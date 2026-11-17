import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { EmptyBox, won } from "@/components/cars/ui";
import { getDb } from "@/db";
import { COST_CATEGORIES, COST_LABEL, periodRange, todayKst } from "@/lib/car-care";
import { earliestActivity, listVehicles, loadCostSummary, vehicleLabel } from "@/lib/cars";
import { firstParam, requireOrg } from "@/lib/cars-server";

export const metadata: Metadata = { title: "비용" };

const PERIODS = [
  { key: "year", label: "올해" },
  { key: "12m", label: "최근 12개월" },
  { key: "all", label: "전체" },
] as const;
type Period = (typeof PERIODS)[number]["key"];

export default function CostsPage(props: PageProps<"/cars/costs">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">비용</h1>
        <p className="mt-1 text-sm text-muted">정비·보험·충전·주유로 쓴 돈을 모아 보여 드려요.</p>
      </div>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <CostContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const CATEGORY_BAR: Record<(typeof COST_CATEGORIES)[number], string> = {
  service: "bg-accent",
  insurance: "bg-warn",
  charging: "bg-ok",
  fueling: "bg-bad",
};

async function CostContent({ searchParams }: { searchParams: PageProps<"/cars/costs">["searchParams"] }) {
  const [{ orgId }, query] = await Promise.all([requireOrg(), searchParams]);
  const rawPeriod = firstParam(query.period);
  const period: Period = PERIODS.some((p) => p.key === rawPeriod) ? (rawPeriod as Period) : "year";
  const db = getDb();

  const vehicles = await listVehicles(db, orgId);
  if (vehicles.length === 0) {
    return <EmptyBox title="등록된 차량이 없어요" action={{ href: "/cars/vehicles/new", label: "차량 등록" }}>차량과 기록을 등록하면 비용이 계산돼요.</EmptyBox>;
  }

  const vid = z.uuid().safeParse(firstParam(query.vehicle));
  const vehicleId = vid.success && vehicles.some((v) => v.id === vid.data) ? vid.data : undefined;

  const today = todayKst();
  const earliest = period === "all" ? await earliestActivity(db, orgId) : null;
  const range = periodRange(period, today, earliest);
  const s = await loadCostSummary(db, orgId, range, vehicleId);

  const href = (p: Period, v?: string) => `/cars/costs?period=${p}${v ? `&vehicle=${v}` : ""}`;
  const maxMonth = Math.max(1, ...s.byMonth.map((m) => m.total));
  const months = s.byMonth.slice(-12); // 막대는 최근 12개월까지만 보여 준다
  const vehicleName = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? vehicleLabel(v) : "삭제된 차량";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="기간">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={href(p.key, vehicleId)}
            aria-current={period === p.key ? "true" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${period === p.key ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      {vehicles.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="차량">
          <Link href={href(period)} aria-current={!vehicleId ? "true" : undefined} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${!vehicleId ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}>
            전체 차량
          </Link>
          {vehicles.map((v) => (
            <Link key={v.id} href={href(period, v.id)} aria-current={vehicleId === v.id ? "true" : undefined} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${vehicleId === v.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}>
              {vehicleLabel(v)}
            </Link>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-accent bg-accent-soft p-4" aria-label="총 비용">
        <p className="text-xs text-muted">
          {range.from} ~ {range.to}
        </p>
        <p className="text-3xl font-bold">{won(s.total)}</p>
        <div className="mt-2 flex gap-6 text-sm">
          <p>
            <span className="text-muted">km당 </span>
            <b>{s.perKm != null ? won(s.perKm) : "-"}</b>
          </p>
          <p>
            <span className="text-muted">달린 거리 </span>
            <b>{s.kmDriven != null ? `${s.kmDriven.toLocaleString("ko-KR")}km` : "-"}</b>
          </p>
        </div>
        {s.perKm == null && <p className="mt-1 text-xs text-muted">기간 안에 주행거리 기록이 100km 이상 차이 나야 km당 비용을 계산해요.</p>}
      </section>

      {s.total === 0 ? (
        <EmptyBox title="이 기간에는 금액이 있는 기록이 없어요">정비 비용, 보험료, 충전·주유 금액을 입력하면 여기에 집계돼요.</EmptyBox>
      ) : (
        <>
          <section className="space-y-3" aria-label="분류별">
            <h2 className="font-bold">분류별</h2>
            {COST_CATEGORIES.map((c) => {
              const pct = s.total > 0 ? Math.round((s.byCategory[c] / s.total) * 100) : 0;
              return (
                <div key={c}>
                  <div className="flex justify-between text-sm">
                    <span>{COST_LABEL[c]}</span>
                    <span>
                      {won(s.byCategory[c])} <span className="text-muted">({pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-soft" role="img" aria-label={`${COST_LABEL[c]} ${pct}%`}>
                    <div className={`h-full ${CATEGORY_BAR[c]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </section>

          <section className="space-y-2" aria-label="월별">
            <h2 className="font-bold">월별 {s.byMonth.length > 12 && <span className="text-sm font-normal text-muted">(최근 12개월)</span>}</h2>
            <div className="flex h-36 items-end gap-1.5 rounded-xl border border-line bg-surface p-3">
              {months.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(m.total > 0 ? 4 : 0, (m.total / maxMonth) * 100)}%` }} title={`${m.month} ${won(m.total)}`} />
                  <span className="text-[10px] text-muted">{Number(m.month.slice(5))}</span>
                </div>
              ))}
            </div>
          </section>

          {vehicles.length > 1 && !vehicleId && (
            <section className="space-y-2" aria-label="차량별">
              <h2 className="font-bold">차량별</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {Object.entries(s.byVehicle)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, total]) => (
                    <li key={id} className="flex justify-between px-3 py-2 text-sm">
                      <span>{vehicleName(id)}</span>
                      <b>{won(total)}</b>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
      <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">보험료는 보험 시작일에 한 번 낸 것으로 계산해요. 금액을 입력하지 않은 기록은 합계에 들어가지 않아요.</p>
    </div>
  );
}
