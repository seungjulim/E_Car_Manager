import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationSettingsForm } from "@/components/cars/notification-settings-form";
import { PushToggle } from "@/components/cars/push-toggle";
import { getDb } from "@/db";
import { requireOrg } from "@/lib/cars-server";
import { loadSettings } from "@/lib/notifications";

export const metadata: Metadata = { title: "알림 설정" };

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-4">
      <Link href="/cars/notifications" className="inline-block text-sm text-muted">
        ‹ 알림 센터
      </Link>
      <div>
        <h1 className="text-xl font-bold">알림 설정</h1>
        <p className="mt-1 text-sm text-muted">정비 예정과 보험 만기를 미리 알려 드려요. 매일 오전 9시쯤 확인해서 보내요.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const { userId, orgId } = await requireOrg();
  const settings = await loadSettings(getDb(), orgId, userId);
  return (
    <div className="space-y-5">
      <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      <NotificationSettingsForm initial={settings} />
    </div>
  );
}
