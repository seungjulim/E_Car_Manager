import { and, asc, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { FeatureMap, PowertrainSpecs } from "@/db/schema/catalog";
import type { Db } from "@/lib/catalog";
import { listModelImages, type ImageView } from "@/lib/catalog-images";
import type { Powertrain } from "@/lib/powertrain";

const { catalogBrands: brands, catalogModels: models, catalogTrims: trims } = schema;

export type TrimView = {
  id: string;
  name: string;
  price: number | null; // 원
  subsidyEstimate: number | null; // 원
  features: FeatureMap;
  powertrainSpecs: PowertrainSpecs | null;
  pros: string[];
  cons: string[];
  sourceUrl: string | null;
};

export type ModelDetail = {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  segment: string | null;
  powertrain: Powertrain;
  iceFuel: "gasoline" | "diesel" | "lpg" | null;
  releaseYear: number | null;
  summary: string | null;
  priceMin: number | null;
  priceMax: number | null;
  trims: TrimView[];
  images: ImageView[];
};

/** 모델 상세(브랜드·트림·이미지). 다른 가족의 모델이면 null */
export async function getModelDetail(db: Db, orgId: string, modelId: string): Promise<ModelDetail | null> {
  const [m] = await db
    .select({
      id: models.id,
      name: models.name,
      brandId: brands.id,
      brandName: brands.name,
      segment: models.segment,
      powertrain: models.powertrain,
      iceFuel: models.iceFuel,
      releaseYear: models.releaseYear,
      summary: models.summary,
      priceMin: models.priceMin,
      priceMax: models.priceMax,
    })
    .from(models)
    .innerJoin(brands, eq(brands.id, models.brandId))
    .where(and(eq(models.id, modelId), eq(models.orgId, orgId)))
    .limit(1);
  if (!m) return null;

  const [trimRows, imageRows] = await Promise.all([
    db
      .select({
        id: trims.id,
        name: trims.name,
        price: trims.price,
        subsidyEstimate: trims.subsidyEstimate,
        features: trims.features,
        powertrainSpecs: trims.powertrainSpecs,
        pros: trims.pros,
        cons: trims.cons,
        sourceUrl: trims.sourceUrl,
      })
      .from(trims)
      .where(and(eq(trims.modelId, modelId), eq(trims.orgId, orgId)))
      // 가격 낮은 순(가격 미등록은 뒤로), 같으면 이름순
      .orderBy(sql`${trims.price} asc nulls last`, asc(trims.name)),
    listModelImages(db, orgId, modelId),
  ]);

  return { ...m, trims: trimRows, images: imageRows };
}
