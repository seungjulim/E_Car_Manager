/**
 * 노션 저장: 우리 데이터를 노션 페이지 내용으로 바꿔 저장하고, 어떤 항목이 어느 노션 페이지에 저장됐는지(notion_links)를 기록한다.
 * 노션 호출은 NotionPort 로 주입받아 테스트에서 가짜로 바꿀 수 있다. 모든 조회는 가족(org) 범위로 한정한다.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import { findPreset } from "@/lib/car-care";
import { getVehicle, vehicleLabel } from "@/lib/cars";
import { buildCompareRows } from "@/lib/compare";
import { getInspection } from "@/lib/inspections";
import { comparisonToPage, inspectionToPage, notionPageUrl, serviceToPage, type NotionPageContent } from "@/lib/notion-pages";
import { loadCompareTrims } from "@/lib/wishlist";

const { notionLinks, serviceRecords, documents, repairQuotes, comparisons } = schema;

export type NotionEntity = "service_record" | "inspection_record" | "comparison";
export const NOTION_ENTITIES: readonly NotionEntity[] = ["service_record", "inspection_record", "comparison"];
export const isNotionEntity = (v: unknown): v is NotionEntity => typeof v === "string" && (NOTION_ENTITIES as readonly string[]).includes(v);

export type NotionPort = {
  createPage(args: { title: string; markdown: string }): Promise<{ id: string }>;
  trashPage(id: string): Promise<void>;
};

/* ------------------------------------------------------------------ */
/* 내용 만들기                                                           */
/* ------------------------------------------------------------------ */

async function buildService(db: Db, orgId: string, id: string): Promise<NotionPageContent | null> {
  const [s] = await db
    .select({
      vehicleId: serviceRecords.vehicleId,
      servicedOn: serviceRecords.servicedOn,
      itemCode: serviceRecords.itemCode,
      category: serviceRecords.category,
      mileageKm: serviceRecords.mileageKm,
      shopName: serviceRecords.shopName,
      cost: serviceRecords.cost,
      description: serviceRecords.description,
      nextDueOn: serviceRecords.nextDueOn,
      nextDueKm: serviceRecords.nextDueKm,
      quoteAmount: repairQuotes.totalAmount,
    })
    .from(serviceRecords)
    .leftJoin(repairQuotes, eq(repairQuotes.id, serviceRecords.repairQuoteId))
    .where(and(eq(serviceRecords.id, id), eq(serviceRecords.orgId, orgId)))
    .limit(1);
  if (!s) return null;
  const v = await getVehicle(db, orgId, s.vehicleId);
  if (!v) return null;
  const docs = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.serviceRecordId, id), eq(documents.orgId, orgId)));
  let images = 0;
  if (docs.length > 0) {
    const rows = await db
      .select({ id: schema.documentImages.id })
      .from(schema.documentImages)
      .where(
        inArray(
          schema.documentImages.documentId,
          docs.map((d) => d.id),
        ),
      );
    images = rows.length;
  }
  return serviceToPage({
    vehicleLabel: vehicleLabel(v),
    servicedOn: s.servicedOn,
    itemName: findPreset(s.itemCode)?.name ?? null,
    category: s.category,
    mileageKm: s.mileageKm,
    shopName: s.shopName,
    cost: s.cost,
    description: s.description,
    nextDueOn: s.nextDueOn,
    nextDueKm: s.nextDueKm,
    quoteAmount: s.quoteAmount,
    documentImages: images,
  });
}

async function buildInspection(db: Db, orgId: string, id: string): Promise<NotionPageContent | null> {
  const r = await getInspection(db, orgId, id);
  if (!r) return null;
  const v = await getVehicle(db, orgId, r.vehicleId);
  if (!v) return null;
  return inspectionToPage({
    vehicleLabel: vehicleLabel(v),
    inspectedOn: r.inspectedOn,
    isSelfCheck: r.isSelfCheck,
    place: r.place,
    mileageKm: r.mileageKm,
    overallStatus: r.overallStatus,
    memo: r.memo,
    items: r.items.map((i) => ({ itemName: i.itemName, category: i.category, status: i.status, note: i.note })),
  });
}

