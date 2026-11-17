/** 신차 구입 모드: 관심 목록, 취향, 비교, 구입 전 체크 TOP 10, 예산 추천 이력 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { catalogTrims } from './catalog';
import { createdByCol, orgIdCol, orgIdNullable, pk, powertrainEnum, timestamps } from './common';

export const wishlistStatusEnum = pgEnum('wishlist_status', ['reviewing', 'dropped', 'finalist']);
export const purchaseCheckStatusEnum = pgEnum('purchase_check_status', ['todo', 'ok', 'issue']);
export const sortModeEnum = pgEnum('recommend_sort_mode', ['popular', 'taste', 'combined']);

export const wishlist = pgTable(
  'wishlist',
  {
    id: pk(),
    orgId: orgIdCol(),
    userId: text('user_id').notNull(),
    trimId: uuid('trim_id')
      .notNull()
      .references(() => catalogTrims.id, { onDelete: 'cascade' }),
    rating: smallint('rating'),
    memo: text('memo'),
    status: wishlistStatusEnum('status').notNull().default('reviewing'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('wishlist_user_trim_uq').on(t.userId, t.trimId),
    index('wishlist_org_user_idx').on(t.orgId, t.userId),
    check('wishlist_rating_chk', sql`${t.rating} is null or ${t.rating} between 1 and 5`),
  ],
);

/** 사용자별 취향 + 파워트레인 선택 화면 값 */
export const preferences = pgTable(
  'preferences',
  {
    id: pk(),
    orgId: orgIdCol(),
    userId: text('user_id').notNull(),
    budgetMin: integer('budget_min'), // 원
    budgetMax: integer('budget_max'),
    bodyTypes: text('body_types').array(),
    powertrains: powertrainEnum('powertrains').array(), // 선택한 유형(다중)
    powertrainDecided: boolean('powertrain_decided').notNull().default(false), // false = "아직 못 정했어요"
    priorityFeatures: jsonb('priority_features').$type<Record<string, number>>(),
    ...timestamps,
  },
  (t) => [uniqueIndex('preferences_org_user_uq').on(t.orgId, t.userId)],
);

export const comparisons = pgTable('comparisons', {
  id: pk(),
  orgId: orgIdCol(),
  title: text('title').notNull(),
  trimIds: uuid('trim_ids').array().notNull().default(sql`'{}'::uuid[]`),
  aiSummary: text('ai_summary'),
  notionPageId: text('notion_page_id'),
  createdBy: createdByCol(),
  ...timestamps,
});

/* ---------- 구입 전 체크 TOP 10 ---------- */

/** orgId = null → 시스템 기본 항목 */
export const purchaseCriteriaPresets = pgTable(
  'purchase_criteria_presets',
  {
    id: pk(),
    orgId: orgIdNullable(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    question: text('question'),
    powertrains: powertrainEnum('powertrains').array(), // 유형별 추가 질문 대상
    extraQuestions: jsonb('extra_questions').$type<Record<string, string>>(),
    defaultWeight: integer('default_weight').notNull().default(3),
    estRank: integer('est_rank'),
  },
  (t) => [uniqueIndex('purchase_criteria_presets_uq').on(t.orgId, t.code)],
);

export const purchaseCriteriaWeights = pgTable(
  'purchase_criteria_weights',
  {
    id: pk(),
    orgId: orgIdCol(),
    userId: text('user_id').notNull(),
    criteriaCode: text('criteria_code').notNull(),
    weight: integer('weight').notNull().default(3),
  },
  (t) => [uniqueIndex('purchase_criteria_weights_uq').on(t.userId, t.criteriaCode)],
);

export const purchaseChecks = pgTable(
  'purchase_checks',
  {
    id: pk(),
    orgId: orgIdCol(),
    userId: text('user_id').notNull(),
    wishlistId: uuid('wishlist_id')
      .notNull()
      .references(() => wishlist.id, { onDelete: 'cascade' }),
    criteriaCode: text('criteria_code').notNull(),
    status: purchaseCheckStatusEnum('status').notNull().default('todo'),
    score: smallint('score'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('purchase_checks_uq').on(t.userId, t.wishlistId, t.criteriaCode),
    check('purchase_checks_score_chk', sql`${t.score} is null or ${t.score} between 1 and 5`),
  ],
);

/* ---------- 예산 추천 이력 ---------- */
export const recommendationRuns = pgTable(
  'recommendation_runs',
  {
    id: pk(),
    orgId: orgIdCol(),
    userId: text('user_id').notNull(),
    budgetMin: integer('budget_min'),
    budgetMax: integer('budget_max'),
    includeSubsidy: boolean('include_subsidy').notNull().default(true),
    powertrains: powertrainEnum('powertrains').array(),
    segments: text('segments').array(),
    sortMode: sortModeEnum('sort_mode').notNull().default('popular'),
    weights: jsonb('weights').$type<{ popularity: number; taste: number }>(),
    result: jsonb('result').$type<Array<{ modelId: string; rank: number; popularityScore?: number; tasteScore?: number }>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recommendation_runs_user_idx').on(t.orgId, t.userId, t.createdAt)],
);
