"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const SHOP_TABS = [
  { href: "/shop/explore", icon: "🔍", label: "탐색" },
  { href: "/shop/compare", icon: "⇄", label: "비교" },
  { href: "/shop/wishlist", icon: "♡", label: "관심" },
  { href: "/shop/prepare", icon: "✅", label: "구입 준비" },
  { href: "/shop/more", icon: "⋯", label: "더보기" },
] as const;

/** 신차 구입 모드 하단 탭바 (현재 경로를 읽으므로 Suspense 안에서 사용) */
export function ShopTabBar() {
  const pathname = usePathname();
  // 모델 상세·이미지 관리·예산 추천·판매 자료는 탐색 탭의 하위 화면으로 본다
  const underExplore = ["/shop/models", "/shop/budget", "/shop/popularity"].some((p) => pathname.startsWith(p));
  const current = underExplore ? "/shop/explore" : pathname;
  return <TabBarView activeHref={SHOP_TABS.find((t) => current.startsWith(t.href))?.href} />;
}

/** 경로를 아직 모를 때(Suspense fallback)와 실제 렌더에서 같은 모양을 쓴다 */
export function TabBarView({ activeHref }: { activeHref?: string }) {
  return (
    <nav
      aria-label="신차 구입 메뉴"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {SHOP_TABS.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? "font-bold text-accent" : "text-muted"
                }`}
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
