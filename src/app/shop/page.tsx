import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppHeader } from "@/components/app-header";
import { PowertrainPicker } from "@/components/shop/powertrain-picker";
import { POWERTRAINS, POWERTRAIN_BUTTONS, toInitialSelection } from "@/lib/powertrain";
import { getPowertrainPreference } from "@/lib/preferences";

export const metadata: Metadata = { title: "신차 구입" };

export default function ShopPage(props: PageProps<"/shop">) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <AppHeader title="신차 구입" />
      <main className="flex-1 p-4">
        {/* 로그인 세션·검색 파라미터는 요청 시점 데이터라 Suspense 안에서 읽는다 */}
        <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-soft" />}>
          <PickerLoader searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function PickerLoader({ searchParams }: { searchParams: PageProps<"/shop">["searchParams"] }) {
  const [{ userId, orgId }, query] = await Promise.all([auth(), searchParams]);

  // 가족(조직)이 선택되지 않았다면 홈에서 먼저 선택하게 한다.
  if (!userId || !orgId) redirect("/");

  // 탐색 화면의 "유형 변경"(?edit=1)은 예전의 알아볼 유형 선택(여러 개 선택) 화면을 연다
  if (query.edit === "1") {
    const pref = await getPowertrainPreference(orgId, userId);
    const initial = toInitialSelection(pref);
    return <PowertrainPicker initialGroups={initial.groups} initialHybridTypes={initial.hybridTypes} />;
  }

  // 기본 화면: 차량 유형 버튼. 누르면 그 유형의 차량 이름 목록 페이지로 이동한다.
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">어떤 유형의 차를 볼까요?</h2>
        <p className="mt-1 text-sm text-muted">유형을 누르면 그 유형의 차량 이름을 골라 볼 수 있어요.</p>
      </div>
      <ul className="space-y-3">
        {POWERTRAINS.map((type) => {
          const info = POWERTRAIN_BUTTONS[type];
          return (
            <li key={type}>
              <Link
                href={`/shop/type/${type}`}
                className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-line bg-surface p-4 transition-colors hover:border-accent"
              >
                <span className="w-10 text-center text-3xl" aria-hidden>
                  {info.icon}
                </span>
                <span className="flex-1">
                  <b className="block text-lg">{info.title}</b>
                  <span className="block text-sm text-muted">{info.desc}</span>
                </span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/shop/explore" className="rounded-full border border-line bg-surface px-3 py-1.5">
          전체 탐색·예산 추천 ›
        </Link>
        <Link href="/shop?edit=1" className="rounded-full border border-line bg-surface px-3 py-1.5">
          알아볼 유형 설정
        </Link>
      </div>
    </div>
  );
}
