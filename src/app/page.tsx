import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { OrganizationList } from "@clerk/nextjs";
import { AppHeader } from "@/components/app-header";
import { ExitButton } from "@/components/exit-button";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <AppHeader title="E-car-manage" />
      <main className="flex flex-1 flex-col p-4">
        {/* 로그인 세션(요청 시점 데이터)은 Suspense 안에서 읽는다 */}
        <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-soft" />}>
          <ModePicker />
        </Suspense>
      </main>
    </div>
  );
}

async function ModePicker() {
  const { orgId } = await auth();

  // 가족(Clerk Organization)이 아직 없으면 먼저 만들거나 합류하게 한다.
  if (!orgId) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold">가족을 선택해 주세요</h2>
        <p className="text-sm text-muted">
          차량과 기록은 가족 단위로 함께 관리돼요. 새 가족을 만들거나 초대받은 가족에 합류하세요.
        </p>
        <OrganizationList
          hidePersonal
          afterSelectOrganizationUrl="/"
          afterCreateOrganizationUrl="/"
        />
      </section>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <section className="space-y-3">
        <h2 className="text-lg font-bold">무엇을 할까요?</h2>
        <ModeCard
          href="/shop"
          icon="🔍"
          title="신차 구입"
          desc="취향·유형별 탐색, 비교, 구입 준비 체크"
        />
        <ModeCard
          href="/cars"
          icon="🚗"
          title="차량 관리"
          desc="정비·점검·보험·주행거리·비용"
        />
      </section>
      {/* 화면 맨 아래 가운데 */}
      <div className="mt-auto flex justify-center pb-2 pt-10">
        <ExitButton />
      </div>
    </div>
  );
}

function ModeCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-accent"
    >
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-base font-bold">{title}</span>
        <span className="block text-sm text-muted">{desc}</span>
      </span>
      <span aria-hidden>›</span>
    </Link>
  );
}
