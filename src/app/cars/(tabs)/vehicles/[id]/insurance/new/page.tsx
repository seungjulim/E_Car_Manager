import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PolicyForm } from "@/components/cars/forms";
import { vehicleLabel } from "@/lib/cars";
import { requireVehicle } from "@/lib/cars-server";

export const metadata: Metadata = { title: "보험 추가" };

export default function NewPolicyPage(props: PageProps<"/cars/vehicles/[id]/insurance/new">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/cars/vehicles/[id]/insurance/new">["params"] }) {
  const { id } = await params;
  const { vehicle: v } = await requireVehicle(id);
  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=insurance`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)}
      </Link>
      <h1 className="text-xl font-bold">보험 추가</h1>
      <PolicyForm vehicleId={v.id} />
    </div>
  );
}
