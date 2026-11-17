import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { ChecklistEditor, type ChecklistCriterion } from "@/components/shop/checklist-editor";
import { getDb } from "@/db";
import { formatManwon } from "@/lib/format";
import { CRITERIA, getMyCandidate, loadChecks, loadWeights, type PurchaseCandidate } from "@/lib/purchase";
import type { CheckValue } from "@/lib/purchase-score";

export const metadata: Metadata = { title: "구입 전 체크" };

export default function ChecklistPage(props: PageProps<"/shop/prepare/checklist/[wishlistId]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <ChecklistContent params={props.params} />
    </Suspense>
  );
}

async function ChecklistContent({ params }: { params: PageProps<"/shop/prepare/checklist/[wishlistId]">["params"] }) {
  const [{ userId, orgId }, { wishlistId }] = await Promise.all([auth(), params]);
  if (!userId || !orgId) redirect("/");
  if (!z.uuid().safeParse(wishlistId).success) notFound();

  let candidate: PurchaseCandidate | null;
  let checks: Record<string, CheckValue> = {};
  let weights: Record<string, number> = {};
  try {
    const db = getDb();
    candidate = await getMyCandidate(db, orgId, userId, wishlistId);
    if (candidate) {
      const [allChecks, w] = await Promise.all([loadChecks(db, orgId, userId, [wishlistId]), loadWeights(db, orgId, userId)]);
      checks = allChecks[wishlistId] ?? {};
      weights = w;
    }
  } catch (error) {
    console.error("[checklist] 불러오기 실패:", error);
    return (
      <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        체크 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }
  if (!candidate) notFound(); // 내 관심 목록의 후보만 체크할 수 있다

  const criteria: ChecklistCriterion[] = CRITERIA.map((c) => ({
    code: c.code,
    name: c.name,
    question: c.question,
    extraQuestion: c.extraQuestions?.[candidate.powertrain] ?? null,
    weight: weights[c.code] ?? c.defaultWeight,
  }));

  return (
    <div className="space-y-4">
      <Link href="/shop/prepare" className="inline-block text-sm text-muted">
        ‹ 구입 준비
      </Link>
      <div>
        <p className="text-xs text-muted">{candidate.brandName}</p>
        <h1 className="text-xl font-bold">
          {candidate.modelName} <span className="text-base font-normal">{candidate.trimName}</span>
        </h1>
        <p className="text-sm text-muted">
          {candidate.price != null ? formatManwon(candidate.price) : "가격 미등록"} · 구입 전 체크 TOP 10
        </p>
      </div>
      <ChecklistEditor wishlistId={wishlistId} criteria={criteria} initial={checks} />
      <Link href="/shop/prepare/weights" className="block text-center text-sm text-muted underline">
        항목 중요도 바꾸기
      </Link>
    </div>
  );
}
