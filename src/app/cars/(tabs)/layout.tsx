import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { CarTabBar, CarTabBarView } from "@/components/cars/car-tab-bar";

/** 차량 관리 모드 공통 틀: 상단 바 + 하단 탭바 */
export default function CarsTabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <AppHeader title="차량 관리" />
      <main className="flex-1 space-y-4 p-4 pb-24">{children}</main>
      <Suspense fallback={<CarTabBarView />}>
        <CarTabBar />
      </Suspense>
    </div>
  );
}
