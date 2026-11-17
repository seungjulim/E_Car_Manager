import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { WeightsEditor, type WeightRow } from "@/components/shop/weights-editor";
import { getDb } from "@/db";
import { CRITERIA, loadWeights } from "@/lib/purchase";

export const metadata: Metadata = { title: "체크 항목 중요도" };

export default function WeightsPage() {
  return (
    <div className="space-y-4">
      <Link href="/shop/prepare" className="inline-block text-sm text-muted">
        ‹ 구입 준비
      </Link>
      <div>
        <h1 className="text-xl font-bold">체크 항목 중요도</h1>
        <p className="mt-1 text-sm text-muted">
          우리 가족에게 더 중요한 항목일수록 총점에 크게 반영돼요. 중요도는 사람마다 따로 저장돼요.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <WeightsContent />
      </Suspense>
    </div>
  );
}

async function WeightsContent() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) redirect("/");

  let weights: Record<string, number> = {};
  try {
    weights = await loadWeights(getDb(), orgId, userId);
  } catch (error) {
    console.error("[weights] 불러오기 실패:", error);
    return (
      <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        중요도를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  const rows: WeightRow[] = CRITERIA.map((c) => ({
    code: c.code,
    name: c.name,
    question: c.question,
    defaultWeight: c.defaultWeight,
    weight: weights[c.code] ?? c.defaultWeight,
  }));
  return <WeightsEditor rows={rows} />;
}
