"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const CAR_TABS = [
  { href: "/cars", icon: "🏠", label: "홈", exact: true },
  { href: "/cars/vehicles", icon: "🚗", label: "내 차" },
  { href: "/cars/schedule", icon: "📅", label: "일정" },
  { href: "/cars/costs", icon: "💰", label: "비용" },
  { href: "/cars/more", icon: "⋯", label: "더보기" },
] as const;

/** 차량 관리 모드 하단 탭바 (현재 경로를 읽으므로 Suspense 안에서 사용) */
export function CarTabBar() {
  const pathname = usePathname();
  const active = CAR_TABS.find((t) => ("exact" in t && t.exact ? pathname === t.href : pathname.startsWith(t.href)))?.href;
  return <CarTabBarView activeHref={active} />;
}

export function CarTabBarView({ activeHref }: { activeHref?: string }) {
  return (
    <nav
      aria-label="차량 관리 메뉴"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {CAR_TABS.map((tab) => {
          const on = tab.href === activeHref;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "font-bold text-accent" : "text-muted"}`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
