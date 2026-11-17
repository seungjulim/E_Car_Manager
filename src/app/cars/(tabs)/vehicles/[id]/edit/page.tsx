import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { VehicleForm, type VehicleFormValues } from "@/components/cars/forms";
import { todayKst } from "@/lib/car-care";
import { requireVehicle } from "@/lib/cars-server";
import { getMemberNames } from "@/lib/members";

export const metadata: Metadata = { title: "차량 정보 수정" };

export default function EditVehiclePage(props: PageProps<"/cars/vehicles/[id]/edit">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <EditContent params={props.params} />
    </Suspense>
  );
}

async function EditContent({ params }: { params: PageProps<"/cars/vehicles/[id]/edit">["params"] }) {
  const { id } = await params;
  const { orgId, vehicle: v } = await requireVehicle(id);
  const names = await getMemberNames(orgId);

  const initial: VehicleFormValues = {
    id: v.id,
    plateNo: v.plateNo,
    nickname: v.nickname ?? "",
    brand: v.brand ?? "",
    model: v.model ?? "",
    trim: v.trim ?? "",
    powertrain: v.powertrain,
    iceFuel: v.iceFuel ?? "",
    purchaseYear: v.purchaseYear != null ? String(v.purchaseYear) : "",
    purchasedAt: v.purchasedAt ?? "",
    vin: v.vin ?? "",
    color: v.color ?? "",
    currentMileageKm: String(v.currentMileageKm),
    ownerUserId: v.ownerUserId ?? "",
    notes: v.notes ?? "",
  };

  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}`} className="inline-block text-sm text-muted">
        ‹ 차량 정보
      </Link>
      <h1 className="text-xl font-bold">차량 정보 수정</h1>
      <VehicleForm initial={initial} members={Object.entries(names).map(([mid, name]) => ({ id: mid, name }))} today={todayKst()} />
    </div>
  );
}
