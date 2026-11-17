import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppHeader } from "@/components/app-header";
import { PowertrainPicker } from "@/components/shop/powertrain-picker";
import { toInitialSelection } from "@/lib/powertrain";
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

  const pref = await getPowertrainPreference(orgId, userId);

  // 이미 선택해 둔 경우 선택 화면은 건너뛴다. (탐색 화면의 "유형 변경"은 ?edit=1 로 다시 연다)
  const editing = query.edit === "1";
  if (pref && !editing) redirect("/shop/explore");

  const initial = toInitialSelection(pref);
  return <PowertrainPicker initialGroups={initial.groups} initialHybridTypes={initial.hybridTypes} />;
}
