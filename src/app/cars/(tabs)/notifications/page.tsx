import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationList } from "@/components/cars/notification-list";
import { EmptyBox } from "@/components/cars/ui";
import { getDb } from "@/db";
import { requireOrg } from "@/lib/cars-server";
import { listNotifications } from "@/lib/notifications";

export const metadata: Metadata = { title: "알림 센터" };

export default function NotificationsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">알림 센터</h1>
        <Link href="/cars/notifications/settings" className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
          ⚙ 알림 설정
        </Link>
      </div>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const { userId, orgId } = await requireOrg();
  const list = await listNotifications(getDb(), orgId, userId);

  if (list.length === 0) {
    return (
      <EmptyBox title="아직 받은 알림이 없어요" action={{ href: "/cars/notifications/settings", label: "알림 설정 보기" }}>
        정비 예정일이나 보험 만기가 다가오면 여기에 알려 드려요. 기본은 1개월 전과 1주일 전이에요.
      </EmptyBox>
    );
  }

  return (
    <NotificationList
      items={list.map((n) => ({ id: n.id, title: n.title, body: n.body, deepLink: n.deepLink, read: n.readAt != null, createdAt: n.createdAt.toISOString() }))}
    />
  );
}
