import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { InspectionForm } from "@/components/cars/inspection-form";
import { todayKst } from "@/lib/car-care";
import { vehicleLabel } from "@/lib/cars";
import { firstParam, requireVehicle } from "@/lib/cars-server";
import { itemsForMode, type CheckMode } from "@/lib/inspection";

export const metadata: Metadata = { title: "점검 기록" };

export default function NewInspectionPage(props: PageProps<"/cars/vehicles/[id]/inspections/new">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <Content params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/cars/vehicles/[id]/inspections/new">["params"];
  searchParams: PageProps<"/cars/vehicles/[id]/inspections/new">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { vehicle: v } = await requireVehicle(id);
  const mode: CheckMode = firstParam(query.mode) === "self" ? "self" : "shop";
  const items = itemsForMode(v.powertrain, mode);

  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=inspection`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)}
      </Link>
      <div>
        <h1 className="text-xl font-bold">{mode === "self" ? "월간 셀프 점검" : "정비소 점검 기록"}</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "self"
            ? "운전자가 직접 볼 수 있는 항목만 모았어요. 1분이면 끝나요."
            : "블루핸즈 등에서 받은 점검 결과를 항목별로 기록해요. 점검하지 않은 항목은 비워 두세요."}
        </p>
        {mode === "shop" && (
          <p className="mt-1 text-xs text-muted">※ 항목 목록은 현대차·기아 시즌 무상점검 공지와 일반 정비 상식을 바탕으로 한 기본값이에요. 실제 점검표와 다를 수 있어요.</p>
        )}
      </div>
      <InspectionForm vehicleId={v.id} mode={mode} items={items} today={todayKst()} currentKm={v.currentMileageKm} />
    </div>
  );
}