async function buildComparison(db: Db, orgId: string, id: string): Promise<NotionPageContent | null> {
  const [c] = await db
    .select({ title: comparisons.title, trimIds: comparisons.trimIds, createdAt: comparisons.createdAt })
    .from(comparisons)
    .where(and(eq(comparisons.id, id), eq(comparisons.orgId, orgId)))
    .limit(1);
  if (!c) return null;
  const trims = await loadCompareTrims(db, orgId, c.trimIds);
  if (trims.length === 0) return null; // 비교한 차량이 모두 삭제됨
  return comparisonToPage({ title: c.title, savedOn: c.createdAt.toISOString().slice(0, 10), trims, rows: buildCompareRows(trims) });
}

const BUILDERS: Record<NotionEntity, (db: Db, orgId: string, id: string) => Promise<NotionPageContent | null>> = {
  service_record: buildService,
  inspection_record: buildInspection,
  comparison: buildComparison,
};

/* ------------------------------------------------------------------ */
/* 저장                                                                 */
/* ------------------------------------------------------------------ */

export type SaveToNotionResult = { ok: true; pageId: string; url: string; replaced: boolean } | { ok: false; reason: "notfound" | "notion"; error?: unknown };

/**
 * 항목을 노션에 저장한다. 이미 저장한 항목이면 새 페이지를 만든 뒤 이전 페이지를 휴지통으로 보낸다(내용이 최신으로 바뀐다).
 * 새 페이지 만들기에 실패하면 이전 페이지와 연결 기록은 그대로 둔다.
 */
export async function saveToNotion(db: Db, orgId: string, port: NotionPort, type: NotionEntity, id: string): Promise<SaveToNotionResult> {
  const content = await BUILDERS[type](db, orgId, id);
  if (!content) return { ok: false, reason: "notfound" };

  const [existing] = await db
    .select({ id: notionLinks.id, pageId: notionLinks.notionPageId })
    .from(notionLinks)
    .where(and(eq(notionLinks.orgId, orgId), eq(notionLinks.entityType, type), eq(notionLinks.entityId, id)))
    .limit(1);

  let created: { id: string };
  try {
    created = await port.createPage(content);
  } catch (error) {
    return { ok: false, reason: "notion", error };
  }

  const now = new Date();
  if (existing) await db.update(notionLinks).set({ notionPageId: created.id, syncedAt: now, updatedAt: now }).where(eq(notionLinks.id, existing.id));
  else await db.insert(notionLinks).values({ orgId, entityType: type, entityId: id, notionPageId: created.id, syncedAt: now });

  if (existing && existing.pageId !== created.id) {
    try {
      await port.trashPage(existing.pageId);
    } catch (error) {
      console.error("[notion] 이전 페이지를 휴지통으로 보내지 못했어요:", error instanceof Error ? error.message : error);
    }
  }
  return { ok: true, pageId: created.id, url: notionPageUrl(created.id), replaced: !!existing };
}

/** 화면 표시용: 이 항목들 중 노션에 저장한 것의 페이지 주소 */
export async function notionSavedUrls(db: Db, orgId: string, type: NotionEntity, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ entityId: notionLinks.entityId, pageId: notionLinks.notionPageId })
    .from(notionLinks)
    .where(and(eq(notionLinks.orgId, orgId), eq(notionLinks.entityType, type), inArray(notionLinks.entityId, ids)));
  return Object.fromEntries(rows.map((r) => [r.entityId, notionPageUrl(r.pageId)]));
}

/** 최근에 노션에 저장한 내역(연결 화면용) */
export async function recentNotionSaves(db: Db, orgId: string, limit = 10) {
  const rows = await db
    .select({ entityType: notionLinks.entityType, pageId: notionLinks.notionPageId, syncedAt: notionLinks.syncedAt })
    .from(notionLinks)
    .where(eq(notionLinks.orgId, orgId))
    .orderBy(desc(notionLinks.syncedAt))
    .limit(limit);
  return rows.filter((r) => r.syncedAt).map((r) => ({ type: r.entityType, url: notionPageUrl(r.pageId), syncedAt: r.syncedAt as Date }));
}

