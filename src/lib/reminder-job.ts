/**
 * 알림 작업: 매일 한 번(Vercel Cron) 실행한다.
 *  1) 일정(정비 예정·보험 만기)에서 보낼 알림을 reminders 에 예약(sync)
 *  2) 오늘 보낼 알림을 알림 센터(notifications)에 넣고 푸시로 발송(deliver)
 * 푸시 발송과 가족 구성원 조회는 주입받아서 테스트에서 가짜로 바꿀 수 있다.
 */
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import { addDays, daysBetween, todayKst } from "@/lib/car-care";
import { listVehicles, loadUpcoming } from "@/lib/cars";
import { loadInspectionSources } from "@/lib/inspections";
import {
  deleteSubscriptionById,
  listSubscriptions,
  loadOrgSettings,
  touchSubscription,
} from "@/lib/notifications";
import {
  DEFAULT_OFFSETS,
  MAX_LATE_DAYS,
  RESEND_GUARD_DAYS,
  normalizeOffsets,
  sourceFromItem,
  wantsReminder,
  type ReminderSource,
  type ReminderSourceType,
} from "@/lib/reminders";

const { reminders, notifications, vehicles } = schema;

export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
/** ok = 전달됨, gone = 구독이 만료됨(삭제해야 함), error = 일시적 실패 */
export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<"ok" | "gone" | "error">;

export type JobDeps = {
  /** 가족 구성원 사용자 id 목록 (Clerk) */
  getMemberIds: (orgId: string) => Promise<string[]>;
  sendPush: PushSender;
  now?: Date;
};

const keyOf = (type: string, id: string, dueOn: string, offset: number) => `${type}|${id}|${dueOn}|${offset}`;

/* ------------------------------------------------------------------ */
/* 1) 예약                                                              */
/* ------------------------------------------------------------------ */

export type SyncResult = { created: number; cancelled: number };

/**
 * 일정에 맞게 reminders 를 맞춘다.
 * - 새로 필요한 알림은 만들고, 날짜가 바뀌었거나 사라진 항목(삭제·갱신된 보험 등)의 예약은 취소한다.
 * - 이미 보낸 알림은 건드리지 않는다. 최근에 같은 시점 알림을 보냈다면 날짜가 조금 바뀌어도 다시 만들지 않는다.
 */
export async function syncOrgReminders(
  db: Db,
  orgId: string,
  items: ReminderSource[],
  offsets: number[],
  today: string,
  now: Date,
): Promise<SyncResult> {
  // 새로 만들 예약은 오늘 이후인 것만(지난 시점은 소급하지 않는다)
  const desired = items.flatMap((item) => item.plan(offsets, today).map((d) => ({ item, src: { type: item.type, id: item.id }, d })));
  // 이미 있는 예약을 취소할지 판단할 때는 며칠 여유를 둔다: 발송일이 지났어도 아직 늦게라도 보낼 수 있는 것은 살려 둔다
  const lenientFrom = addDays(today, -MAX_LATE_DAYS);
  const keepKeys = new Set(items.flatMap((item) => item.plan(offsets, lenientFrom).map((d) => keyOf(item.type, item.id, d.dueOn, d.offsetDays))));

  const scheduled = await db
    .select({ id: reminders.id, sourceType: reminders.sourceType, sourceId: reminders.sourceId, dueOn: reminders.dueOn, offsetDays: reminders.offsetDays })
    .from(reminders)
    .where(and(eq(reminders.orgId, orgId), eq(reminders.status, "scheduled")));

  const stale = scheduled.filter((r) => !keepKeys.has(keyOf(r.sourceType, r.sourceId, r.dueOn, r.offsetDays)));
  if (stale.length > 0) {
    await db
      .update(reminders)
      .set({ status: "cancelled", updatedAt: now })
      .where(inArray(reminders.id, stale.map((r) => r.id)));
  }

  // 최근에 이미 보낸 (항목, 시점)은 날짜가 달라져도 중복해서 만들지 않는다
  const guardSince = new Date(now.getTime() - RESEND_GUARD_DAYS * 86_400_000);
  const recentlySent = await db
    .select({ sourceType: reminders.sourceType, sourceId: reminders.sourceId, offsetDays: reminders.offsetDays })
    .from(reminders)
    .where(and(eq(reminders.orgId, orgId), eq(reminders.status, "sent"), gte(reminders.sentAt, guardSince)));
  const sentGuard = new Set(recentlySent.map((r) => `${r.sourceType}|${r.sourceId}|${r.offsetDays}`));

  const scheduledKeys = new Set(scheduled.map((r) => keyOf(r.sourceType, r.sourceId, r.dueOn, r.offsetDays)));
  const toInsert = desired.filter(({ src, d }) => !scheduledKeys.has(keyOf(src.type, src.id, d.dueOn, d.offsetDays)) && !sentGuard.has(`${src.type}|${src.id}|${d.offsetDays}`));

  let created = 0;
  for (const { item, src, d } of toInsert) {
    const rows = await db
      .insert(reminders)
      .values({
        orgId,
        vehicleId: item.vehicleId,
        sourceType: src.type,
        sourceId: src.id,
        dueOn: d.dueOn,
        offsetDays: d.offsetDays,
        remindOn: d.remindOn,
        status: "scheduled",
      })
      .onConflictDoUpdate({
        target: [reminders.sourceType, reminders.sourceId, reminders.dueOn, reminders.offsetDays],
        set: { status: "scheduled", remindOn: d.remindOn, updatedAt: now },
        // 취소됐던 예약만 되살린다(이미 보낸·건너뛴 것은 그대로)
        setWhere: eq(reminders.status, "cancelled"),
      })
      .returning({ id: reminders.id });
    created += rows.length;
  }
  return { created, cancelled: stale.length };
}

