/** 수리 견적 요청·정비소·견적 저장/조회(DB). 모든 쿼리는 가족(org) 범위로 한정한다 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import { vehicleInOrg } from "@/lib/cars";
import { distanceKm, type LatLng, type QuoteSource, type QuoteView, type ShopType } from "@/lib/quotes";

const { repairShops: shops, repairRequests: requests, repairQuotes: quotes, documents, documentImages } = schema;

/** 위치는 약 100m 단위로 줄여 저장한다(집 앞 좌표가 그대로 남지 않게) */
export const roundCoord = (n: number) => Math.round(n * 1000) / 1000;

/* ------------------------------------------------------------------ */
/* 정비소                                                               */
/* ------------------------------------------------------------------ */

export type ShopRow = { id: string; name: string; type: ShopType; address: string | null; lat: number | null; lng: number | null; phone: string | null; isFavorite: boolean };

const shopCols = { id: shops.id, name: shops.name, type: shops.type, address: shops.address, lat: shops.lat, lng: shops.lng, phone: shops.phone, isFavorite: shops.isFavorite };

export async function listShops(db: Db, orgId: string): Promise<ShopRow[]> {
  return db.select(shopCols).from(shops).where(eq(shops.orgId, orgId)).orderBy(desc(shops.isFavorite), shops.name);
}

export type NewShop = { name: string; type: ShopType; address: string | null; phone: string | null; lat: number | null; lng: number | null };

/* ------------------------------------------------------------------ */
/* 견적 요청                                                            */
/* ------------------------------------------------------------------ */

export type RequestRow = {
  id: string;
  vehicleId: string;
  itemCode: string | null;
  description: string | null;
  partPref: "any" | "genuine" | "oem";
  originLat: number | null;
  originLng: number | null;
  radiusKm: number;
  shopTypes: ShopType[] | null;
  status: "open" | "chosen" | "done";
  chosenQuoteId: string | null;
  createdAt: Date;
};

const requestCols = {
  id: requests.id,
  vehicleId: requests.vehicleId,
  itemCode: requests.itemCode,
  description: requests.description,
  partPref: requests.partPref,
  originLat: requests.originLat,
  originLng: requests.originLng,
  radiusKm: requests.radiusKm,
  shopTypes: requests.shopTypes,
  status: requests.status,
  chosenQuoteId: requests.chosenQuoteId,
  createdAt: requests.createdAt,
};

const SHOP_TYPES: ShopType[] = ["official", "general", "specialist"];
const toTypes = (v: string[] | null): ShopType[] | null => {
  const t = (v ?? []).filter((x): x is ShopType => (SHOP_TYPES as string[]).includes(x));
  return t.length > 0 ? t : null;
};

export type RequestInput = {
  vehicleId: string;
  itemCode: string | null;
  description: string | null;
  partPref: "any" | "genuine" | "oem";
  origin: LatLng | null;
  radiusKm: number;
  shopTypes: ShopType[];
};

export async function createRequest(db: Db, orgId: string, userId: string, input: RequestInput): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!(await vehicleInOrg(db, orgId, input.vehicleId))) return { ok: false };
  const [row] = await db
    .insert(requests)
    .values({
      orgId,
      vehicleId: input.vehicleId,
      itemCode: input.itemCode,
      description: input.description,
      partPref: input.partPref,
      originLat: input.origin ? roundCoord(input.origin.lat) : null,
      originLng: input.origin ? roundCoord(input.origin.lng) : null,
      radiusKm: input.radiusKm,
      shopTypes: input.shopTypes.length > 0 ? input.shopTypes : null,
      createdBy: userId,
    })
    .returning({ id: requests.id });
  return { ok: true, id: row.id };
}

export async function getRequest(db: Db, orgId: string, id: string): Promise<RequestRow | null> {
  const [r] = await db.select(requestCols).from(requests).where(and(eq(requests.id, id), eq(requests.orgId, orgId))).limit(1);
  return r ? { ...r, shopTypes: toTypes(r.shopTypes) } : null;
}

export type RequestSummary = RequestRow & { quoteCount: number; lowest: number | null };

export async function listRequests(db: Db, orgId: string, vehicleId: string, limit = 30): Promise<RequestSummary[]> {
  const list = await db.select(requestCols).from(requests).where(and(eq(requests.orgId, orgId), eq(requests.vehicleId, vehicleId))).orderBy(desc(requests.createdAt)).limit(limit);
  if (list.length === 0) return [];
  const agg = await db
    .select({ requestId: quotes.requestId, n: sql<number>`count(*)::int`, min: sql<number>`min(${quotes.totalAmount})::int` })
    .from(quotes)
    .where(
      and(
        eq(quotes.orgId, orgId),
        inArray(
          quotes.requestId,
          list.map((r) => r.id),
        ),
      ),
    )
    .groupBy(quotes.requestId);
  const by = new Map(agg.map((a) => [a.requestId, a]));
  return list.map((r) => ({ ...r, shopTypes: toTypes(r.shopTypes), quoteCount: by.get(r.id)?.n ?? 0, lowest: by.get(r.id)?.min ?? null }));
}

