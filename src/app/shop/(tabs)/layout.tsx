import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { CompareBar } from "@/components/shop/compare-basket";
import { ShopTabBar, TabBarView } from "@/components/shop/shop-tab-bar";

/** 파워트레인 선택 이후 화면들이 공유하는 틀: 상단 바 + (비교 담기 바) + 하단 탭바 */
export default function ShopTabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <AppHeader title="신차 구입" />
      <main className="flex-1 space-y-4 p-4 pb-36">{children}</main>
      <CompareBar />
      <Suspense fallback={<TabBarView />}>
        <ShopTabBar />
      </Suspense>
    </div>
  );
}
