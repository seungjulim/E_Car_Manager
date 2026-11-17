/** 신차 구입 모드: 카탈로그(브랜드 → 모델 → 트림), 이미지, 인기(판매량) */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  aiJobStatusEnum,
  createdByCol,
  iceFuelEnum,
  imageKindEnum,
  imageOriginEnum,
  orgIdCol,
  pk,
  powertrainEnum,
  timestamps,
} from './common';

/** 파워트레인별 사양(JSON). 앱에서는 zod 스키마로 검증한다. */
export type PowertrainSpecs =
  | {
      type: 'ev';
      rangeKm?: number;
      batteryKwh?: number;
      dcChargeKw?: number;
      acChargeKw?: number;
      efficiencyKmPerKwh?: number;
    }
  | {
      type: 'hev' | 'phev';
      fuelEconomyKmpl?: number;
      systemPowerKw?: number;
      evRangeKm?: number; // phev
      batteryKwh?: number; // phev
    }
  | {
      type: 'ice';
      displacementCc?: number;
      fuelEconomyKmpl?: number;
      transmission?: string;
      powerPs?: number;
      torqueKgm?: number;
    };

/** 편의사양: 카테고리 → 항목 목록 (예: { 안전: ['전방충돌방지'], 편의: ['통풍시트'] }) */
export type FeatureMap = Record<string, string[]>;

export const catalogBrands = pgTable(
  'catalog_brands',
  {
    id: pk(),
    orgId: orgIdCol(),
    name: text('name').notNull(),
    country: text('country'),
    ...timestamps,
  },
  (t) => [uniqueIndex('catalog_brands_uq').on(t.orgId, t.name)],
);

export const catalogModels = pgTable(
  'catalog_models',
  {
    id: pk(),
    orgId: orgIdCol(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => catalogBrands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    segment: text('segment'), // 차급: 경형/소형/준중형/중형/대형/SUV/MPV 등
    powertrain: powertrainEnum('powertrain').notNull(),
    iceFuel: iceFuelEnum('ice_fuel'),
    releaseYear: integer('release_year'),
    launchOn: date('launch_on'), // 신규 출시 판정
    summary: text('summary'),
    aiSummary: text('ai_summary'),
    priceMin: integer('price_min'), // 트림 가격에서 계산한 캐시(원)
    priceMax: integer('price_max'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('catalog_models_uq').on(t.orgId, t.brandId, t.name),
    index('catalog_models_brand_idx').on(t.brandId),
    index('catalog_models_price_idx').on(t.orgId, t.priceMin, t.priceMax),
  ],
);

export const catalogTrims = pgTable(
  'catalog_trims',
  {
    id: pk(),
    orgId: orgIdCol(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => catalogModels.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    price: integer('price'), // 원
    subsidyEstimate: integer('subsidy_estimate'), // 추정 보조금(원) → 실구매가 계산
    features: jsonb('features').$type<FeatureMap>().notNull().default(sql`'{}'::jsonb`),
    specs: jsonb('specs').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    powertrainSpecs: jsonb('powertrain_specs').$type<PowertrainSpecs>(),
    pros: jsonb('pros').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    cons: jsonb('cons').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sourceUrl: text('source_url'),
    rawText: text('raw_text'), // 붙여넣은 원문
    aiStatus: aiJobStatusEnum('ai_status').notNull().default('pending'),
    ...timestamps,
  },
  (t) => [index('catalog_trims_model_idx').on(t.modelId), index('catalog_trims_price_idx').on(t.orgId, t.price)],
);

/** Claude 분류용 편의사양 카테고리 (안전 / 주행보조 / 편의 / 인포테인먼트 ...) */
export const featureCategories = pgTable(
  'feature_categories',
  {
    id: pk(),
    orgId: orgIdCol(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('feature_categories_uq').on(t.orgId, t.name)],
);

/** 신차 이미지(Vercel Blob). 모델 단위, 트림 단위 선택 연결 */
export const catalogImages = pgTable(
  'catalog_images',
  {
    id: pk(),
    orgId: orgIdCol(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => catalogModels.id, { onDelete: 'cascade' }),
    trimId: uuid('trim_id').references(() => catalogTrims.id, { onDelete: 'set null' }),
    kind: imageKindEnum('kind').notNull().default('exterior'),
    url: text('url').notNull(),
    storageKey: text('storage_key').notNull(),
    width: integer('width'),
    height: integer('height'),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    isCover: boolean('is_cover').notNull().default(false),
    origin: imageOriginEnum('origin').notNull().default('upload'),
    sourceUrl: text('source_url'),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [
    index('catalog_images_model_idx').on(t.modelId, t.sortOrder),
    // 모델당 대표 이미지는 1장
    uniqueIndex('catalog_images_one_cover_uq')
      .on(t.modelId)
      .where(sql`${t.isCover} = true`),
  ],
);

/** 월별 판매량(인기 데이터). 카탈로그 매칭 전에는 model_id = null */
export const modelPopularity = pgTable(
  'model_popularity',
  {
    id: pk(),
    orgId: orgIdCol(),
    modelId: uuid('model_id').references(() => catalogModels.id, { onDelete: 'set null' }),
    brandRaw: text('brand_raw'),
    modelRaw: text('model_raw').notNull(),
    period: date('period').notNull(), // 해당 월 1일
    salesCount: integer('sales_count'),
    rankOverall: integer('rank_overall'),
    rankSegment: integer('rank_segment'),
    source: text('source'),
    sourceUrl: text('source_url'),
    createdBy: createdByCol(),
    ...timestamps,
  },
  (t) => [
    index('model_popularity_org_period_idx').on(t.orgId, t.period),
    index('model_popularity_model_idx').on(t.modelId, t.period),
  ],
);