export async function deleteRequest(db: Db, orgId: string, id: string): Promise<boolean> {
  const r = await getRequest(db, orgId, id);
  if (!r) return false;
  await db.delete(requests).where(eq(requests.id, id)); // 견적은 cascade
  return true;
}

/* ------------------------------------------------------------------ */
/* 견적                                                                 */
/* ------------------------------------------------------------------ */

export async function listQuotes(db: Db, orgId: string, requestId: string): Promise<QuoteView[]> {
  const rows = await db
    .select({
      id: quotes.id,
      shopId: quotes.shopId,
      shopName: shops.name,
      shopType: shops.type,
      phone: shops.phone,
      address: shops.address,
      lat: shops.lat,
      lng: shops.lng,
      totalAmount: quotes.totalAmount,
      partsAmount: quotes.partsAmount,
      laborAmount: quotes.laborAmount,
      taxAmount: quotes.taxAmount,
      partType: quotes.partType,
      warrantyMonths: quotes.warrantyMonths,
      validUntil: quotes.validUntil,
      source: quotes.source,
      note: quotes.note,
      createdAt: quotes.createdAt,
      documentId: quotes.documentId,
    })
    .from(quotes)
    .innerJoin(shops, eq(shops.id, quotes.shopId))
    .where(and(eq(quotes.orgId, orgId), eq(quotes.requestId, requestId)))
    .orderBy(quotes.totalAmount);

  // 첨부한 견적서 사진(첫 장과 장수)
  const docIds = rows.map((r) => r.documentId).filter((d): d is string => !!d);
  const imgs = docIds.length
    ? await db.select({ id: documentImages.id, documentId: documentImages.documentId }).from(documentImages).where(inArray(documentImages.documentId, docIds)).orderBy(documentImages.sortOrder)
    : [];
  return rows.map((r) => {
    const mine = imgs.filter((i) => i.documentId === r.documentId);
    return { ...r, createdAt: r.createdAt.toISOString(), documentImageId: mine[0]?.id ?? null, documentImageCount: mine.length };
  });
}

/** 견적서 사진을 올릴 때 보여 줄 견적 요약(이 가족의 견적일 때만) */
export async function getQuoteBrief(db: Db, orgId: string, quoteId: string) {
  const [r] = await db
    .select({ id: quotes.id, requestId: quotes.requestId, vehicleId: requests.vehicleId, shopName: shops.name, totalAmount: quotes.totalAmount, documentId: quotes.documentId })
    .from(quotes)
    .innerJoin(requests, eq(requests.id, quotes.requestId))
    .innerJoin(shops, eq(shops.id, quotes.shopId))
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .limit(1);
  return r ?? null;
}

/**
 * 견적서(서류)를 견적에 연결한다. 서류는 '견적서' 종류이고 견적과 같은 차량·같은 가족이어야 한다.
 * 연결하면 견적 출처를 '견적서'로 바꾼다. 이미 다른 서류가 붙어 있었다면 그 서류는 돌려준다(삭제는 호출한 쪽이 결정).
 */
export async function attachQuoteDocument(db: Db, orgId: string, quoteId: string, documentId: string): Promise<{ ok: true; replaced: string | null } | { ok: false }> {
  const brief = await getQuoteBrief(db, orgId, quoteId);
  if (!brief) return { ok: false };
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId), eq(documents.vehicleId, brief.vehicleId), eq(documents.kind, "quote")))
    .limit(1);
  if (!doc) return { ok: false };
  await db.update(quotes).set({ documentId, source: "document", updatedAt: new Date() }).where(eq(quotes.id, quoteId));
  return { ok: true, replaced: brief.documentId && brief.documentId !== documentId ? brief.documentId : null };
}

/** 견적(들)에 붙은 견적서 서류 id. 견적·요청을 지울 때 서류도 함께 지우기 위해 쓴다 */
export async function quoteDocumentIds(db: Db, orgId: string, by: { quoteId: string } | { requestId: string }): Promise<string[]> {
  const where = "quoteId" in by ? eq(quotes.id, by.quoteId) : eq(quotes.requestId, by.requestId);
  const rows = await db.select({ documentId: quotes.documentId }).from(quotes).where(and(eq(quotes.orgId, orgId), where));
  return rows.map((r) => r.documentId).filter((d): d is string => !!d);
}