/* ------------------------------------------------------------------ */
/* 2) 발송                                                              */
/* ------------------------------------------------------------------ */

export type DeliverResult = { reminders: number; notifications: number; pushes: number; pushFailures: number; skipped: number; cancelled: number };

export async function deliverOrgReminders(
  db: Db,
  orgId: string,
  items: ReminderSource[],
  memberIds: string[],
  deps: Pick<JobDeps, "sendPush">,
  today: string,
  now: Date,
): Promise<DeliverResult> {
  const result: DeliverResult = { reminders: 0, notifications: 0, pushes: 0, pushFailures: 0, skipped: 0, cancelled: 0 };
  const itemBySource = new Map<string, ReminderSource>(items.map((i) => [`${i.type}|${i.id}`, i]));

  const due = await db
    .select({ id: reminders.id, sourceType: reminders.sourceType, sourceId: reminders.sourceId, dueOn: reminders.dueOn, offsetDays: reminders.offsetDays, remindOn: reminders.remindOn })
    .from(reminders)
    .where(and(eq(reminders.orgId, orgId), eq(reminders.status, "scheduled"), lte(reminders.remindOn, today)));
  if (due.length === 0) return result;

  const [settings, vlist] = await Promise.all([loadOrgSettings(db, orgId), listVehicles(db, orgId)]);
  const owner = new Map(vlist.map((v) => [v.id, v.ownerUserId]));
  const subs = await listSubscriptions(db, memberIds);

  for (const r of due) {
    // 너무 오래 밀린 알림(서버 문제 등)은 이제 와서 보내지 않는다
    if (daysBetween(r.remindOn, today) > MAX_LATE_DAYS) {
      await db.update(reminders).set({ status: "skipped", updatedAt: now }).where(eq(reminders.id, r.id));
      result.skipped += 1;
      continue;
    }
    const item = itemBySource.get(`${r.sourceType}|${r.sourceId}`);
    // 원천이 사라졌거나(삭제·갱신), 이미 해결된 일(예: 이번 달 셀프 점검을 마침)이면 보내지 않는다
    if (!item || item.resolved?.(r.dueOn)) {
      await db.update(reminders).set({ status: "cancelled", updatedAt: now }).where(eq(reminders.id, r.id));
      result.cancelled += 1;
      continue;
    }

    // 먼저 "보냄"으로 선점한다: 작업이 겹쳐 돌거나 중간에 실패해도 같은 알림이 두 번 가지 않는다
    const claimed = await db
      .update(reminders)
      .set({ status: "sent", sentAt: now, updatedAt: now })
      .where(and(eq(reminders.id, r.id), eq(reminders.status, "scheduled")))
      .returning({ id: reminders.id });
    if (claimed.length === 0) continue;
    result.reminders += 1;

    const msg = item.message(r.offsetDays, today);
    const recipients = memberIds.filter((u) =>
      wantsReminder(settings[u], u, { sourceType: r.sourceType as ReminderSourceType, offsetDays: r.offsetDays }, owner.get(item.vehicleId) ?? null),
    );
    if (recipients.length === 0) continue;

    await db.insert(notifications).values(
      recipients.map((userId) => ({ orgId, userId, reminderId: r.id, title: msg.title, body: msg.body, deepLink: msg.url })),
    );
    result.notifications += recipients.length;

    for (const sub of subs.filter((s) => recipients.includes(s.userId))) {
      const outcome = await deps.sendPush(sub, { ...msg, tag: r.id });
      if (outcome === "ok") {
        result.pushes += 1;
        await touchSubscription(db, sub.id);
      } else {
        result.pushFailures += 1;
        if (outcome === "gone") await deleteSubscriptionById(db, sub.id);
      }
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* 전체 작업                                                            */
/* ------------------------------------------------------------------ */

export type JobSummary = {
  today: string;
  orgs: number;
  created: number;
  cancelled: number;
  reminders: number;
  notifications: number;
  pushes: number;
  pushFailures: number;
  skipped: number;
  errors: { orgId: string; message: string }[];
};

/** 차량이 있는 모든 가족에 대해 예약 → 발송을 수행한다. 한 가족이 실패해도 나머지는 계속한다 */
export async function runReminderJob(db: Db, deps: JobDeps): Promise<JobSummary> {
  const now = deps.now ?? new Date();
  const today = todayKst(now);
  const summary: JobSummary = { today, orgs: 0, created: 0, cancelled: 0, reminders: 0, notifications: 0, pushes: 0, pushFailures: 0, skipped: 0, errors: [] };

  const orgRows = await db.selectDistinct({ orgId: vehicles.orgId }).from(vehicles).where(isNull(vehicles.deletedAt));

  for (const { orgId } of orgRows) {
    summary.orgs += 1;
    try {
      const [upcoming, inspectionSources, settings] = await Promise.all([loadUpcoming(db, orgId, now), loadInspectionSources(db, orgId, today), loadOrgSettings(db, orgId)]);
      const items: ReminderSource[] = [...upcoming.map(sourceFromItem), ...inspectionSources];

      // 가족 중 누가 어떤 시점을 원하든 모두 예약해 두고, 보낼 때 개인 설정으로 거른다
      const offsets = normalizeOffsets([
        ...DEFAULT_OFFSETS,
        ...Object.values(settings).filter((s) => s.enabled).flatMap((s) => s.offsetsDays),
      ]);
      const sync = await syncOrgReminders(db, orgId, items, offsets, today, now);
      summary.created += sync.created;
      summary.cancelled += sync.cancelled;

      const memberIds = await deps.getMemberIds(orgId);
      if (memberIds.length === 0) {
        // 구성원을 알 수 없으면 보내지 않는다(예약은 남아 있어 다음 실행에서 다시 시도)
        summary.errors.push({ orgId, message: "가족 구성원을 불러오지 못해 발송을 건너뛰었어요." });
        continue;
      }
      const d = await deliverOrgReminders(db, orgId, items, memberIds, deps, today, now);
      summary.reminders += d.reminders;
      summary.notifications += d.notifications;
      summary.pushes += d.pushes;
      summary.pushFailures += d.pushFailures;
      summary.skipped += d.skipped;
      summary.cancelled += d.cancelled;
    } catch (error) {
      console.error(`[reminder-job] ${orgId} 처리 실패:`, error);
      summary.errors.push({ orgId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return summary;
}
