import { Suspense } from "react";
import type { Metadata } from "next";
import { EmptyBox, UpcomingRow } from "@/components/cars/ui";
import { getDb } from "@/db";
import type { DueLevel, UpcomingItem } from "@/lib/car-care";
import { listVehicles, loadUpcoming } from "@/lib/cars";
import { requireOrg } from "@/lib/cars-server";

export const metadata: Metadata = { title: "일정" };

export default function SchedulePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">일정</h1>
        <p className="mt-1 text-sm text-muted">정비 예정과 보험 만기를 가까운 순서로 모았어요.</p>
      </div>
      <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <ScheduleList />
      </Suspense>
    </div>
  );
}

const GROUPS: { level: DueLevel; title: string }[] = [
  { level: "overdue", title: "지났어요" },
  { level: "urgent", title: "7일 안" },
  { level: "soon", title: "30일 안" },
  { level: "later", title: "그 이후·날짜 미정" },
];

async function ScheduleList() {
  const { orgId } = await requireOrg();
  const db = getDb();
  const [vehicles, items] = await Promise.all([listVehicles(db, orgId), loadUpcoming(db, orgId)]);

  if (vehicles.length === 0) {
    return <EmptyBox title="등록된 차량이 없어요" action={{ href: "/cars/vehicles/new", label: "차량 등록" }}>차량을 등록하면 일정이 여기에 모여요.</EmptyBox>;
  }
  if (items.length === 0) {
    return (
      <EmptyBox title="예정된 일정이 없어요">
        정비를 기록할 때 &lsquo;다음 예정&rsquo;이 함께 저장되고, 보험을 등록하면 만기일이 나타나요.
      </EmptyBox>
    );
  }

  const byLevel = new Map<DueLevel, UpcomingItem[]>();
  for (const it of items) byLevel.set(it.level, [...(byLevel.get(it.level) ?? []), it]);

  return (
    <div className="space-y-5">
      {GROUPS.filter((g) => byLevel.has(g.level)).map((g) => (
        <section key={g.level} className="space-y-2" aria-label={g.title}>
          <h2 className={`text-sm font-bold ${g.level === "overdue" || g.level === "urgent" ? "text-bad" : "text-muted"}`}>
            {g.title} <span className="font-normal">({byLevel.get(g.level)!.length})</span>
          </h2>
          <ul className="space-y-2">
            {byLevel.get(g.level)!.map((u) => (
              <UpcomingRow key={u.key} item={u} />
            ))}
          </ul>
        </section>
      ))}
      <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">
        주행거리 기준 예정은 최근 평균 주행거리(기록이 두 달쯤 쌓이면)로 날짜를 추정해요. 푸시 알림은 준비 중이에요.
      </p>
    </div>
  );
}
