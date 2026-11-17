import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EMPTY_VEHICLE, VehicleForm } from "@/components/cars/forms";
import { todayKst } from "@/lib/car-care";
import { requireOrg } from "@/lib/cars-server";
import { getMemberNames } from "@/lib/members";

export const metadata: Metadata = { title: "차량 등록" };

export default function NewVehiclePage() {
  return (
    <div className="space-y-4">
      <Link href="/cars/vehicles" className="inline-block text-sm text-muted">
        ‹ 내 차
      </Link>
      <h1 className="text-xl font-bold">차량 등록</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <FormLoader />
      </Suspense>
    </div>
  );
}

async function FormLoader() {
  const { orgId } = await requireOrg();
  const names = await getMemberNames(orgId);
  const members = Object.entries(names).map(([id, name]) => ({ id, name }));
  return <VehicleForm initial={EMPTY_VEHICLE} members={members} today={todayKst()} />;
}
