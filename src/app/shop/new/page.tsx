import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CarAddWizard } from "@/components/shop/car-add-wizard";
import { MAX_SOURCE_CHARS } from "@/lib/car-draft";
import { isPowertrain, POWERTRAIN_BUTTONS } from "@/lib/powertrain";

export const metadata: Metadata = { title: "차량 추가" };

export default function NewCarPage(props: PageProps<"/shop/new">) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <AppHeader title="차량 추가" />
      <main className="flex-1 space-y-4 p-4 pb-10">
        {/* 검색 파라미터(?type=ev 등)는 요청 시점 데이터라 Suspense 안에서 읽는다 */}
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-soft" aria-hidden />}>
          <NewCarContent searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function NewCarContent({ searchParams }: { searchParams: PageProps<"/shop/new">["searchParams"] }) {
  const query = await searchParams;
  const raw = Array.isArray(query.type) ? query.type[0] : query.type;
  // 차량 유형 버튼에서 들어온 경우에만 그 유형을 적용한다(알 수 없는 값은 무시)
  const type = raw && isPowertrain(raw) ? raw : undefined;

  return (
    <>
      {type ? (
        <Link href={`/shop/type/${type}`} className="inline-block text-sm text-muted">
          ‹ {POWERTRAIN_BUTTONS[type].title} 목록으로
        </Link>
      ) : (
        <Link href="/shop/explore" className="inline-block text-sm text-muted">
          ‹ 탐색으로
        </Link>
      )}
      {type && (
        <p className="text-sm">
          <span className="rounded-full border border-accent bg-accent-soft px-3 py-1 font-semibold text-accent">
            {POWERTRAIN_BUTTONS[type].icon} {POWERTRAIN_BUTTONS[type].title} 추가
          </span>
        </p>
      )}
      <CarAddWizard maxChars={MAX_SOURCE_CHARS} initialType={type} />
    </>
  );
}
