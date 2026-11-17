import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { CostCalculator, type CostCandidate } from "@/components/shop/cost-calculator";
import { getDb } from "@/db";
import { listMyCandidates } from "@/lib/purchase";
import { defaultsFromSpecs } from "@/lib/purchase-cost";

export const metadata: Metadata = { title: "구입 비용 계산기" };

export default function CostPage(props: PageProps<"/shop/prepare/cost">) {
  return (
    <div className="space-y-4">
      <Link href="/shop/prepare" className="inline-block text-sm text-muted">
        ‹ 구입 준비
      </Link>
      <div>
        <h1 className="text-xl font-bold">구입 비용 계산기</h1>
        <p className="mt-1 text-sm text-muted">현금·할부·리스를 같은 기준(5년 등)으로 비교해요. 입력한 값은 저장되지 않아요.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <CostContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function CostContent({ searchParams }: { searchParams: PageProps<"/shop/prepare/cost">["searchParams"] }) {
  const [{ userId, orgId }, query] = await Promise.all([auth(), searchParams]);
  if (!userId || !orgId) redirect("/");

  // DB 를 못 불러와도 직접 입력으로 계산할 수 있게 한다
  let candidates: CostCandidate[] = [];
  try {
    const list = await listMyCandidates(getDb(), orgId, userId);
    candidates = list.map((c) => {
      const d = defaultsFromSpecs(c.powertrain, c.powertrainSpecs as Record<string, unknown> | null);
      return {
        key: c.trimId,
        label: `${c.brandName} ${c.modelName} ${c.trimName}`,
        powertrain: c.powertrain,
        priceMan: c.price != null ? Math.round(c.price / 10_000) : null,
        subsidyMan: c.subsidyEstimate != null ? Math.round(c.subsidyEstimate / 10_000) : null,
        kmPerKwh: d.kmPerKwh,
        kmPerL: d.kmPerL,
      };
    });
  } catch (error) {
    console.error("[cost] 후보를 불러오지 못했어요:", error);
  }

  const trim = Array.isArray(query.trim) ? query.trim[0] : query.trim;
  return <CostCalculator candidates={candidates} initialKey={trim} />;
}
