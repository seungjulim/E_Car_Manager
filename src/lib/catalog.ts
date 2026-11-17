import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import type { Powertrain } from "@/lib/powertrain";

/** neon-http / pglite 등 어떤 Postgres 드라이버의 drizzle 인스턴스든 받을 수 있게 한 타입(테스트 용이) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

const { catalogBrands: brands, catalogModels: models, catalogImages: images } = schema;

export type BrandOption = { id: string; name: string; modelCount: number };

/** 선택한 유형의 모델이 하나라도 있는 브랜드 (탐색 화면의 브랜드 칩) */
export async function listBrandsWithModels(
  db: Db,
  orgId: string,
  powertrains: Powertrain[],
): Promise<BrandOption[]> {
  if (powertrains.length === 0) return [];
  return db
    .select({
      id: brands.id,
      name: brands.name,
      modelCount: sql<number>`count(${models.id})::int`,
    })
    .from(brands)
    .innerJoin(models, eq(models.brandId, brands.id))
    .where(
      and(eq(brands.orgId, orgId), eq(models.orgId, orgId), inArray(models.powertrain, powertrains)),
    )
    .groupBy(brands.id, brands.name)
    .orderBy(asc(brands.name));
}

export type ModelCard = {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  powertrain: Powertrain;
  priceMin: number | null; // 원
  priceMax: number | null;
  coverUrl: string | null;
};

/** 탐색 화면의 모델 카드 목록 (대표 이미지 1장 포함) */
export async function listModelCards(
  db: Db,
  orgId: string,
  opts: { powertrains: Powertrain[]; brandId?: string; limit?: number },
): Promise<ModelCard[]> {
  if (opts.powertrains.length === 0) return [];
  return db
    .select({
      id: models.id,
      name: models.name,
      brandId: brands.id,
      brandName: brands.name,
      powertrain: models.powertrain,
      priceMin: models.priceMin,
      priceMax: models.priceMax,
      coverUrl: images.url,
    })
    .from(models)
    .innerJoin(brands, eq(brands.id, models.brandId))
    .leftJoin(images, and(eq(images.modelId, models.id), eq(images.isCover, true)))
    .where(
      and(
        eq(models.orgId, orgId),
        inArray(models.powertrain, opts.powertrains),
        opts.brandId ? eq(models.brandId, opts.brandId) : undefined,
      ),
    )
    .orderBy(asc(brands.name), asc(models.name))
    .limit(opts.limit ?? 60);
}

// 표시용 서식은 클라이언트에서도 쓰므로 format.ts 로 옮기고, 기존 import 경로는 그대로 유지한다
export { formatManwon, formatPriceRange } from "@/lib/format";
