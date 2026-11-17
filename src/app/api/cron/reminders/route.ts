import { clerkClient } from "@clerk/nextjs/server";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { runReminderJob } from "@/lib/reminder-job";
import { sendWebPush } from "@/lib/web-push";

// 알림 작업은 수십 초 걸릴 수 있어 넉넉히 둔다
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 가족(Clerk Organization)의 구성원 사용자 id 목록 */
async function getMemberIds(orgId: string): Promise<string[]> {
  try {
    const client = await clerkClient();
    const ids: string[] = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const { data } = await client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100, offset });
      ids.push(...data.map((m) => m.publicUserData?.userId).filter((id): id is string => Boolean(id)));
      if (data.length < 100) break;
    }
    return ids;
  } catch (error) {
    console.error(`[cron/reminders] ${orgId} 구성원 조회 실패:`, error);
    return [];
  }
}

/**
 * Vercel Cron 이 매일 호출한다(vercel.json). 로그인 세션이 없으므로 CRON_SECRET 으로 직접 확인한다.
 * 수동 점검: curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/cron/reminders
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET 이 설정되지 않았어요." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runReminderJob(getDb(), { getMemberIds, sendPush: sendWebPush });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron/reminders] 실패:", error);
    return NextResponse.json({ error: "job failed" }, { status: 500 });
  }
}
