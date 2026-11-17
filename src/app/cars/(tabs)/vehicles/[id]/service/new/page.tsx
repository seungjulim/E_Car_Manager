import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ServiceForm } from "@/components/cars/forms";
import { todayKst } from "@/lib/car-care";
import { vehicleLabel } from "@/lib/cars";
import { firstParam, requireVehicle } from "@/lib/cars-server";
import { getDb } from "@/db";
import { getQuoteBrief } from "@/lib/repairs";
import { z } from "zod";

export const metadata: Metadata = { title: "정비 기록" };

export default function NewServicePage(props: PageProps<"/cars/vehicles/[id]/service/new">) {
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
  params: PageProps<"/cars/vehicles/[id]/service/new">["params"];
  searchParams: PageProps<"/cars/vehicles/[id]/service/new">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { orgId, vehicle: v } = await requireVehicle(id);
  // 견적을 따라 한 정비라면 비교 대상 견적(이 가족·이 차량 것일 때만)
  const rawQuote = firstParam(query.quote);
  const found = rawQuote && z.uuid().safeParse(rawQuote).success ? await getQuoteBrief(getDb(), orgId, rawQuote) : null;
  const quote = found && found.vehicleId === v.id ? { id: found.id, shopName: found.shopName, totalAmount: found.totalAmount } : null;
  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=service`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)}
      </Link>
      <h1 className="text-xl font-bold">정비 기록</h1>
      <ServiceForm vehicleId={v.id} powertrain={v.powertrain} currentKm={v.currentMileageKm} today={todayKst()} initialItem={firstParam(query.item) ?? ""}
        quote={quote}
        initialShop={(firstParam(query.shop) ?? "").slice(0, 60)}
        initialCost={/^\d{1,10}$/.test(firstParam(query.cost) ?? "") ? (firstParam(query.cost) as string) : ""}
      />
    </div>
  );
}
