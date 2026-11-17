import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import { MAX_COMPARE, type CompareTrim } from "@/lib/compare";
import { myCheckScoresByTrim } from "@/lib/purchase";

const {
  wishlist,
  comparisons,
  catalogTrims: trims,
  catalogModels: models,
  catalogBrands: brands,
  catalogImages: images,
} = schema;

import { MAX_WISHLIST_PER_USER, type WishlistStatus } from "@/lib/wishlist-constants";

export { MAX_WISHLIST_PER_USER, WISHLIST_STATUSES, WISHLIST_STATUS_LABEL, type WishlistStatus } from "@/lib/wishlist-constants";

async function trimInOrg(db: Db, orgId: string, trimId: string) {
  const rows = await db
    .select({ id: trims.id })
    .from(trims)
    .where(and(eq(trims.id, trimId), eq(trims.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

/* ---------------- 관심 목록 ---------------- */

export type AddResult = { ok: true; id: string } | { ok: false; reason: "trim" | "limit" };

/** 관심 추가(이미 있으면 그대로). 트림이 이 가족 것이 아니면 거부 */
export async function addToWishlist(db: Db, orgId: string, userId: string, trimId: string): Promise<AddResult> {
  if (!(await trimInOrg(db, orgId, trimId))) return { ok: false, reason: "trim" };

  const existing = await db
    .select({ id: wishlist.id })
    .from(wishlist)
    .where(and(eq(wishlist.orgId, orgId), eq(wishlist.userId, userId), eq(wishlist.trimId, trimId)))
    .limit(1);
  if (existing[0]) return { ok: true, id: existing[0].id };

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(wishlist)
    .where(and(eq(wishlist.orgId, orgId), eq(wishlist.userId, userId)));
  if (count >= MAX_WISHLIST_PER_USER) return { ok: false, reason: "limit" };

  const inserted = await db
    .insert(wishlist)
    .values({ orgId, userId, trimId })
    .onConflictDoNothing()
    .returning({ id: wishlist.id });
  if (inserted[0]) return { ok: true, id: inserted[0].id };
  // 동시에 두 번 눌러 이미 들어간 경우
  const again = await db
    .select({ id: wishlist.id })
    .from(wishlist)
    .where(and(eq(wishlist.orgId, orgId), eq(wishlist.userId, userId), eq(wishlist.trimId, trimId)))
    .limit(1);
  return { ok: true, id: again[0].id };
}

export type WishlistPatch = { rating?: number | null; status?: WishlistStatus; memo?: string | null };

/** 내 관심 항목만 수정할 수 있다 */
export async function updateWishlistEntry(
  db: Db,
  orgId: string,
  userId: string,
  id: string,
  patch: WishlistPatch,
): Promise<boolean> {
  const set: Partial<typeof wishlist.$inferInsert> = { updatedAt: new Date() };
  if (patch.rating !== undefined) set.rating = patch.rating;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.memo !== undefined) set.memo = patch.memo && patch.memo.trim() !== "" ? patch.memo.trim() : null;

  const updated = await db
    .update(wishlist)
    .set(set)
    .where(and(eq(wishlist.id, id), eq(wishlist.orgId, orgId), eq(wishlist.userId, userId)))
    .returning({ id: wishlist.id });
  return updated.length > 0;
}

export async function removeWishlistEntry(db: Db, orgId: string, userId: string, id: string): Promise<boolean> {
  const removed = await db
    .delete(wishlist)
    .where(and(eq(wishlist.id, id), eq(wishlist.orgId, orgId), eq(wishlist.userId, userId)))
    .returning({ id: wishlist.id });
  return removed.length > 0;
}

export async function removeWishlistByTrim(db: Db, orgId: string, userId: string, trimId: string): Promise<boolean> {
  const removed = await db
    .delete(wishlist)
    .where(and(eq(wishlist.orgId, orgId), eq(wishlist.userId, userId), eq(wishlist.trimId, trimId)))
    .returning({ id: wishlist.id });
  return removed.length > 0;
}

/** 이 사용자가 담은 트림 → 관심 항목 id (모델 상세의 하트 표시용) */
export async function myWishlistByTrim(db: Db, orgId: string, userId: string, trimIds: string[]): Promise<Record<string, string>> {
  if (trimIds.length === 0) return {};
  const rows = await db
    .select({ id: wishlist.id, trimId: wishlist.trimId })
    .from(wishlist)
    .where(and(eq(wishlist.orgId, orgId), eq(wishlist.userId, userId), inArray(wishlist.trimId, trimIds)));
  return Object.fromEntries(rows.map((r) => [r.trimId, r.id]));
}

export type WishlistEntry = {
  id: string;
  userId: string;
  rating: number | null;
  status: WishlistStatus;
  memo: string | null;
  updatedAt: Date;
};

export type WishlistGroup = {
  trimId: string;
  trimName: string;
  price: number | null;
  subsidyEstimate: number | null;
  modelId: string;
  modelName: string;
  brandName: string;
  powertrain: "ev" | "hev" | "phev" | "ice";
  coverUrl: string | null;
  entries: WishlistEntry[];
  avgRating: number | null;
  ratingCount: number;
  updatedAt: Date;
};

export function summarizeRatings(ratings: (number | null)[]): { avg: number | null; count: number } {
  const given = ratings.filter((r): r is number => r != null);
  return { avg: given.length === 0 ? null : given.reduce((a, b) => a + b, 0) / given.length, count: given.length };
}

/** 가족 전체의 관심 목록을 트림별로 묶어서(구성원별 평가 포함) 돌려준다 */
export async function listWishlistGroups(db: Db, orgId: string): Promise<WishlistGroup[]> {
  const rows = await db
    .select({
      id: wishlist.id,
      userId: wishlist.userId,
      rating: wishlist.rating,
      status: wishlist.status,
      memo: wishlist.memo,
      updatedAt: wishlist.updatedAt,
      trimId: trims.id,
      trimName: trims.name,
      price: trims.price,
      subsidyEstimate: trims.subsidyEstimate,
      modelId: models.id,
      modelName: models.name,
      brandName: brands.name,
      powertrain: models.powertrain,
      coverUrl: images.url,
    })
    .from(wishlist)
    .innerJoin(trims, eq(trims.id, wishlist.trimId))
    .innerJoin(models, eq(models.id, trims.modelId))
    .innerJoin(brands, eq(brands.id, models.brandId))
    .leftJoin(images, and(eq(images.modelId, models.id), eq(images.isCover, true)))
    .where(eq(wishlist.orgId, orgId))
    .orderBy(desc(wishlist.updatedAt));

  const groups = new Map<string, WishlistGroup>();
  for (const r of rows) {
    const entry: WishlistEntry = { id: r.id, userId: r.userId, rating: r.rating, status: r.status, memo: r.memo, updatedAt: r.updatedAt };
    const g = groups.get(r.trimId);
    if (g) {
      g.entries.push(entry);
      if (r.updatedAt > g.updatedAt) g.updatedAt = r.updatedAt;
    } else {
      groups.set(r.trimId, {
        trimId: r.trimId, trimName: r.trimName, price: r.price, subsidyEstimate: r.subsidyEstimate,
        modelId: r.modelId, modelName: r.modelName, brandName: r.brandName, powertrain: r.powertrain,
        coverUrl: r.coverUrl, entries: [entry], avgRating: null, ratingCount: 0, updatedAt: r.updatedAt,
      });
    }
  }
  for (const g of groups.values()) {
    const s = summarizeRatings(g.entries.map((e) => e.rating));
    g.avgRating = s.avg;
    g.ratingCount = s.count;
  }
  // 평균 별점 높은 순(평가 없는 항목은 뒤), 같으면 최근 수정 순
  return [...groups.values()].sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1) || b.updatedAt.getTime() - a.updatedAt.getTime());
}

/* ---------------- 비교 ---------------- */

/** 비교할 트림들을 요청한 순서대로 불러온다(이 가족 것만, 가족 평점 평균 포함) */
export async function loadCompareTrims(db: Db, orgId: string, trimIds: string[], userId?: string): Promise<CompareTrim[]> {
  const ids = [...new Set(trimIds)].slice(0, MAX_COMPARE);
  if (ids.length === 0) return [];

  const [rows, ratingRows] = await Promise.all([
    db
      .select({
        id: trims.id,
        trimName: trims.name,
        price: trims.price,
        subsidyEstimate: trims.subsidyEstimate,
        features: trims.features,
        powertrainSpecs: trims.powertrainSpecs,
        pros: trims.pros,
        cons: trims.cons,
        modelId: models.id,
        modelName: models.name,
        brandName: brands.name,
        powertrain: models.powertrain,
        coverUrl: images.url,
      })
      .from(trims)
      .innerJoin(models, eq(models.id, trims.modelId))
      .innerJoin(brands, eq(brands.id, models.brandId))
      .leftJoin(images, and(eq(images.modelId, models.id), eq(images.isCover, true)))
      .where(and(eq(trims.orgId, orgId), inArray(trims.id, ids))),
    db
      .select({ trimId: wishlist.trimId, rating: wishlist.rating })
      .from(wishlist)
      .where(and(eq(wishlist.orgId, orgId), inArray(wishlist.trimId, ids))),
  ]);

  const ratingsByTrim = new Map<string, (number | null)[]>();
  for (const r of ratingRows) ratingsByTrim.set(r.trimId, [...(ratingsByTrim.get(r.trimId) ?? []), r.rating]);

  // 로그인한 사용자 기준의 구입 전 체크 점수(있으면 비교표에 한 줄 추가)
  const checkScores = userId ? await myCheckScoresByTrim(db, orgId, userId, ids) : {};

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => ({ ...r, rating: summarizeRatings(ratingsByTrim.get(r.id) ?? []), checkScore: checkScores[r.id] }));
}

