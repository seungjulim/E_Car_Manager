/** 알림(1개월 전·1주 전), 월 예산, 이력 리포트 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdByCol, orgIdCol, pk, timestamps } from './common';
import { vehicles } from './maintenance';

export const reminderSourceEnum = pgEnum('reminder_source', [
  'schedule', // vehicle_maintenance_schedules
  'insurance', // insurance_policies.end_on
  'inspection_followup', // inspection_record_items.follow_up_due_on
  'self_check', // 월간 셀프 점검
  'recall',
]);
export const reminderStatusEnum = pgEnum('reminder_status', ['scheduled', 'sent', 'skipped', 'cancelled']);
export const recipientsModeEnum = pgEnum('recipients_mode', ['all', 'primary', 'custom']);

export type NotificationCategories = {
  schedule: boolean; // 소모품 교체 주기
  inspection: boolean; // 점검 주기
  followup: boolean; // 점검 후속 조치
  insurance: boolean;
  selfCheck: boolean;
};

export const notificationSettings = pgTable(
  'notification_settings',
  {
    id: pk(),
    orgId: orgIdCol(),
    userId: text('user_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** 만기 N일 전에 알림. 기본 1개월(30일) 전, 1주(7일) 전 */
    offsetsDays: integer('offsets_days').array().notNull().default(sql`'{30,7}'::integer[]`),
    sendTime: time('send_time').notNull().default('09:00'),
    quietStart: time('quiet_start'),
    quietEnd: time('quiet_end'),
    categories: jsonb('categories')
      .$type<NotificationCategories>()
      .notNull()
      .default(
        sql`'{"schedule":true,"inspection":true,"followup":true,"insurance":true,"selfCheck":false}'::jsonb`,
      ),
    recipientsMode: recipientsModeEnum('recipients_mode').notNull().default('all'),
    emailEnabled: boolean('email_enabled').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('notification_settings_user_uq').on(t.orgId, t.userId)],
);

/** Web Push 구독 (PWA) */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: pk(),
    userId: text('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    deviceLabel: text('device_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('push_subscriptions_endpoint_uq').on(t.endpoint), index('push_subscriptions_user_idx').on(t.userId)],
);

/** 발송 예약. Cron이 remind_on = 오늘 && status = scheduled 를 조회해 발송 */
export const reminders = pgTable(
  'reminders',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'cascade' }),
    sourceType: reminderSourceEnum('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    dueOn: date('due_on').notNull(),
    offsetDays: integer('offset_days').notNull(),
    remindOn: date('remind_on').notNull(),
    status: reminderStatusEnum('status').notNull().default('scheduled'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // 같은 항목·같은 만기일·같은 시점 알림은 한 번만
    uniqueIndex('reminders_dedupe_uq').on(t.sourceType, t.sourceId, t.dueOn, t.offsetDays),
    index('reminders_due_idx').on(t.remindOn, t.status),
  ],
);

/** 알림 센터(앱 내 받은 알림) */
export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    orgId: orgIdCol(),
    userId: text('user_id').notNull(),
    reminderId: uuid('reminder_id').references(() => reminders.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: text('body'),
    deepLink: text('deep_link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_read_idx').on(t.userId, t.readAt)],
);

/** vehicleId = null → 가족 전체 예산 */
export const monthlyBudgets = pgTable(
  'monthly_budgets',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'cascade' }),
    month: date('month').notNull(), // 해당 월 1일
    amount: integer('amount').notNull(), // 원
    alertPct: integer('alert_pct').notNull().default(80),
    ...timestamps,
  },
  (t) => [uniqueIndex('monthly_budgets_uq').on(t.orgId, t.vehicleId, t.month)],
);

/** 차량 이력 리포트(PDF·공유 링크) */
export const reports = pgTable(
  'reports',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    options: jsonb('options').$type<Record<string, boolean>>(), // 포함할 항목
    period: text('period'), // 'all' | '3y' | '2026' ...
    pdfKey: text('pdf_key'),
    shareToken: text('share_token'), // 추측 불가능한 랜덤 토큰
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: createdByCol(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reports_share_token_uq').on(t.shareToken)],
);
