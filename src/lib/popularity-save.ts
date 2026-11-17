import { and, eq, notInArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import type { PopularityRecord } from "@/lib/popularity";
import { normalizeName } from "@/lib/recommend";

const { catalogBrands: brands, catalogModels: models, modelPopularity: popularity } = schema;

export type SavePopularityResult = { saved: number; matched: number; unmatched: number };

/**
 * 한 달치 판매 자료를 저장한다. 같은 가족·같은 달의 기존 자료는 새 자료로 교체한다(다시 붙여넣어도 중복되지 않음).
 * 카탈로그에 이름이 일치하는 모델이 하나뿐이면 model_id 를 연결하고, 아니면 이름만 저장해 나중에 연결한다.
 */
export async function savePopularity(
  db: Db,
  orgId: string,
  userId: string,
  record: PopularityRecord,
  meta: { source?: string; sourceUrl?: string } = {},
): Promise<SavePopularityResult> {
  const catalog = await db
    .select({ id: models.id, name: models.name, brandName: brands.name })
    .from(models)
    .innerJoin(brands, eq(brands.id, models.brandId))
    .where(eq(models.orgId, orgId));

  const byBrandModel = new Map<string, string[]>();
  const byModel = new Map<string, string[]>();
  for (const m of catalog) {
    const k1 = `${normalizeName(m.brandName)}|${normalizeName(m.name)}`;
    const k2 = normalizeName(m.name);
    byBrandModel.set(k1, [...(byBrandModel.get(k1) ?? []), m.id]);
    byModel.set(k2, [...(byModel.get(k2) ?? []), m.id]);
  }
  const findModel = (brand: string | null, model: string): string | null => {
    if (brand) {
      const hit = byBrandModel.get(`${normalizeName(brand)}|${normalizeName(model)}`);
      if (hit?.length === 1) return hit[0];
    }
    const hit = byModel.get(normalizeName(model));
    return hit?.length === 1 ? hit[0] : null;
  };

  const values = record.rows.map((r) => ({
    orgId,
    modelId: findModel(r.brandRaw, r.modelRaw),
    brandRaw: r.brandRaw,
    modelRaw: r.modelRaw,
    period: record.period,
    salesCount: r.salesCount,
    rankOverall: r.rankOverall,
    source: meta.source ?? "paste",
    sourceUrl: meta.sourceUrl ?? null,
    createdBy: userId,
  }));

  // Neon HTTP 드라이버는 트랜잭션이 없어 문장 단위로 실행: 먼저 새 자료를 넣고, 성공하면 이전 자료를 지운다
  const inserted = await db.insert(popularity).values(values).returning({ id: popularity.id });
  await db
    .delete(popularity)
    .where(
      and(
        eq(popularity.orgId, orgId),
        eq(popularity.period, record.period),
        notInArray(
          popularity.id,
          inserted.map((r) => r.id),
        ),
      ),
    );

  const matched = values.filter((v) => v.modelId).length;
  return { saved: values.length, matched, unmatched: values.length - matched };
}

/** 이름이 일치하는 모델이 새로 등록된 경우 등을 위해, model_id 가 비어 있는 판매 자료를 다시 연결한다 */
export async function relinkPopularity(db: Db, orgId: string): Promise<number> {
  const catalog = await db
    .select({ id: models.id, name: models.name, brandName: brands.name })
    .from(models)
    .innerJoin(brands, eq(brands.id, models.brandId))
    .where(eq(models.orgId, orgId));
  const rows = await db
    .select({ id: popularity.id, brandRaw: popularity.brandRaw, modelRaw: popularity.modelRaw, modelId: popularity.modelId })
    .from(popularity)
    .where(eq(popularity.orgId, orgId));

  let linked = 0;
  for (const r of rows) {
    if (r.modelId) continue;
    const nm = normalizeName(r.modelRaw);
    const nb = r.brandRaw ? normalizeName(r.brandRaw) : null;
    const exact = nb ? catalog.filter((m) => normalizeName(m.name) === nm && normalizeName(m.brandName) === nb) : [];
    const loose = catalog.filter((m) => normalizeName(m.name) === nm);
    const hit = exact.length === 1 ? exact[0] : loose.length === 1 ? loose[0] : null;
    if (hit) {
      await db.update(popularity).set({ modelId: hit.id }).where(eq(popularity.id, r.id));
      linked += 1;
    }
  }
  return linked;
}
