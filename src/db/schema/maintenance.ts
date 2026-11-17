/**
 * 차량 관리 모드 핵심 테이블.
 * vehicles / 수리 견적 / 서류(수리내역서 이미지) / 정비 기록은 서로 참조해 순환 구조라
 * 한 파일에 두고, 뒤에 선언되는 테이블은 `(): AnyPgColumn => ...` 지연 참조를 쓴다.
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdByCol,
  dataSourceEnum,
  iceFuelEnum,
  orgIdCol,
  orgIdNullable,
  pk,
  powertrainEnum,
  timestamps,
} from './common';

/* ---------- enum ---------- */
export const repairShopTypeEnum = pgEnum('repair_shop_type', ['official', 'general', 'specialist']);
export const shopSourceEnum = pgEnum('shop_source', ['kakao', 'google', 'manual']);
export const partPrefEnum = pgEnum('part_pref', ['oem', 'genuine', 'any']);
export const repairRequestStatusEnum = pgEnum('repair_request_status', ['open', 'chosen', 'done']);
export const quoteSourceEnum = pgEnum('quote_source', ['phone', 'document', 'manual', 'api']);
export const documentKindEnum = pgEnum('document_kind', [
  'repair_statement', // 수리내역서
  'quote', // 견적서
  'service_receipt', // 정비 영수증
  'fuel_receipt', // 주유·충전 영수증
  'insurance', // 보험증권
  'registration', // 자동차등록증
  'other',
]);

