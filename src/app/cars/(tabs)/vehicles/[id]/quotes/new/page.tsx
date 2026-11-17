import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { QuoteRequestForm } from "@/components/cars/quote-forms";
import { vehicleLabel } from "@/lib/cars";
import { firstParam, requireVehicle } from "@/lib/cars-server";

export const metadata: Metadata = { title: "수리 견적 요청" };

export default function NewQuoteRequestPage(props: PageProps<"/cars/vehicles/[id]/quotes/new">) {
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
  params: PageProps<"/cars/vehicles/[id]/quotes/new">["params"];
  searchParams: PageProps<"/cars/vehicles/[id]/quotes/new">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { vehicle: v } = await requireVehicle(id);
  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=quotes`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)}
      </Link>
      <div>
        <h1 className="text-xl font-bold">수리 견적 받기</h1>
        <p className="mt-1 text-sm text-muted">수리 내용을 적고, 여러 정비소에서 받은 견적을 모아 최저가 TOP 10으로 비교해요.</p>
        <p className="mt-1 text-xs text-muted">※ 견적 금액은 앱이 자동으로 찾아 주지 않아요. 전화·방문·견적서로 받은 금액을 직접 입력해 주세요.</p>
      </div>
      <QuoteRequestForm vehicleId={v.id} powertrain={v.powertrain} initialItem={firstParam(query.item) ?? ""} />
    </div>
  );
}
