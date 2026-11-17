import { and, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { PowertrainSpecs } from "@/db/schema/catalog";
import { purchaseCriteria } from "@/db/seed/data/purchase";
import type { Db } from "@/lib/catalog";
import type { Powertrain } from "@/lib/powertrain";
import {
  clampWeight,
  weightedScore,
  type CheckStatus,
  type CheckValue,
  type ScoreSummary,
} from "@/lib/purchase-score";

const {
  wishlist,
  purchaseChecks,
  purchaseCriteriaWeights,
  catalogTrims: trims,
  catalogModels: models,
  catalogBrands: brands,
  catalogImages: images,
} = schema;

/** 구입 전 체크 항목(현재는 코드에 둔 기본 10개를 사용. 가족별 편집은 추후) */
export const CRITERIA = purchaseCriteria;
const CODES = new Set(CRITERIA.map((c) => c.code));
export const isCriterionCode = (code: string) => CODES.has(code);

/* ---------------- 중요도(가중치) ---------------- */

export async function loadWeights(db: Db, orgId: string, userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ code: purchaseCriteriaWeights.criteriaCode, weight: purchaseCriteriaWeights.weight })
    .from(purchaseCriteriaWeights)
    .where(and(eq(purchaseCriteriaWeights.orgId, orgId), eq(purchaseCriteriaWeights.userId, userId)));
  return Object.fromEntries(rows.filter((r) => CODES.has(r.code)).map((r) => [r.code, r.weight]));
}

export async function setWeight(db: Db, orgId: string, userId: string, code: string, weight: number): Promise<boolean> {
  if (!CODES.has(code) || !Number.isFinite(weight)) return false;
  const w = clampWeight(weight);
  await db
    .insert(purchaseCriteriaWeights)
    .values({ orgId, userId, criteriaCode: code, weight: w })
    .onConflictDoUpdate({ target: [purchaseCriteriaWeights.userId, purchaseCriteriaWeights.criteriaCode], set: { weight: w } });
  return true;
}

export async function resetWeights(db: Db, orgId: string, userId: string): Promise<void> {
  await db
    .delete(purchaseCriteriaWeights)
    .where(and(eq(purchaseCriteriaWeights.orgId, orgId), eq(purchaseCriteriaWeights.userId, userId)));
}

/* ---------------- 체크 기록 ---------------- */

export type CheckInput = {
  wishlistId: string;
  criteriaCode: string;
  status?: CheckStatus;
  score?: number | null;
  note?: string | null;
};

export type UpsertCheckResult = { ok: true } | { ok: false; reason: "criteria" | "wishlist" | "empty" };

/** 내 관심 항목에 대한 체크만 저장한다. 보낸 필드만 바꾸고 나머지는 유지 */
export async function upsertCheck(db: Db, orgId: string, userId: string, input: CheckInput): Promise<UpsertCheckResult> {
  if (!CODES.has(input.criteriaCode)) return { ok: false, reason: "criteria" };

  const set: { status?: CheckStatus; score?: number | null; note?: string | null } = {};
  if (input.status !== undefined) set.status = input.status;
  if (input.score !== undefined) set.score = input.score;
  if (input.note !== undefined) set.note = input.note && input.note.trim() !== "" ? input.note.trim() : null;
  if (Object.keys(set).length === 0) return { ok: false, reason: "empty" };

  const mine = await db
    .select({ id: wishlist.id })
    .from(wishlist)
    .where(and(eq(wishlist.id, input.wishlistId), eq(wishlist.orgId, orgId), eq(wishlist.userId, userId)))
    .limit(1);
  if (mine.length === 0) return { ok: false, reason: "wishlist" };

  await db
    .insert(purchaseChecks)
    .values({ orgId, userId, wishlistId: input.wishlistId, criteriaCode: input.criteriaCode, ...set })
    .onConflictDoUpdate({
      target: [purchaseChecks.userId, purchaseChecks.wishlistId, purchaseChecks.criteriaCode],
      set: { ...set, updatedAt: new Date() },
    });
  return { ok: true };
}

