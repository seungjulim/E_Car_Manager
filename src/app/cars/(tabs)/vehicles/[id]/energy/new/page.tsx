import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EnergyForm } from "@/components/cars/forms";
import { todayKst } from "@/lib/car-care";
import { vehicleLabel } from "@/lib/cars";
import { requireVehicle } from "@/lib/cars-server";

export const metadata: Metadata = { title: "충전·주유 기록" };

export default function NewEnergyPage(props: PageProps<"/cars/vehicles/[id]/energy/new">) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/cars/vehicles/[id]/energy/new">["params"] }) {
  const { id } = await params;
  const { vehicle: v } = await requireVehicle(id);
  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=energy`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)}
      </Link>
      <h1 className="text-xl font-bold">{v.powertrain === "ev" ? "충전 기록" : v.powertrain === "phev" ? "충전·주유 기록" : "주유 기록"}</h1>
      <EnergyForm vehicleId={v.id} powertrain={v.powertrain} today={todayKst()} />
    </div>
  );
}
