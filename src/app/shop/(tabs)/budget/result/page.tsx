import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { RecommendationCard } from "@/components/shop/recommendation-card";
import { getDb } from "@/db";
import {
  manToWon,
  parseBudgetQuery,
  SORT_LABEL,
  toBudgetQuery,
  type BudgetCondition,
} from "@/lib/budget-query";
import { formatManwon } from "@/lib/format";
import { recommend, type RecommendResult, type SortMode } from "@/lib/recommend";
import { loadCandidates, loadPopularity, loadPreferences } from "@/lib/recommend-data";

export const metadata: Metadata = { title: "예산별 추천 TOP 10" };

const SORTS: SortMode[] = ["popular", "taste", "combined"];

export default function BudgetResultPage(props: PageProps<"/shop/budget/result">) {
  return (
    <Suspense fallback={<ResultSkeleton />}>
      <ResultContent searchParams={props.searchParams} />
    </Suspense>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-24 animate-pulse rounded-xl bg-soft" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-soft" />
      ))}
    </div>
  );
}

async function ResultContent({ searchParams }: { searchParams: PageProps<"/shop/budget/result">["searchParams"] }) {
  const [{ userId, orgId }, query] = await Promise.all([auth(), searchParams]);
  if (!userId || !orgId) redirect("/");

  const condition = parseBudgetQuery(query);
  if (!condition) redirect("/shop/budget");

  let result: RecommendResult;
  try {
    const db = getDb();
    const [candidates, popularity, prefs] = await Promise.all([
      loadCandidates(db, orgId, condition.powertrains),
      loadPopularity(db, orgId),
      loadPreferences(db, orgId, userId),
    ]);
    result = recommend(candidates, popularity, prefs, {
      minWon: manToWon(condition.minMan),
      maxWon: manToWon(condition.maxMan),
      includeSubsidy: condition.subsidy,
      powertrains: condition.powertrains,
      segments: condition.segments,
      sortMode: condition.sort,
    });
  } catch (error) {
    console.error("[budget result] 추천 계산 실패:", error);
    return (
      <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  const withSort = (sort: SortMode) => toBudgetQuery({ ...condition, sort });
  const summary = describe(condition);

  return (
    <div className="space-y-4">
      <Link href={`/shop/budget?${toBudgetQuery(condition)}`} className="inline-block text-sm text-muted">
        ‹ 조건 변경
      </Link>

      <section className="rounded-xl border border-accent bg-accent-soft p-4">
        <h1 className="text-lg font-bold">
          {formatManwon(manToWon(condition.minMan))} ~ {formatManwon(manToWon(condition.maxMan))}
        </h1>
        <p className="text-sm text-muted">{summary}</p>
        <p className="mt-1 text-sm">
          예산 안에 드는 모델 <b>{result.totalCandidates}</b>개
          {result.popularityAnchor && <span className="text-muted"> · 판매 자료 {result.popularityAnchor}월 기준 최근 3개월</span>}
        </p>
      </section>

      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="정렬 기준">
        {SORTS.map((s) => (
          <Link
            key={s}
            href={`/shop/budget/result?${withSort(s)}`}
            aria-current={condition.sort === s ? "true" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              condition.sort === s ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
            }`}
          >
            {SORT_LABEL[s]}
          </Link>
        ))}
      </div>

      {!result.hasPopularityData && result.totalCandidates > 0 && (
        <div role="note" className="rounded-xl border border-warn bg-warn-soft p-3 text-sm text-warn">
          판매 순위 자료가 없어서 인기 순위를 매기지 못했어요. 지금은 취향·가격이 낮은 순으로 보여 드려요.{" "}
          <Link href="/shop/popularity" className="font-semibold underline">
            판매 순위 자료 추가
          </Link>
        </div>
      )}
      {!result.hasTasteData && condition.sort !== "popular" && result.totalCandidates > 0 && (
        <div role="note" className="rounded-xl border border-line bg-soft p-3 text-sm text-muted">
          저장된 취향(차급·중요 편의사양)이 없어서 취향 점수를 계산하지 못했어요. 취향 설정은 준비 중이에요.
        </div>
      )}

      {result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center">
          <h2 className="font-bold">예산에 맞는 모델이 없어요</h2>
          <p className="mt-1 text-sm text-muted">
            카탈로그에 가격이 등록된 모델이 없거나, 조건에 맞는 트림이 없어요. 예산·유형·차급을 바꾸거나 차량을 추가해 보세요.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Link href={`/shop/budget?${toBudgetQuery(condition)}`} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
              조건 변경
            </Link>
            <Link href="/shop/new" className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
              차량 추가
            </Link>
          </div>
        </div>
      ) : (
        <ol className="space-y-3" aria-label="추천 모델">
          {result.items.map((item, i) => (
            <RecommendationCard key={item.modelId} item={item} rank={i + 1} />
          ))}
        </ol>
      )}

      {result.budgetUpSuggestion && (
        <div className="rounded-xl border border-dashed border-line p-4">
          <b>예산을 {formatManwon(result.budgetUpSuggestion.addWon)} 올리면 {result.budgetUpSuggestion.extra}개 모델이 더 보여요</b>
          <div>
            <Link
              href={`/shop/budget/result?${toBudgetQuery({ ...condition, maxMan: condition.maxMan + result.budgetUpSuggestion.addWon / 10_000 })}`}
              className="mt-2 inline-block rounded-full border border-line px-3 py-1.5 text-sm font-semibold"
            >
              최대 예산 올려서 보기
            </Link>
          </div>
        </div>
      )}

      {result.missingPrice.length > 0 && (
        <div className="rounded-xl border border-dashed border-line p-4">
          <b>가격 정보가 없어 빠진 인기 모델</b>
          <p className="mt-1 text-sm text-muted">
            {result.missingPrice.map((m) => `${m.brandName ? `${m.brandName} ` : ""}${m.name}`).join(", ")}
          </p>
          <Link href="/shop/new" className="mt-2 inline-block rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
            + 차량·가격 추가
          </Link>
        </div>
      )}

      <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">
        판매량은 렌터카·법인 수요와 프로모션의 영향을 받아요. 인기 모델이 우리 가족에게 맞는 차라는 뜻은 아니니, 구입 전 체크 TOP 10(준비 중)도
        함께 확인해 보세요. 가격은 등록해 둔 자료 기준이며 옵션·세금에 따라 달라질 수 있어요.
      </p>
    </div>
  );
}

function describe(c: BudgetCondition): string {
  const pt = { ev: "전기차", hev: "HEV", phev: "PHEV", ice: "내연기관" } as const;
  const parts = [
    c.powertrains.map((p) => pt[p]).join("·"),
    c.segments.length > 0 ? c.segments.join("·") : "전체 차급",
    SORT_LABEL[c.sort],
    c.powertrains.some((p) => p !== "ice") ? (c.subsidy ? "보조금 반영" : "보조금 미반영") : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
