import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uuid, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

/* ---------- 공통 컬럼 헬퍼 ---------- */

/** uuid 기본키 */
export const pk = () => uuid('id').primaryKey().defaultRandom();

/** 가족(Clerk Organization) 식별자. 모든 가족 데이터 테이블에 필수. */
export const orgIdCol = () => text('org_id').notNull();

/** 시스템 기본값(공용)과 가족별 값을 함께 저장하는 테이블용(null = 시스템 기본) */
export const orgIdNullable = () => text('org_id');

/** Clerk user ID */
export const createdByCol = () => text('created_by');

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ---------- 공통 enum ---------- */

/** 파워트레인: 전기 / 하이브리드 / 플러그인하이브리드 / 내연기관 */
export const powertrainEnum = pgEnum('powertrain', ['ev', 'hev', 'phev', 'ice']);
/** 내연기관 연료 (ice일 때만 사용) */
export const iceFuelEnum = pgEnum('ice_fuel', ['gasoline', 'diesel', 'lpg']);
export const dataSourceEnum = pgEnum('data_source', ['manual', 'api']);
export const imageKindEnum = pgEnum('image_kind', ['exterior', 'interior', 'space', 'detail', 'other']);
export const imageOriginEnum = pgEnum('image_origin', ['upload', 'url']);
export const aiJobKindEnum = pgEnum('ai_job_kind', [
  'translate',
  'summarize',
  'classify',
  'extract',
  'vision',
]);
export const aiJobStatusEnum = pgEnum('ai_job_status', ['pending', 'done', 'failed']);

/* ---------- 노션 동기화 / AI 작업 이력 ---------- */

/** 노션 페이지 연결 상태 (엔티티별 notion_page_id 컬럼을 두지 않고 한 곳에서 추적하는 경우) */
export const notionLinks = pgTable(
  'notion_links',
  {
    id: pk(),
    orgId: orgIdCol(),
    entityType: text('entity_type').notNull(), // 'service_record' | 'inspection_record' | 'comparison' ...
    entityId: uuid('entity_id').notNull(),
    notionPageId: text('notion_page_id').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('notion_links_entity_uq').on(t.entityType, t.entityId)],
);

/** Claude 호출 이력·재시도 */
export const aiJobs = pgTable('ai_jobs', {
  id: pk(),
  orgId: orgIdCol(),
  kind: aiJobKindEnum('kind').notNull(),
  inputRef: text('input_ref'), // 예: 'catalog_trims:<uuid>', 'documents:<uuid>'
  status: aiJobStatusEnum('status').notNull().default('pending'),
  result: jsonb('result'),
  error: text('error'),
  createdBy: createdByCol(),
  ...timestamps,
});

/** SQL 조각: 배열 기본값 등에서 재사용 */
export const emptyJsonArray = sql`'[]'::jsonb`;
