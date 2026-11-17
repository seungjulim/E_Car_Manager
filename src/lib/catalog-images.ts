import { and, asc, desc, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import { BLOB_HOST_SUFFIX, MAX_IMAGES_PER_MODEL, blobPrefix, type ImageKind } from "@/lib/image-constants";

const { catalogImages: images, catalogModels: models, catalogTrims: trims } = schema;


/**
 * 클라이언트가 알려 준 Blob 주소가 정말 우리 저장소의 이 모델 경로인지 확인한다.
 * 통과하면 Blob pathname(앞의 / 제외)을 돌려준다.
 */
export function parseOwnBlobUrl(rawUrl: string, orgId: string, modelId: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(BLOB_HOST_SUFFIX) || url.username || url.password) return null;
  const pathname = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (pathname.includes("..") || !pathname.startsWith(blobPrefix(orgId, modelId))) return null;
  return pathname;
}

export async function modelBelongsToOrg(db: Db, orgId: string, modelId: string): Promise<boolean> {
  const rows = await db
    .select({ id: models.id })
    .from(models)
    .where(and(eq(models.id, modelId), eq(models.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

export type NewImage = {
  modelId: string;
  trimId?: string | null;
  kind: ImageKind;
  url: string;
  storageKey: string;
  origin: "upload" | "url";
  sourceUrl?: string | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
};

export type AddImageResult = { ok: true; id: string; isCover: boolean } | { ok: false; reason: "limit" | "model" | "trim" };

/** 이미지 행 추가. 첫 이미지는 자동으로 대표 이미지가 된다. */
export async function addCatalogImage(db: Db, orgId: string, userId: string, input: NewImage): Promise<AddImageResult> {
  if (!(await modelBelongsToOrg(db, orgId, input.modelId))) return { ok: false, reason: "model" };

  if (input.trimId) {
    const t = await db
      .select({ id: trims.id })
      .from(trims)
      .where(and(eq(trims.id, input.trimId), eq(trims.modelId, input.modelId), eq(trims.orgId, orgId)))
      .limit(1);
    if (t.length === 0) return { ok: false, reason: "trim" };
  }

  const [stats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      maxSort: sql<number>`coalesce(max(${images.sortOrder}), -1)::int`,
      covers: sql<number>`count(*) filter (where ${images.isCover})::int`,
    })
    .from(images)
    .where(and(eq(images.modelId, input.modelId), eq(images.orgId, orgId)));
  if (stats.count >= MAX_IMAGES_PER_MODEL) return { ok: false, reason: "limit" };

  const base = {
    orgId,
    modelId: input.modelId,
    trimId: input.trimId ?? null,
    kind: input.kind,
    url: input.url,
    storageKey: input.storageKey,
    width: input.width ?? null,
    height: input.height ?? null,
    caption: input.caption ?? null,
    sortOrder: stats.maxSort + 1,
    origin: input.origin,
    sourceUrl: input.sourceUrl ?? null,
    createdBy: userId,
  };

  try {
    const [row] = await db
      .insert(images)
      .values({ ...base, isCover: stats.covers === 0 })
      .returning({ id: images.id, isCover: images.isCover });
    return { ok: true, id: row.id, isCover: row.isCover };
  } catch {
    // 동시에 두 장이 올라와 대표 이미지가 겹친 경우: 대표가 아닌 이미지로 다시 저장
    const [row] = await db.insert(images).values({ ...base, isCover: false }).returning({ id: images.id, isCover: images.isCover });
    return { ok: true, id: row.id, isCover: row.isCover };
  }
}

/** 대표 이미지 지정(모델당 1장). 기존 대표를 먼저 풀고 새로 지정한다. */
export async function setCoverImage(db: Db, orgId: string, imageId: string): Promise<boolean> {
  const [img] = await db
    .select({ id: images.id, modelId: images.modelId })
    .from(images)
    .where(and(eq(images.id, imageId), eq(images.orgId, orgId)))
    .limit(1);
  if (!img) return false;
  await db.update(images).set({ isCover: false }).where(and(eq(images.modelId, img.modelId), eq(images.isCover, true)));
  await db.update(images).set({ isCover: true }).where(eq(images.id, img.id));
  return true;
}

/** 이미지 행 삭제. 대표 이미지였다면 남은 이미지 중 첫 번째를 대표로 올린다. Blob 삭제용 키를 돌려준다. */
export async function deleteCatalogImage(db: Db, orgId: string, imageId: string): Promise<{ storageKey: string } | null> {
  const [img] = await db
    .select({ id: images.id, modelId: images.modelId, storageKey: images.storageKey, isCover: images.isCover })
    .from(images)
    .where(and(eq(images.id, imageId), eq(images.orgId, orgId)))
    .limit(1);
  if (!img) return null;

  await db.delete(images).where(eq(images.id, img.id));
  if (img.isCover) {
    const [next] = await db
      .select({ id: images.id })
      .from(images)
      .where(eq(images.modelId, img.modelId))
      .orderBy(asc(images.sortOrder))
      .limit(1);
    if (next) await db.update(images).set({ isCover: true }).where(eq(images.id, next.id));
  }
  return { storageKey: img.storageKey };
}

/* ---------------- 모델 상세 조회 ---------------- */

export type ImageView = { id: string; url: string; kind: ImageKind; caption: string | null; isCover: boolean; trimId: string | null; origin: "upload" | "url"; sourceUrl: string | null };

export async function listModelImages(db: Db, orgId: string, modelId: string): Promise<ImageView[]> {
  return db
    .select({
      id: images.id,
      url: images.url,
      kind: images.kind,
      caption: images.caption,
      isCover: images.isCover,
      trimId: images.trimId,
      origin: images.origin,
      sourceUrl: images.sourceUrl,
    })
    .from(images)
    .where(and(eq(images.modelId, modelId), eq(images.orgId, orgId)))
    .orderBy(desc(images.isCover), asc(images.sortOrder));
}