export type SavedComparison = { id: string; title: string; trimIds: string[]; createdAt: Date };

export async function saveComparison(
  db: Db,
  orgId: string,
  userId: string,
  title: string,
  trimIds: string[],
): Promise<{ ok: true; id: string } | { ok: false; reason: "count" | "trim" }> {
  const ids = [...new Set(trimIds)];
  if (ids.length < 2 || ids.length > MAX_COMPARE) return { ok: false, reason: "count" };
  const found = await db
    .select({ id: trims.id })
    .from(trims)
    .where(and(eq(trims.orgId, orgId), inArray(trims.id, ids)));
  if (found.length !== ids.length) return { ok: false, reason: "trim" };

  const [row] = await db
    .insert(comparisons)
    .values({ orgId, title, trimIds: ids, createdBy: userId })
    .returning({ id: comparisons.id });
  return { ok: true, id: row.id };
}

export async function listComparisons(db: Db, orgId: string): Promise<SavedComparison[]> {
  return db
    .select({ id: comparisons.id, title: comparisons.title, trimIds: comparisons.trimIds, createdAt: comparisons.createdAt })
    .from(comparisons)
    .where(eq(comparisons.orgId, orgId))
    .orderBy(desc(comparisons.createdAt))
    .limit(30);
}

export async function deleteComparison(db: Db, orgId: string, id: string): Promise<boolean> {
  const removed = await db
    .delete(comparisons)
    .where(and(eq(comparisons.id, id), eq(comparisons.orgId, orgId)))
    .returning({ id: comparisons.id });
  return removed.length > 0;
}


