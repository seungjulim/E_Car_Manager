import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { TasteForm } from "@/components/shop/taste-form";
import { getDb } from "@/db";
import { getPowertrainPreference } from "@/lib/preferences";
import { selectionChips } from "@/lib/powertrain";
import { toTasteInput } from "@/lib/taste";
import { listCatalogFeatureNames, loadTasteRow } from "@/lib/taste-data";

export const metadata: Metadata = { title: "내 취향 설정" };

export default function TastePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">내 취향 설정</h1>
        <p className="mt-1 text-sm text-muted">선호 차급과 중요한 사양을 알려 주면 예산 추천에서 취향에 맞는 모델이 더 위로 올라와요. 가족 구성원마다 따로 저장돼요.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) redirect("/");
  const db = getDb();
  const [row, pt, catalogFeatures] = await Promise.all([
    loadTasteRow(db, orgId, userId).catch(() => null),
    getPowertrainPreference(orgId, userId),
    listCatalogFeatureNames(db, orgId).catch(() => []),
  ]);

  return (
    <>
      <section className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">차량 유형</p>
          <p className="truncate font-semibold">{pt ? selectionChips(pt).join(" · ") : "아직 고르지 않았어요"}</p>
        </div>
        <Link href="/shop?edit=1" className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
          유형 바꾸기
        </Link>
      </section>
      <TasteForm initial={toTasteInput(row)} catalogFeatures={catalogFeatures} />
    </>
  );
}
