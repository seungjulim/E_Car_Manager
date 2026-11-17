import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UpcomingRow, EmptyBox, km, PT_BADGE, won } from "@/components/cars/ui";
import { getDb } from "@/db";
import { todayKst } from "@/lib/car-care";
import { listVehicles, loadCostSummary, loadUpcoming, vehicleLabel } from "@/lib/cars";
import { requireOrg } from "@/lib/cars-server";
import { topProgress } from "@/lib/inspection";
import { checkedCodesByVehicle } from "@/lib/inspections";
import { unreadCount } from "@/lib/notifications";

export const metadata: Metadata = { title: "차량 관리" };

export default function CarsHomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-24 animate-pulse rounded-xl bg-soft" />
      <div className="h-40 animate-pulse rounded-xl bg-soft" />
    </div>
  );
}

async function HomeContent() {
  const { userId, orgId } = await requireOrg();
  const db = getDb();
  const today = todayKst();
  const monthRange = { from: `${today.slice(0, 7)}-01`, to: today };

  const [vehicles, upcoming, month, unread, checked] = await Promise.all([
    listVehicles(db, orgId),
    loadUpcoming(db, orgId),
    loadCostSummary(db, orgId, monthRange),
    unreadCount(db, orgId, userId),
    checkedCodesByVehicle(db, orgId, monthRange.from),
  ]);

  if (vehicles.length === 0) {
    return (
      <EmptyBox title="아직 등록된 차량이 없어요" action={{ href: "/cars/vehicles/new", label: "첫 차량 등록하기" }}>
        차량을 등록하면 정비·보험·주행거리·충전 기록과 일정을 한곳에서 관리할 수 있어요.
      </EmptyBox>
    );
  }

  const attention = upcoming.filter((u) => u.level !== "later");
  const single = vehicles.length === 1 ? vehicles[0] : null;
  const quick = (path: string) => (single ? `/cars/vehicles/${single.id}/${path}/new` : "/cars/vehicles");

  return (
    <div className="space-y-5">
      <Link
        href="/cars/notifications"
        className={`flex items-center justify-between rounded-xl border p-3 ${unread > 0 ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
      >
        <span>
          🔔 <b>알림</b>
          <span className="ml-1 text-sm text-muted">{unread > 0 ? `읽지 않은 알림 ${unread}건` : "새 알림이 없어요"}</span>
        </span>
        <span aria-hidden>›</span>
      </Link>

      <section className="grid grid-cols-2 gap-3" aria-label="요약">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">이번 달 지출</p>
          <p className="text-xl font-bold">{won(month.total)}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">챙길 일정</p>
          <p className="text-xl font-bold">
            {attention.length}건
            {attention.some((u) => u.level === "overdue") && <span className="ml-1 text-sm text-bad">지난 항목 있음</span>}
          </p>
        </div>
      </section>

      <section className="space-y-2" aria-label="빠른 기록">
        <h2 className="font-bold">빠른 기록{!single && <span className="text-sm font-normal text-muted"> (차량을 먼저 고르세요)</span>}</h2>
        <div className="grid grid-cols-3 gap-2">
          <Link href={quick("mileage")} className="grid min-h-14 place-items-center rounded-xl border border-line bg-surface text-sm font-semibold">
            🛣 주행거리
          </Link>
          <Link href={quick("service")} className="grid min-h-14 place-items-center rounded-xl border border-line bg-surface text-sm font-semibold">
            🔧 정비
          </Link>
          <Link href={quick("energy")} className="grid min-h-14 place-items-center rounded-xl border border-line bg-surface text-sm font-semibold">
            ⚡ 충전·주유
          </Link>
        </div>
      </section>

      <section className="space-y-2" aria-label="이번 달 점검">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">이번 달 점검 TOP 10</h2>
          <span className="text-xs text-muted">{today.slice(5, 7).replace(/^0/, "")}월 기준</span>
        </div>
        <ul className="space-y-2">
          {vehicles.map((v) => {
            const p = topProgress(v.powertrain, checked.get(v.id) ?? new Set());
            const done = p.done === p.total;
            return (
              <li key={v.id}>
                <Link href={`/cars/vehicles/${v.id}?tab=inspection`} className="block rounded-xl border border-line bg-surface p-3 hover:border-accent">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold">{vehicleLabel(v)}</p>
                    <p className={`shrink-0 text-sm font-bold ${done ? "text-ok" : ""}`}>
                      {done ? "✓ 완료" : `${p.done}/${p.total}`}
                    </p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={p.done} aria-valuemin={0} aria-valuemax={p.total} aria-label={`${vehicleLabel(v)} 이번 달 점검 진행도`}>
                    <div className={`h-full ${done ? "bg-ok" : "bg-accent"}`} style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{done ? "이번 달 점검을 모두 마쳤어요." : p.done === 0 ? "아직 점검하지 않았어요. 셀프 점검은 1분이면 돼요." : `남은 항목 ${p.total - p.done}개`}</p>
                </Link>
                {!done && (
                  <Link href={`/cars/vehicles/${v.id}/inspections/new?mode=self`} className="mt-1 inline-block rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-accent">
                    ⏱ 셀프 점검 시작
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2" aria-label="다가오는 일정">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">다가오는 일정</h2>
          <Link href="/cars/schedule" className="text-sm text-muted underline">
            전체 보기
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
            정비를 기록하면 다음 교체 시기가, 보험을 등록하면 만기일이 여기에 나타나요.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.slice(0, 3).map((u) => (
              <UpcomingRow key={u.key} item={u} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-label="내 차">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">내 차</h2>
          <Link href="/cars/vehicles" className="text-sm text-muted underline">
            전체 보기
          </Link>
        </div>
        <ul className="space-y-2">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Link href={`/cars/vehicles/${v.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-accent">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{vehicleLabel(v)}</p>
                  <p className="text-xs text-muted">
                    {v.plateNo} · {km(v.currentMileageKm)}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PT_BADGE[v.powertrain].className}`}>{PT_BADGE[v.powertrain].label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
