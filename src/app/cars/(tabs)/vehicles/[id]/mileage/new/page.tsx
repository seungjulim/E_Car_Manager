import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { MileageForm } from "@/components/cars/forms";
import { todayKst } from "@/lib/car-care";
import { vehicleLabel } from "@/lib/cars";
import { requireVehicle } from "@/lib/cars-server";

export const metadata: Metadata = { title: "주행거리 기록" };

export default function NewMileagePage(props: PageProps<"/cars/vehicles/[id]/mileage/new">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/cars/vehicles/[id]/mileage/new">["params"] }) {
  const { id } = await params;
  const { vehicle: v } = await requireVehicle(id);
  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=mileage`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)}
      </Link>
      <h1 className="text-xl font-bold">주행거리 기록</h1>
      <MileageForm vehicleId={v.id} today={todayKst()} currentKm={v.currentMileageKm} />
    </div>
  );
}
