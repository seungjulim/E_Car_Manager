import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_OFFSETS,
  DEFAULT_SETTINGS,
  normalizeOffsets,
  type NotificationCategories,
  type UserSettings,
} from "@/lib/reminders";

const { notificationSettings: settingsTable, notifications, pushSubscriptions } = schema;

/* ------------------------------------------------------------------ */
/* 설정                                                                 */
/* ------------------------------------------------------------------ */

type SettingsRow = {
  enabled: boolean;
  offsetsDays: number[];
  categories: NotificationCategories;
  recipientsMode: "all" | "primary" | "custom";
};

function toSettings(row: SettingsRow | undefined): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS, offsetsDays: [...DEFAULT_OFFSETS] };
  return {
    enabled: row.enabled,
    offsetsDays: normalizeOffsets(row.offsetsDays),
    categories: { ...DEFAULT_CATEGORIES, ...row.categories },
    recipientsMode: row.recipientsMode,
  };
}

const settingsColumns = {
  userId: settingsTable.userId,
  enabled: settingsTable.enabled,
  offsetsDays: settingsTable.offsetsDays,
  categories: settingsTable.categories,
  recipientsMode: settingsTable.recipientsMode,
};

/** 설정을 저장한 적이 없으면 기본값(1개월·1주 전, 가족 전체)을 돌려준다 */
export async function loadSettings(db: Db, orgId: string, userId: string): Promise<UserSettings> {
  const [row] = await db
    .select(settingsColumns)
    .from(settingsTable)
    .where(and(eq(settingsTable.orgId, orgId), eq(settingsTable.userId, userId)))
    .limit(1);
  return toSettings(row);
}

/** 가족 전체의 저장된 설정(userId → 설정). 저장한 적 없는 사람은 들어 있지 않다 */
export async function loadOrgSettings(db: Db, orgId: string): Promise<Record<string, UserSettings>> {
  const rows = await db.select(settingsColumns).from(settingsTable).where(eq(settingsTable.orgId, orgId));
  return Object.fromEntries(rows.map((r) => [r.userId, toSettings(r)]));
}

export type SettingsInput = {
  enabled: boolean;
  offsetsDays: number[];
  categories: Pick<NotificationCategories, "schedule" | "insurance" | "selfCheck" | "followup">;
  recipientsMode: "all" | "primary";
};

export async function saveSettings(db: Db, orgId: string, userId: string, input: SettingsInput): Promise<UserSettings> {
  const current = await loadSettings(db, orgId, userId);
  const values = {
    enabled: input.enabled,
    offsetsDays: normalizeOffsets(input.offsetsDays),
    // 화면에 없는 분류(점검 주기)의 값은 그대로 둔다
    categories: { ...current.categories, ...input.categories },
    recipientsMode: input.recipientsMode,
  };
  await db
    .insert(settingsTable)
    .values({ orgId, userId, ...values })
    .onConflictDoUpdate({ target: [settingsTable.orgId, settingsTable.userId], set: { ...values, updatedAt: new Date() } });
  return toSettings(values);
}

/* ------------------------------------------------------------------ */
/* 알림 센터                                                            */
/* ------------------------------------------------------------------ */

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function listNotifications(db: Db, orgId: string, userId: string, limit = 50): Promise<NotificationRow[]> {
  return db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      deepLink: notifications.deepLink,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(db: Db, orgId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** 내 알림만 읽음 처리한다 */
export async function markRead(db: Db, orgId: string, userId: string, id: string): Promise<boolean> {
  const done = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.orgId, orgId), eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return done.length > 0;
}

export async function markAllRead(db: Db, orgId: string, userId: string): Promise<number> {
  const done = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return done.length;
}

/* ------------------------------------------------------------------ */
/* 푸시 구독(기기)                                                       */
/* ------------------------------------------------------------------ */

export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string; deviceLabel?: string | null };

/** 같은 기기(endpoint)를 다시 구독하면 지금 로그인한 사용자 것으로 바꿔 저장한다 */
export async function saveSubscription(db: Db, userId: string, input: SubscriptionInput): Promise<void> {
  const values = { userId, p256dh: input.p256dh, auth: input.auth, deviceLabel: input.deviceLabel ?? null, lastSuccessAt: null };
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: input.endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

export async function removeSubscription(db: Db, userId: string, endpoint: string): Promise<boolean> {
  const done = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id });
  return done.length > 0;
}

export type SubscriptionRow = { id: string; userId: string; endpoint: string; p256dh: string; auth: string; deviceLabel: string | null };

export async function listSubscriptions(db: Db, userIds: string[]): Promise<SubscriptionRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      deviceLabel: pushSubscriptions.deviceLabel,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
}

export async function deleteSubscriptionById(db: Db, id: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}

export async function touchSubscription(db: Db, id: string): Promise<void> {
  await db.update(pushSubscriptions).set({ lastSuccessAt: new Date() }).where(eq(pushSubscriptions.id, id));
}
