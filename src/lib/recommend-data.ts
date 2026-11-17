import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import type { Powertrain } from "@/lib/powertrain";
import type { Candidate, PopularityRow, TastePrefs } from "@/lib/recommend";

const { catalogBrands: brands, catalogModels: models, catalogTrims: trims, catalogImages: images } = schema;

/** 선택한 유형의 모든 모델과 트림(예산 필터링은 recommend() 에서 한다) */
export async function loadCandidates(db: Db, orgId: string, powertrains: Powertrain[]): Promise<Candidate[]> {
  if (powertrains.length === 0) return [];

  const modelRows = await db
    .select({
      id: models.id,
      name: models.name,
      brandName: brands.name,
      powertrain: models.powertrain,
      segment: models.segment,
      launchOn: models.launchOn,
      coverUrl: images.url,
    })
    .from(models)
    .innerJoin(brands, eq(brands.id, models.brandId))
    .leftJoin(images, and(eq(images.modelId, models.id), eq(images.isCover, true)))
    .where(and(eq(models.orgId, orgId), inArray(models.powertrain, powertrains)))
    .orderBy(asc(brands.name), asc(models.name));
  if (modelRows.length === 0) return [];

  const trimRows = await db
    .select({
      id: trims.id,
      modelId: trims.modelId,
      name: trims.name,
      price: trims.price,
      subsidyEstimate: trims.subsidyEstimate,
      features: trims.features,
    })
    .from(trims)
    .where(
      and(
        eq(trims.orgId, orgId),
        inArray(
          trims.modelId,
          modelRows.map((m) => m.id),
        ),
      ),
    );

  const byModel = new Map<string, Candidate["trims"]>();
  for (const t of trimRows) {
    const list = byModel.get(t.modelId) ?? [];
    list.push({ id: t.id, name: t.name, price: t.price, subsidyEstimate: t.subsidyEstimate, features: t.features });
    byModel.set(t.modelId, list);
  }
  return modelRows.map((m) => ({ ...m, trims: byModel.get(m.id) ?? [] }));
}

/** 최근 판매 자료(약 8개월). 인기 계산은 이 중 가장 최근 월 기준 3개월만 쓴다 */
export async function loadPopularity(db: Db, orgId: string, now = new Date()): Promise<PopularityRow[]> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 8, 1)).toISOString().slice(0, 10);
  return db
    .select({
      modelId: schema.modelPopularity.modelId,
      brandRaw: schema.modelPopularity.brandRaw,
      modelRaw: schema.modelPopularity.modelRaw,
      period: schema.modelPopularity.period,
      salesCount: schema.modelPopularity.salesCount,
    })
    .from(schema.modelPopularity)
    .where(and(eq(schema.modelPopularity.orgId, orgId), gte(schema.modelPopularity.period, since)));
}

export type StoredPreferences = TastePrefs & { budgetMin: number | null; budgetMax: number | null };

export async function loadPreferences(db: Db, orgId: string, userId: string): Promise<StoredPreferences | null> {
  const [row] = await db
    .select({
      powertrains: schema.preferences.powertrains,
      decided: schema.preferences.powertrainDecided,
      bodyTypes: schema.preferences.bodyTypes,
      priorityFeatures: schema.preferences.priorityFeatures,
      budgetMin: schema.preferences.budgetMin,
      budgetMax: schema.preferences.budgetMax,
    })
    .from(schema.preferences)
    .where(and(eq(schema.preferences.orgId, orgId), eq(schema.preferences.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** 판매 순위 자료가 얼마나 들어 있는지(입력 화면 안내용) */
export async function getPopularityStatus(
  db: Db,
  orgId: string,
): Promise<{ latestMonth: string | null; rowCount: number }> {
  const [row] = await db
    .select({
      latest: sql<string | null>`max(${schema.modelPopularity.period})`,
      rowCount: sql<number>`count(*)::int`,
    })
    .from(schema.modelPopularity)
    .where(eq(schema.modelPopularity.orgId, orgId));
  return { latestMonth: row?.latest ? String(row.latest).slice(0, 7) : null, rowCount: row?.rowCount ?? 0 };
}
