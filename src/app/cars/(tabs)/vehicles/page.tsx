import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyBox, km, PT_BADGE } from "@/components/cars/ui";
import { getDb } from "@/db";
import { formatDday } from "@/lib/car-care";
import { listVehicles, loadUpcoming, vehicleLabel } from "@/lib/cars";
import { requireOrg } from "@/lib/cars-server";
import { displayName, getMemberNames } from "@/lib/members";

export const metadata: Metadata = { title: "내 차" };

export default function VehiclesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 차</h1>
        <Link href="/cars/vehicles/new" className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
          + 차량 등록
        </Link>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <VehicleList />
      </Suspense>
    </div>
  );
}

async function VehicleList() {
  const { userId, orgId } = await requireOrg();
  const db = getDb();
  const [vehicles, upcoming, names] = await Promise.all([listVehicles(db, orgId), loadUpcoming(db, orgId), getMemberNames(orgId)]);

  if (vehicles.length === 0) {
    return (
      <EmptyBox title="아직 등록된 차량이 없어요" action={{ href: "/cars/vehicles/new", label: "첫 차량 등록하기" }}>
        차량번호만 있어도 등록할 수 있어요.
      </EmptyBox>
    );
  }

  return (
    <ul className="space-y-3">
      {vehicles.map((v) => {
        const next = upcoming.find((u) => u.vehicleId === v.id);
        const badge = PT_BADGE[v.powertrain];
        return (
          <li key={v.id}>
            <Link href={`/cars/vehicles/${v.id}`} className="block space-y-2 rounded-xl border border-line bg-surface p-4 hover:border-accent">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{vehicleLabel(v)}</h2>
                  <p className="text-sm text-muted">
                    {v.plateNo}
                    {v.purchaseYear ? ` · ${v.purchaseYear}년식` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
              </div>
              <p className="text-sm">
                {km(v.currentMileageKm)}
                {v.ownerUserId && <span className="text-muted"> · 주 사용자 {displayName(names, v.ownerUserId, userId)}</span>}
              </p>
              {next && (
                <p className={`rounded-lg px-2.5 py-1.5 text-sm ${next.level === "overdue" || next.level === "urgent" ? "bg-bad-soft text-bad" : "bg-soft text-muted"}`}>
                  다음: {next.title}
                  {next.days != null && ` · ${formatDday(next.days)}`}
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