export async function loadChecks(
  db: Db,
  orgId: string,
  userId: string,
  wishlistIds: string[],
): Promise<Record<string, Record<string, CheckValue>>> {
  if (wishlistIds.length === 0) return {};
  const rows = await db
    .select({
      wishlistId: purchaseChecks.wishlistId,
      code: purchaseChecks.criteriaCode,
      status: purchaseChecks.status,
      score: purchaseChecks.score,
      note: purchaseChecks.note,
    })
    .from(purchaseChecks)
    .where(
      and(eq(purchaseChecks.orgId, orgId), eq(purchaseChecks.userId, userId), inArray(purchaseChecks.wishlistId, wishlistIds)),
    );
  const out: Record<string, Record<string, CheckValue>> = {};
  for (const r of rows) {
    if (!CODES.has(r.code)) continue;
    (out[r.wishlistId] ??= {})[r.code] = { status: r.status, score: r.score, note: r.note };
  }
  return out;
}

/* ---------------- 후보(내 관심 목록) ---------------- */

export type PurchaseCandidate = {
  wishlistId: string;
  trimId: string;
  trimName: string;
  price: number | null;
  subsidyEstimate: number | null;
  powertrainSpecs: PowertrainSpecs | null;
  modelId: string;
  modelName: string;
  brandName: string;
  powertrain: Powertrain;
  coverUrl: string | null;
};

const candidateColumns = {
  wishlistId: wishlist.id,
  trimId: trims.id,
  trimName: trims.name,
  price: trims.price,
  subsidyEstimate: trims.subsidyEstimate,
  powertrainSpecs: trims.powertrainSpecs,
  modelId: models.id,
  modelName: models.name,
  brandName: brands.name,
  powertrain: models.powertrain,
  coverUrl: images.url,
};

/** 내가 담은 후보들(최근 수정 순) */
export async function listMyCandidates(db: Db, orgId: string, userId: string): Promise<PurchaseCandidate[]> {
  return db
    .select(candidateColumns)
    .from(wishlist)
    .innerJoin(trims, eq(trims.id, wishlist.trimId))
    .innerJoin(models, eq(models.id, trims.modelId))
    .innerJoin(brands, eq(brands.id, models.brandId))
    .leftJoin(images, and(eq(images.modelId, models.id), eq(images.isCover, true)))
    .where(and(eq(wishlist.orgId, orgId), eq(wishlist.userId, userId)))
    .orderBy(desc(wishlist.updatedAt));
}

/** 내 관심 항목 하나(남의 것·다른 가족 것이면 null) */
export async function getMyCandidate(db: Db, orgId: string, userId: string, wishlistId: string): Promise<PurchaseCandidate | null> {
  const [row] = await db
    .select(candidateColumns)
    .from(wishlist)
    .innerJoin(trims, eq(trims.id, wishlist.trimId))
    .innerJoin(models, eq(models.id, trims.modelId))
    .innerJoin(brands, eq(brands.id, models.brandId))
    .leftJoin(images, and(eq(images.modelId, models.id), eq(images.isCover, true)))
    .where(and(eq(wishlist.id, wishlistId), eq(wishlist.orgId, orgId), eq(wishlist.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type CandidateProgress = PurchaseCandidate & { summary: ScoreSummary };

/** 후보별 체크 진행 상황(확인 수·문제 수·가중 총점) */
export async function listCandidateProgress(db: Db, orgId: string, userId: string): Promise<CandidateProgress[]> {
  const [candidates, weights] = await Promise.all([listMyCandidates(db, orgId, userId), loadWeights(db, orgId, userId)]);
  const checks = await loadChecks(db, orgId, userId, candidates.map((c) => c.wishlistId));
  return candidates.map((c) => ({ ...c, summary: weightedScore(CRITERIA, checks[c.wishlistId] ?? {}, weights) }));
}

/** 비교표용: 트림별 "내 기준" 체크 총점 */
export async function myCheckScoresByTrim(
  db: Db,
  orgId: string,
  userId: string,
  trimIds: string[],
): Promise<Record<string, { score: number | null; scored: number; issues: number }>> {
  if (trimIds.length === 0) return {};
  const mine = await db
    .select({ id: wishlist.id, trimId: wishlist.trimId })
    .from(wishlist)
    .where(and(eq(wishlist.orgId, orgId), eq(wishlist.userId, userId), inArray(wishlist.trimId, trimIds)));
  if (mine.length === 0) return {};

  const [checks, weights] = await Promise.all([
    loadChecks(db, orgId, userId, mine.map((m) => m.id)),
    loadWeights(db, orgId, userId),
  ]);
  return Object.fromEntries(
    mine.map((m) => {
      const s = weightedScore(CRITERIA, checks[m.id] ?? {}, weights);
      return [m.trimId, { score: s.score, scored: s.scored, issues: s.issues }];
    }),
  );
}
