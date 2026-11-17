import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

/** 상단 바: 가족(조직) 전환 + 사용자 메뉴. 홈 버튼은 모드 선택 화면으로 이동. */
export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
      <Link
        href="/"
        aria-label="모드 선택으로"
        className="grid size-8 place-items-center rounded-lg border border-line text-sm"
      >
        ⌂
      </Link>
      <h1 className="flex-1 truncate text-base font-bold">{title}</h1>
      <OrganizationSwitcher
        hidePersonal
        afterSelectOrganizationUrl="/"
        afterCreateOrganizationUrl="/"
      />
      <UserButton />
    </header>
  );
}