/* ---------- 차량 ---------- */
export const vehicles = pgTable(
  'vehicles',
  {
    id: pk(),
    orgId: orgIdCol(),
    plateNo: text('plate_no').notNull(), // 차량번호
    nickname: text('nickname'),
    brand: text('brand'),
    model: text('model'),
    trim: text('trim'),
    powertrain: powertrainEnum('powertrain').notNull(),
    iceFuel: iceFuelEnum('ice_fuel'), // powertrain = 'ice' 일 때만
    purchaseYear: integer('purchase_year'),
    purchasedAt: date('purchased_at'),
    vin: text('vin'), // 차대번호
    color: text('color'),
    currentMileageKm: integer('current_mileage_km').notNull().default(0),
    ownerUserId: text('owner_user_id'), // 주 사용자(Clerk user ID)
    notes: text('notes'),
    source: dataSourceEnum('source').notNull().default('manual'),
    externalId: text('external_id'), // 추후 차량 API 연동용
    lastRecallCheckedOn: date('last_recall_checked_on'),
    recallStatus: text('recall_status'), // 'none' | 'found' | 'unknown'
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [
    // 삭제되지 않은 차량 기준으로 가족 내 차량번호 중복 금지
    uniqueIndex('vehicles_org_plate_uq')
      .on(t.orgId, t.plateNo)
      .where(sql`${t.deletedAt} is null`),
    index('vehicles_org_idx').on(t.orgId),
  ],
);

export const mileageLogs = pgTable(
  'mileage_logs',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    recordedOn: date('recorded_on').notNull(),
    mileageKm: integer('mileage_km').notNull(),
    note: text('note'),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [index('mileage_logs_vehicle_date_idx').on(t.vehicleId, t.recordedOn)],
);

/* ---------- 정비소 · 견적 ---------- */
/** orgId = null → 지도 API 조회 결과를 캐시한 공용 정비소 */
export const repairShops = pgTable(
  'repair_shops',
  {
    id: pk(),
    orgId: orgIdNullable(),
    name: text('name').notNull(),
    type: repairShopTypeEnum('type').notNull().default('general'),
    address: text('address'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    phone: text('phone'),
    externalId: text('external_id'),
    source: shopSourceEnum('source').notNull().default('manual'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('repair_shops_geo_idx').on(t.lat, t.lng),
    index('repair_shops_external_idx').on(t.source, t.externalId),
  ],
);

export const repairRequests = pgTable(
  'repair_requests',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    itemCode: text('item_code'), // maintenance_item_presets.item_code
    description: text('description'),
    partPref: partPrefEnum('part_pref').notNull().default('any'),
    originLat: doublePrecision('origin_lat'),
    originLng: doublePrecision('origin_lng'),
    radiusKm: integer('radius_km').notNull().default(40),
    shopTypes: text('shop_types').array(), // ['official','general','specialist']
    status: repairRequestStatusEnum('status').notNull().default('open'),
    chosenQuoteId: uuid('chosen_quote_id').references((): AnyPgColumn => repairQuotes.id, {
      onDelete: 'set null',
    }),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [
    check('repair_requests_radius_chk', sql`${t.radiusKm} between 1 and 40`),
    index('repair_requests_vehicle_idx').on(t.vehicleId),
  ],
);

export const repairQuotes = pgTable(
  'repair_quotes',
  {
    id: pk(),
    orgId: orgIdCol(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => repairRequests.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => repairShops.id, { onDelete: 'cascade' }),
    totalAmount: integer('total_amount').notNull(), // 원
    partsAmount: integer('parts_amount'),
    laborAmount: integer('labor_amount'),
    taxAmount: integer('tax_amount'),
    partType: text('part_type'), // 순정 / OEM / 애프터마켓
    warrantyMonths: integer('warranty_months'),
    validUntil: date('valid_until'),
    source: quoteSourceEnum('source').notNull().default('manual'),
    documentId: uuid('document_id').references((): AnyPgColumn => documents.id, {
      onDelete: 'set null',
    }), // 견적서 이미지
    distanceKm: doublePrecision('distance_km'),
    note: text('note'),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [index('repair_quotes_request_amount_idx').on(t.requestId, t.totalAmount)],
);

/* ---------- 서류(수리내역서 등) ---------- */
export const documents = pgTable(
  'documents',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    serviceRecordId: uuid('service_record_id').references((): AnyPgColumn => serviceRecords.id, {
      onDelete: 'set null',
    }),
    kind: documentKindEnum('kind').notNull().default('repair_statement'),
    ocrText: text('ocr_text'),
    ocrJson: jsonb('ocr_json'), // Claude 비전이 추출한 날짜·금액·항목 등
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [index('documents_vehicle_idx').on(t.vehicleId), index('documents_service_idx').on(t.serviceRecordId)],
);

/** 한 문서에 여러 장의 이미지 (Vercel Blob) */
export const documentImages = pgTable(
  'document_images',
  {
    id: pk(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    storageKey: text('storage_key').notNull(), // Blob pathname
    sortOrder: integer('sort_order').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('document_images_doc_idx').on(t.documentId, t.sortOrder)],
);

/* ---------- 정비 · 보험 · 에너지 ---------- */
export const serviceRecords = pgTable(
  'service_records',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    servicedOn: date('serviced_on').notNull(),
    mileageKm: integer('mileage_km'),
    itemCode: text('item_code'), // 정비 TOP 10 / 점검 항목 코드와 연결
    category: text('category'), // 정비 분류(자유 텍스트 또는 코드)
    shopId: uuid('shop_id').references(() => repairShops.id, { onDelete: 'set null' }),
    shopName: text('shop_name'), // 정비소 DB에 없는 경우 직접 입력
    description: text('description'),
    cost: integer('cost'), // 실제 지불 금액(원)
    nextDueOn: date('next_due_on'),
    nextDueKm: integer('next_due_km'),
    repairQuoteId: uuid('repair_quote_id').references(() => repairQuotes.id, { onDelete: 'set null' }),
    aiSummary: text('ai_summary'),
    notionPageId: text('notion_page_id'),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [
    index('service_records_vehicle_date_idx').on(t.vehicleId, t.servicedOn),
    index('service_records_org_item_idx').on(t.orgId, t.itemCode),
  ],
);

export const insurancePolicies = pgTable(
  'insurance_policies',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    insurer: text('insurer').notNull(),
    policyNo: text('policy_no'),
    coverageType: text('coverage_type'),
    startOn: date('start_on'),
    endOn: date('end_on').notNull(), // 만기일 (알림 기준)
    premium: integer('premium'),
    contact: text('contact'),
    notes: text('notes'),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [index('insurance_end_idx').on(t.endOn), index('insurance_vehicle_idx').on(t.vehicleId)],
);

/** 전기차·PHEV */
export const chargingLogs = pgTable(
  'charging_logs',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    chargedOn: date('charged_on').notNull(),
    kwh: doublePrecision('kwh'),
    cost: integer('cost'),
    chargeType: text('charge_type'), // 'ac' | 'dc'
    place: text('place'),
    odometerKm: integer('odometer_km'),
    receiptDocumentId: uuid('receipt_document_id').references(() => documents.id, { onDelete: 'set null' }),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [index('charging_logs_vehicle_date_idx').on(t.vehicleId, t.chargedOn)],
);

/** 하이브리드·PHEV·내연기관 */
export const fuelingLogs = pgTable(
  'fueling_logs',
  {
    id: pk(),
    orgId: orgIdCol(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    fueledOn: date('fueled_on').notNull(),
    liters: doublePrecision('liters'),
    fuelGrade: text('fuel_grade'), // 휘발유 / 고급휘발유 / 경유 / LPG
    cost: integer('cost'),
    place: text('place'),
    odometerKm: integer('odometer_km'),
    receiptDocumentId: uuid('receipt_document_id').references(() => documents.id, { onDelete: 'set null' }),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [index('fueling_logs_vehicle_date_idx').on(t.vehicleId, t.fueledOn)],
);