export type QuoteInput = {
  requestId: string;
  shopId: string | null; // null 이면 newShop 으로 새로 만든다
  newShop: NewShop | null;
  totalAmount: number;
  partsAmount: number | null;
  laborAmount: number | null;
  taxAmount: number | null;
  partType: string | null;
  warrantyMonths: number | null;
  validUntil: string | null;
  source: QuoteSource;
  note: string | null;
};

export type AddQuoteResult = { ok: true; id: string; shopId: string } | { ok: false; reason: "request" | "shop" };

export async function addQuote(db: Db, orgId: string, userId: string, input: QuoteInput): Promise<AddQuoteResult> {
  const req = await getRequest(db, orgId, input.requestId);
  if (!req) return { ok: false, reason: "request" };

  let shopId = input.shopId;
  let coords: LatLng | null = null;
  if (shopId) {
    const [s] = await db.select({ lat: shops.lat, lng: shops.lng }).from(shops).where(and(eq(shops.id, shopId), eq(shops.orgId, orgId))).limit(1);
    if (!s) return { ok: false, reason: "shop" };
    if (s.lat != null && s.lng != null) coords = { lat: s.lat, lng: s.lng };
  } else if (input.newShop) {
    const n = input.newShop;
    const [created] = await db
      .insert(shops)
      .values({
        orgId,
        name: n.name,
        type: n.type,
        address: n.address,
        phone: n.phone,
        lat: n.lat != null ? roundCoord(n.lat) : null,
        lng: n.lng != null ? roundCoord(n.lng) : null,
        source: "manual",
      })
      .returning({ id: shops.id, lat: shops.lat, lng: shops.lng });
    shopId = created.id;
    if (created.lat != null && created.lng != null) coords = { lat: created.lat, lng: created.lng };
  } else {
    return { ok: false, reason: "shop" };
  }

  const dist = req.originLat != null && req.originLng != null && coords ? distanceKm({ lat: req.originLat, lng: req.originLng }, coords) : null;
  const [row] = await db
    .insert(quotes)
    .values({
      orgId,
      requestId: input.requestId,
      shopId,
      totalAmount: input.totalAmount,
      partsAmount: input.partsAmount,
      laborAmount: input.laborAmount,
      taxAmount: input.taxAmount,
      partType: input.partType,
      warrantyMonths: input.warrantyMonths,
      validUntil: input.validUntil,
      source: input.source,
      distanceKm: dist,
      note: input.note,
      createdBy: userId,
    })
    .returning({ id: quotes.id });
  return { ok: true, id: row.id, shopId };
}

/** 견적 삭제. 선택해 둔 견적이었다면 요청을 다시 '진행 중'으로 되돌린다 */
export async function deleteQuote(db: Db, orgId: string, id: string): Promise<{ requestId: string } | null> {
  const [q] = await db.select({ requestId: quotes.requestId }).from(quotes).where(and(eq(quotes.id, id), eq(quotes.orgId, orgId))).limit(1);
  if (!q) return null;
  await db.delete(quotes).where(eq(quotes.id, id)); // chosen_quote_id 는 FK(set null)로 비워진다
  await db
    .update(requests)
    .set({ status: "open", updatedAt: new Date() })
    .where(and(eq(requests.id, q.requestId), eq(requests.orgId, orgId), eq(requests.status, "chosen"), sql`${requests.chosenQuoteId} is null`));
  return { requestId: q.requestId };
}

/** 이 견적으로 정하기. 이미 정한 견적을 다시 누르면 선택을 풀어 준다 */
export async function chooseQuote(db: Db, orgId: string, requestId: string, quoteId: string): Promise<"chosen" | "cleared" | null> {
  const req = await getRequest(db, orgId, requestId);
  if (!req) return null;
  const [q] = await db.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.requestId, requestId), eq(quotes.orgId, orgId))).limit(1);
  if (!q) return null;
  if (req.chosenQuoteId === quoteId) {
    await db.update(requests).set({ chosenQuoteId: null, status: "open", updatedAt: new Date() }).where(eq(requests.id, requestId));
    return "cleared";
  }
  await db.update(requests).set({ chosenQuoteId: quoteId, status: "chosen", updatedAt: new Date() }).where(eq(requests.id, requestId));
  return "chosen";
}

