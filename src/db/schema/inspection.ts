/** 점검 체크리스트(블루핸즈 기본 / TOP 10) + 소모품 주기(정비 TOP 10) */
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdByCol, orgIdCol, orgIdNullable, pk, powertrainEnum, timestamps } from './common';
import { serviceRecords, vehicles } from './maintenance';

export const inspectionStatusEnum = pgEnum('inspection_status', ['ok', 'warn', 'replace', 'na']);
export const checkTypeEnum = pgEnum('check_type', ['status', 'numeric']);
export const checkMethodEnum = pgEnum('check_method', ['self', 'shop', 'both']);
export const checkCycleEnum = pgEnum('check_cycle', ['monthly', 'quarterly', 'semiannual', 'annual']);
/** replace = 교체 주기, inspect = 점검 주기 */
export const scheduleKindEnum = pgEnum('schedule_kind', ['replace', 'inspect']);

/* ---------- 점검 템플릿 ---------- */

/** orgId = null → 시스템 기본 템플릿(블루핸즈 기본 점검) */
export const inspectionTemplates = pgTable('inspection_templates', {
  id: pk(),
  orgId: orgIdNullable(),
  name: text('name').notNull(),
  source: text('source'),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const inspectionTemplateItems = pgTable(
  'inspection_template_items',
  {
    id: pk(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => inspectionTemplates.id, { onDelete: 'cascade' }),
    itemCode: text('item_code').notNull(),
    category: text('category').notNull(),
    name: text('name').notNull(),
    checkType: checkTypeEnum('check_type').notNull().default('status'),
    unit: text('unit'), // psi, mm 등
    powertrains: powertrainEnum('powertrains').array(), // 적용 유형(null = 전체)
    sortOrder: integer('sort_order').notNull().default(0),
    topRank: integer('top_rank'), // 점검 TOP 10 순위(1~10)
    selfCheckCycle: checkCycleEnum('self_check_cycle'),
    checkMethod: checkMethodEnum('check_method'),
    verified: boolean('verified').notNull().default(false), // 공식 점검표로 확인된 항목인지
  },
  (t) => [
    index('inspection_template_items_tpl_idx').on(t.templateId, t.sortOrder),
    uniqueIndex('inspection_template_items_code_uq').on(t.templateId, t.itemCode),
  ],
);

/* ---------- 점검 기록 ---------- */
export const inspectionRecords = pgTable(
  'inspection_records',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => inspectionTemplates.id, { onDelete: 'set null' }),
    inspectedOn: date('inspected_on').notNull(),
    mileageKm: integer('mileage_km'),
    place: text('place'), // 예: 블루핸즈 ○○점 / 셀프 점검
    isSelfCheck: boolean('is_self_check').notNull().default(false),
    overallStatus: inspectionStatusEnum('overall_status'),
    memo: text('memo'),
    serviceRecordId: uuid('service_record_id').references(() => serviceRecords.id, { onDelete: 'set null' }),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [index('inspection_records_vehicle_date_idx').on(t.vehicleId, t.inspectedOn)],
);

/** 템플릿 항목명은 점검 시점의 스냅샷으로 저장(템플릿이 바뀌어도 과거 기록 유지) */
export const inspectionRecordItems = pgTable(
  'inspection_record_items',
  {
    id: pk(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => inspectionRecords.id, { onDelete: 'cascade' }),
    itemCode: text('item_code'),
    itemName: text('item_name').notNull(),
    category: text('category'),
    status: inspectionStatusEnum('status').notNull().default('ok'),
    valueNum: doublePrecision('value_num'),
    unit: text('unit'),
    note: text('note'),
    followUpDueOn: date('follow_up_due_on'), // 주의·교체 필요 → 후속 일정/알림 원천
  },
  (t) => [index('inspection_record_items_idx').on(t.recordId, t.status)],
);

/* ---------- 소모품(정비 TOP 10) 프리셋 · 차량별 주기 ---------- */

/** orgId = null → 시스템 기본 프리셋 */
export const maintenanceItemPresets = pgTable(
  'maintenance_item_presets',
  {
    id: pk(),
    orgId: orgIdNullable(),
    itemCode: text('item_code').notNull(),
    name: text('name').notNull(),
    category: text('category'),
    powertrains: powertrainEnum('powertrains').array(),
    defaultIntervalKm: integer('default_interval_km'),
    defaultIntervalMonths: integer('default_interval_months'),
    estRank: integer('est_rank'), // 추정 정비 TOP 10 순위
    verified: boolean('verified').notNull().default(false),
  },
  (t) => [uniqueIndex('maintenance_item_presets_uq').on(t.orgId, t.itemCode)],
);

export const vehicleMaintenanceSchedules = pgTable(
  'vehicle_maintenance_schedules',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    itemCode: text('item_code').notNull(),
    kind: scheduleKindEnum('kind').notNull().default('replace'),
    intervalKm: integer('interval_km'),
    intervalMonths: integer('interval_months'),
    lastDoneOn: date('last_done_on'),
    lastDoneKm: integer('last_done_km'),
    nextDueOn: date('next_due_on'),
    nextDueKm: integer('next_due_km'),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('vehicle_schedules_uq').on(t.vehicleId, t.itemCode, t.kind),
    index('vehicle_schedules_due_idx').on(t.vehicleId, t.nextDueOn),
  ],
);
