import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { ComingSoon } from "@/components/coming-soon";
import { ModelCardView } from "@/components/shop/model-card";
import { getDb } from "@/db";
import { listBrandsWithModels, listModelCards } from "@/lib/catalog";
import { selectionChips } from "@/lib/powertrain";
import { getPowertrainPreference } from "@/lib/preferences";

export const metadata: Metadata = { title: "신차 탐색" };

export default function ExplorePage(props: PageProps<"/shop/explore">) {
  return (
    // 로그인 세션·검색 파라미터·DB 조회는 요청 시점 데이터라 Suspense 안에서 처리한다
    <Suspense fallback={<ExploreSkeleton />}>
      <ExploreContent searchParams={props.searchParams} />
    </Suspense>
  );
}

function ExploreSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-8 w-2/3 animate-pulse rounded-full bg-soft" />
      <div className="h-20 animate-pulse rounded-xl bg-soft" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-soft" />
        ))}
      </div>
    </div>
  );
}

async function ExploreContent({ searchParams }: { searchParams: PageProps<"/shop/explore">["searchParams"] }) {
  const [{ userId, orgId }, query] = await Promise.all([auth(), searchParams]);
  if (!userId || !orgId) redirect("/");

  const pref = await getPowertrainPreference(orgId, userId);
  if (!pref) redirect("/shop"); // 아직 유형을 고르지 않았다면 선택 화면으로

  // ?brand=<uuid> 만 허용 (그 외 값은 무시하고 전체 표시)
  const brandId = z.uuid().safeParse(query.brand).data;

  let brands: Awaited<ReturnType<typeof listBrandsWithModels>> = [];
  let models: Awaited<ReturnType<typeof listModelCards>> = [];
  let loadFailed = false;
  try {
    const db = getDb();
    [brands, models] = await Promise.all([
      listBrandsWithModels(db, orgId, pref.powertrains),
      listModelCards(db, orgId, { powertrains: pref.powertrains, brandId }),
    ]);
  } catch (error) {
    console.error("[explore] 차량 목록을 불러오지 못했어요:", error);
    loadFailed = true;
  }

  return (
    <>
      {/* 선택한 유형 + 변경 */}
      <div className="flex flex-wrap items-center gap-2">
        {selectionChips(pref).map((label) => (
          <span
            key={label}
            className="rounded-full border border-accent bg-accent-soft px-3 py-1 text-sm font-semibold text-accent"
          >
            {label}
          </span>
        ))}
        <Link href="/shop?edit=1" className="rounded-full border border-line bg-surface px-3 py-1 text-sm">
          유형 변경
        </Link>
      </div>

      {!pref.decided && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <b>유형 비교 가이드</b>
          <p className="mt-1 text-sm text-muted">
            주행 패턴·충전 환경·예산 질문 몇 개로 어울리는 유형을 추천해 드려요. (준비 중)
          </p>
        </div>
      )}

      <Link
        href="/shop/budget"
        className="flex items-center justify-between rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent"
      >
        <span>
          💰 <b>예산으로 추천받기</b>
          <span className="block text-sm text-muted">예산을 넣으면 인기 TOP 10 모델을 보여 줘요</span>
        </span>
        <span aria-hidden>›</span>
      </Link>

      {loadFailed ? (
        <ComingSoon title="차량 목록을 불러오지 못했어요">
          잠시 후 다시 시도해 주세요. (DB 연결을 확인해 주세요)
        </ComingSoon>
      ) : (
        <>
          {brands.length > 0 && (
            <section aria-label="브랜드">
              <h2 className="mb-2 font-bold">브랜드</h2>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                <BrandChip href="/shop/explore" active={!brandId} label="전체" />
                {brands.map((b) => (
                  <BrandChip
                    key={b.id}
                    href={`/shop/explore?brand=${b.id}`}
                    active={brandId === b.id}
                    label={`${b.name} ${b.modelCount}`}
                  />
                ))}
              </div>
            </section>
          )}

          <section aria-label="차량 목록">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">{brandId ? "선택한 브랜드" : "등록된 차량"}</h2>
              <Link href="/shop/new" className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                + 차량 추가
              </Link>
            </div>
            {models.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-6 text-center">
                <h3 className="font-bold">아직 등록된 차량이 없어요</h3>
                <p className="mt-1 text-sm text-muted">제조사 자료를 붙여넣으면 Claude가 정리해 드려요.</p>
                <Link
                  href="/shop/new"
                  className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
                >
                  첫 차량 추가하기
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {models.map((m) => (
                  <ModelCardView key={m.id} model={m} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function BrandChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
      }`}
    >
      {label}
    </Link>
  );
}