/** 이 서류가 연결된 견적(없으면 null) */
export async function quoteForDocument(db: Db, orgId: string, documentId: string) {
  const [r] = await db
    .select({
      quoteId: quotes.id,
      requestId: quotes.requestId,
      vehicleId: requests.vehicleId,
      shopName: shops.name,
      totalAmount: quotes.totalAmount,
      partsAmount: quotes.partsAmount,
      laborAmount: quotes.laborAmount,
      taxAmount: quotes.taxAmount,
      partType: quotes.partType,
      warrantyMonths: quotes.warrantyMonths,
      validUntil: quotes.validUntil,
    })
    .from(quotes)
    .innerJoin(requests, eq(requests.id, quotes.requestId))
    .innerJoin(shops, eq(shops.id, quotes.shopId))
    .where(and(eq(quotes.documentId, documentId), eq(quotes.orgId, orgId)))
    .limit(1);
  return r ?? null;
}

/**
 * 정비 기록을 견적에 연결한다: 정비소·견적 id 를 기록에 남기고, 그 견적 요청을 '완료'로 바꾼다.
 * 같은 가족·같은 차량의 견적이 아니면 연결하지 않는다(false).
 */
export async function linkServiceToQuote(db: Db, orgId: string, serviceId: string, quoteId: string): Promise<boolean> {
  const brief = await getQuoteBrief(db, orgId, quoteId);
  if (!brief) return false;
  const [svc] = await db
    .select({ id: schema.serviceRecords.id })
    .from(schema.serviceRecords)
    .where(and(eq(schema.serviceRecords.id, serviceId), eq(schema.serviceRecords.orgId, orgId), eq(schema.serviceRecords.vehicleId, brief.vehicleId)))
    .limit(1);
  if (!svc) return false;
  const [q] = await db.select({ shopId: quotes.shopId }).from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  await db.update(schema.serviceRecords).set({ repairQuoteId: quoteId, shopId: q.shopId, updatedAt: new Date() }).where(eq(schema.serviceRecords.id, serviceId));
  await db.update(requests).set({ chosenQuoteId: quoteId, status: "done", updatedAt: new Date() }).where(and(eq(requests.id, brief.requestId), eq(requests.orgId, orgId)));
  return true;
}

/** 이 견적을 따라 한 정비 기록(있으면 가장 최근 것) */
export async function serviceForQuote(db: Db, orgId: string, quoteId: string) {
  const [r] = await db
    .select({ id: schema.serviceRecords.id, cost: schema.serviceRecords.cost, servicedOn: schema.serviceRecords.servicedOn })
    .from(schema.serviceRecords)
    .where(and(eq(schema.serviceRecords.repairQuoteId, quoteId), eq(schema.serviceRecords.orgId, orgId)))
    .orderBy(desc(schema.serviceRecords.servicedOn))
    .limit(1);
  return r ?? null;
}

/** 아직 정비 기록과 연결되지 않은 '정한' 견적들(정비 기록·내역서 저장 때 비교할 후보) */
export async function chosenQuotesFor(db: Db, orgId: string, vehicleId: string) {
  const rows = await db
    .select({ quoteId: quotes.id, shopName: shops.name, totalAmount: quotes.totalAmount, itemCode: requests.itemCode, description: requests.description })
    .from(requests)
    .innerJoin(quotes, eq(quotes.id, requests.chosenQuoteId))
    .innerJoin(shops, eq(shops.id, quotes.shopId))
    .where(and(eq(requests.orgId, orgId), eq(requests.vehicleId, vehicleId), eq(requests.status, "chosen")))
    .orderBy(desc(requests.updatedAt))
    .limit(10);
  return rows;
}

export type QuotePatch = {
  totalAmount: number;
  partsAmount: number | null;
  laborAmount: number | null;
  taxAmount: number | null;
  partType: string | null;
  warrantyMonths: number | null;
  validUntil: string | null;
};

/** 견적의 금액·부품 종류·보증·유효기간을 고친다(견적서에서 읽은 값을 반영할 때). 이 가족 견적이 아니면 null */
export async function updateQuoteDetails(db: Db, orgId: string, quoteId: string, patch: QuotePatch): Promise<{ requestId: string; vehicleId: string } | null> {
  const brief = await getQuoteBrief(db, orgId, quoteId);
  if (!brief) return null;
  await db.update(quotes).set({ ...patch, updatedAt: new Date() }).where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)));
  return { requestId: brief.requestId, vehicleId: brief.vehicleId };
}

/** 정비소 이름으로 우리 가족이 등록해 둔 정비소 찾기(공백·대소문자 무시, 정확히 일치할 때만) */
export function matchShopByName(shopList: { id: string; name: string }[], name: string | null): string | null {
  if (!name) return null;
  const key = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const hit = shopList.filter((s) => key(s.name) === key(name));
  return hit.length === 1 ? hit[0].id : null;
}
