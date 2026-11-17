import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { BudgetForm } from "@/components/shop/budget-form";
import { getDb } from "@/db";
import { DEFAULT_CONDITION, parseBudgetQuery, type BudgetCondition } from "@/lib/budget-query";
import { getPowertrainPreference } from "@/lib/preferences";
import { getPopularityStatus, loadPreferences } from "@/lib/recommend-data";

export const metadata: Metadata = { title: "예산으로 추천받기" };

export default function BudgetPage(props: PageProps<"/shop/budget">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">예산으로 추천받기</h1>
        <p className="mt-1 text-sm text-muted">
          예산을 넣으면 그 가격대에서 인기 있는 모델 TOP 10을 보여 드려요.{" "}
          <Link href="/shop/taste" className="underline">
            취향 설정
          </Link>
          으로 선호 차급·중요한 사양을 알려 주면 더 잘 맞아요.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <BudgetContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function BudgetContent({ searchParams }: { searchParams: PageProps<"/shop/budget">["searchParams"] }) {
  const [{ userId, orgId }, query] = await Promise.all([auth(), searchParams]);
  if (!userId || !orgId) redirect("/");

  const db = getDb();
  const [pref, status, saved] = await Promise.all([
    getPowertrainPreference(orgId, userId),
    getPopularityStatus(db, orgId).catch(() => ({ latestMonth: null, rowCount: 0 })),
    loadPreferences(db, orgId, userId).catch(() => null),
  ]);

  // 결과 화면의 "조건 변경"으로 왔다면 그 조건을 그대로, 아니면 저장된 취향·기본값으로 채운다
  const fromQuery = parseBudgetQuery(query);
  const initial: BudgetCondition =
    fromQuery ?? {
      ...DEFAULT_CONDITION,
      minMan: saved?.budgetMin != null ? Math.round(saved.budgetMin / 10_000) : DEFAULT_CONDITION.minMan,
      maxMan: saved?.budgetMax != null ? Math.round(saved.budgetMax / 10_000) : DEFAULT_CONDITION.maxMan,
      powertrains: pref?.powertrains ?? DEFAULT_CONDITION.powertrains,
    };

  return (
    <>
      <BudgetForm initial={initial} />
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-bold">판매 순위 자료</h2>
        {status.latestMonth ? (
          <p className="mt-1 text-sm text-muted">
            최근 자료: {status.latestMonth} · 모델 {status.rowCount.toLocaleString("ko-KR")}행. 매달 새 자료를 넣으면 추천이 정확해져요.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">아직 판매 순위 자료가 없어요. 자료가 없으면 인기순 대신 가격이 낮은 순으로 보여 드려요.</p>
        )}
        <Link href="/shop/popularity" className="mt-3 inline-block rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
          판매 순위 자료 추가
        </Link>
      </section>
    </>
  );
}
