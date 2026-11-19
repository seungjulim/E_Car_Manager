import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { TypeCarPicker } from "@/components/shop/type-car-picker";
import { getDb } from "@/db";
import { formatPriceRange, listModelCards } from "@/lib/catalog";
import { isPowertrain, POWERTRAIN_BUTTONS } from "@/lib/powertrain";

export const metadata: Metadata = { title: "차량 선택" };

export default function TypePage(props: PageProps<"/shop/type/[type]">) {
  return (
    // 로그인 세션·경로 값·DB 조회는 요청 시점 데이터라 Suspense 안에서 처리한다
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <TypeContent params={props.params} />
    </Suspense>
  );
}

async function TypeContent({ params }: { params: PageProps<"/shop/type/[type]">["params"] }) {
  const [{ userId, orgId }, { type }] = await Promise.all([auth(), params]);
  if (!userId || !orgId) redirect("/");
  if (!isPowertrain(type)) notFound();

  const info = POWERTRAIN_BUTTONS[type];

  let options: { id: string; label: string; priceText: string }[] = [];
  let loadFailed = false;
  try {
    const cards = await listModelCards(getDb(), orgId, { powertrains: [type], limit: 200 });
    options = cards.map((c) => ({
      id: c.id,
      label: `${c.brandName} ${c.name}`,
      priceText: formatPriceRange(c.priceMin, c.priceMax),
    }));
  } catch (error) {
    console.error("[shop/type] 차량 목록을 불러오지 못했어요:", error);
    loadFailed = true;
  }

  return (
    <>
      <Link href="/shop" className="inline-block text-sm text-muted">
        ‹ 차량 유형
      </Link>
      <div>
        <h1 className="text-xl font-bold">
          <span aria-hidden>{info.icon}</span> {info.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{info.desc}</p>
      </div>

      {loadFailed ? (
        <div role="alert" className="rounded-xl border border-warn bg-warn-soft p-4 text-sm text-warn">
          차량 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.
        </div>
      ) : options.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <b>아직 저장된 {info.title} 차량이 없어요</b>
          <p className="text-sm text-muted">차량 추가 화면에서 &lsquo;예시 문구 선택&rsquo;으로 조사해 둔 자료를 불러와 저장할 수 있어요.</p>
          <Link href={`/shop/new?type=${type}`} className="flex min-h-12 items-center justify-center rounded-xl bg-accent font-semibold text-white">
            + 차량 추가
          </Link>
        </div>
      ) : (
        <>
          <TypeCarPicker options={options} />
          <Link href={`/shop/new?type=${type}`} className="flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface font-semibold">
            + {info.title} 차량 추가
          </Link>
        </>
      )}
    </>
  );
}
