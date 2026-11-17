import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import type { CarRecord } from "@/lib/car-draft";

const { catalogBrands: brands, catalogModels: models, catalogTrims: trims } = schema;

export type SaveCarResult = { modelId: string; modelCreated: boolean; addedTrims: number; skippedTrims: number };

/**
 * 검증이 끝난 차량 정보를 카탈로그에 저장한다.
 * - 브랜드/모델이 이미 있으면 재사용하고, 같은 이름이 없는 트림만 추가한다(중복 저장 방지).
 * - Neon HTTP 드라이버는 트랜잭션이 없으므로 문장 단위로 실행한다. 각 단계가 멱등이라 재시도해도 안전하다.
 */
export async function saveCarRecord(
  db: Db,
  orgId: string,
  record: CarRecord,
  meta: { rawText?: string; sourceUrl?: string } = {},
): Promise<SaveCarResult> {
  // 1) 브랜드
  let brandId = (
    await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.orgId, orgId), eq(brands.name, record.brandName)))
      .limit(1)
  )[0]?.id;
  if (!brandId) {
    const inserted = await db
      .insert(brands)
      .values({ orgId, name: record.brandName })
      .onConflictDoNothing()
      .returning({ id: brands.id });
    brandId =
      inserted[0]?.id ??
      (await db
        .select({ id: brands.id })
        .from(brands)
        .where(and(eq(brands.orgId, orgId), eq(brands.name, record.brandName)))
        .limit(1))[0].id;
  }

  // 2) 모델
  const findModel = () =>
    db
      .select({ id: models.id })
      .from(models)
      .where(and(eq(models.orgId, orgId), eq(models.brandId, brandId), eq(models.name, record.model.name)))
      .limit(1);
  let modelId = (await findModel())[0]?.id;
  let modelCreated = false;
  if (!modelId) {
    const inserted = await db
      .insert(models)
      .values({ orgId, brandId, ...record.model })
      .onConflictDoNothing()
      .returning({ id: models.id });
    modelCreated = inserted.length > 0;
    modelId = inserted[0]?.id ?? (await findModel())[0].id;
  }

  // 3) 트림 (같은 이름은 건너뜀)
  const existing = await db.select({ name: trims.name }).from(trims).where(eq(trims.modelId, modelId));
  const existingNames = new Set(existing.map((t) => t.name));
  const toAdd = record.trims.filter((t) => !existingNames.has(t.name));
  if (toAdd.length > 0) {
    await db.insert(trims).values(
      toAdd.map((t) => ({
        orgId,
        modelId,
        name: t.name,
        price: t.price,
        subsidyEstimate: t.subsidyEstimate,
        features: t.features,
        powertrainSpecs: t.powertrainSpecs,
        pros: t.pros,
        cons: t.cons,
        sourceUrl: meta.sourceUrl ?? null,
        rawText: meta.rawText ?? null,
        aiStatus: "done" as const,
      })),
    );
  }

  // 4) 모델 가격 범위 캐시 갱신 (예산 추천·목록 카드에서 사용)
  await db
    .update(models)
    .set({
      priceMin: sql`(select min(${trims.price}) from ${trims} where ${trims.modelId} = ${models.id})`,
      priceMax: sql`(select max(${trims.price}) from ${trims} where ${trims.modelId} = ${models.id})`,
    })
    .where(eq(models.id, modelId));

  return { modelId, modelCreated, addedTrims: toAdd.length, skippedTrims: record.trims.length - toAdd.length };
}
