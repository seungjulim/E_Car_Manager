/** 서류(수리내역서 등) 저장·조회(DB). 이미지는 비공개 Blob 에 있고 여기엔 경로만 저장한다 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import { vehicleInOrg } from "@/lib/cars";
import { isOwnDocumentPath, MAX_IMAGES_PER_DOCUMENT, type DocumentKind } from "@/lib/document-constants";

const { documents, documentImages: images, serviceRecords, repairQuotes } = schema;

export type NewImage = { pathname: string; width: number | null; height: number | null };
export type DocumentImageRow = { id: string; storageKey: string; sortOrder: number; width: number | null; height: number | null };
export type DocumentRow = {
  id: string;
  vehicleId: string;
  kind: DocumentKind | "fuel_receipt" | "insurance" | "registration" | "other";
  serviceRecordId: string | null;
  ocrJson: unknown;
  createdAt: Date;
};

const docCols = { id: documents.id, vehicleId: documents.vehicleId, kind: documents.kind, serviceRecordId: documents.serviceRecordId, ocrJson: documents.ocrJson, createdAt: documents.createdAt };
const dim = (n: number | null) => (n != null && Number.isInteger(n) && n > 0 && n <= 20_000 ? n : null);

export type CreateDocumentResult = { ok: true; id: string } | { ok: false; reason: "vehicle" | "images" };

/** 올라간 이미지로 서류를 만든다. 경로가 이 가족·차량 것이 아니거나 장수가 맞지 않으면 거부 */
export async function createDocument(db: Db, orgId: string, userId: string, input: { vehicleId: string; kind: DocumentKind; images: NewImage[] }): Promise<CreateDocumentResult> {
  if (input.images.length === 0 || input.images.length > MAX_IMAGES_PER_DOCUMENT) return { ok: false, reason: "images" };
  if (new Set(input.images.map((i) => i.pathname)).size !== input.images.length) return { ok: false, reason: "images" };
  if (!input.images.every((i) => isOwnDocumentPath(i.pathname, orgId, input.vehicleId))) return { ok: false, reason: "images" };
  if (!(await vehicleInOrg(db, orgId, input.vehicleId))) return { ok: false, reason: "vehicle" };

  // 같은 경로가 이미 다른 서류에 쓰였다면(재사용·남의 파일 가로채기) 거부
  const used = await db.select({ key: images.storageKey }).from(images).where(inArray(images.storageKey, input.images.map((i) => i.pathname)));
  if (used.length > 0) return { ok: false, reason: "images" };

  const [doc] = await db.insert(documents).values({ orgId, vehicleId: input.vehicleId, kind: input.kind, createdBy: userId }).returning({ id: documents.id });
  try {
    await db.insert(images).values(
      input.images.map((i, n) => ({ documentId: doc.id, url: `private:${i.pathname}`, storageKey: i.pathname, sortOrder: n, width: dim(i.width), height: dim(i.height) })),
    );
  } catch (error) {
    await db.delete(documents).where(eq(documents.id, doc.id));
    throw error;
  }
  return { ok: true, id: doc.id };
}

export async function getDocument(db: Db, orgId: string, id: string): Promise<(DocumentRow & { images: DocumentImageRow[] }) | null> {
  const [d] = await db.select(docCols).from(documents).where(and(eq(documents.id, id), eq(documents.orgId, orgId))).limit(1);
  if (!d) return null;
  const imgs = await db
    .select({ id: images.id, storageKey: images.storageKey, sortOrder: images.sortOrder, width: images.width, height: images.height })
    .from(images)
    .where(eq(images.documentId, id))
    .orderBy(asc(images.sortOrder));
  return { ...d, images: imgs };
}

/** 차량의 서류 목록(이미지 수 포함) */
export async function listDocuments(db: Db, orgId: string, vehicleId: string, limit = 50) {
  const list = await db.select(docCols).from(documents).where(and(eq(documents.orgId, orgId), eq(documents.vehicleId, vehicleId))).orderBy(desc(documents.createdAt)).limit(limit);
  if (list.length === 0) return [];
  const imgs = await db
    .select({ id: images.id, documentId: images.documentId, sortOrder: images.sortOrder })
    .from(images)
    .where(inArray(images.documentId, list.map((d) => d.id)))
    .orderBy(asc(images.sortOrder));
  const linked = await db.select({ id: repairQuotes.documentId }).from(repairQuotes).where(and(eq(repairQuotes.orgId, orgId), inArray(repairQuotes.documentId, list.map((d) => d.id))));
  const quoteLinked = new Set(linked.map((l) => l.id));
  return list.map((d) => {
    const mine = imgs.filter((i) => i.documentId === d.id);
    return { ...d, imageCount: mine.length, firstImageId: mine[0]?.id ?? null, quoteLinked: quoteLinked.has(d.id) };
  });
}

/** 열람 권한 확인용: 이 이미지가 이 가족 것이면 Blob 경로를 돌려준다 */
export async function getImageKey(db: Db, orgId: string, imageId: string): Promise<string | null> {
  const [row] = await db
    .select({ key: images.storageKey })
    .from(images)
    .innerJoin(documents, eq(documents.id, images.documentId))
    .where(and(eq(images.id, imageId), eq(documents.orgId, orgId)))
    .limit(1);
  return row?.key ?? null;
}

export async function saveOcr(db: Db, orgId: string, id: string, json: unknown): Promise<boolean> {
  const r = await db.update(documents).set({ ocrJson: json, updatedAt: new Date() }).where(and(eq(documents.id, id), eq(documents.orgId, orgId))).returning({ id: documents.id });
  return r.length > 0;
}

/** 서류를 정비 기록에 연결(같은 차량의 기록만) */
export async function linkToService(db: Db, orgId: string, documentId: string, serviceRecordId: string): Promise<boolean> {
  const doc = await getDocument(db, orgId, documentId);
  if (!doc) return false;
  const [svc] = await db.select({ id: serviceRecords.id }).from(serviceRecords).where(and(eq(serviceRecords.id, serviceRecordId), eq(serviceRecords.orgId, orgId), eq(serviceRecords.vehicleId, doc.vehicleId))).limit(1);
  if (!svc) return false;
  await db.update(documents).set({ serviceRecordId, updatedAt: new Date() }).where(eq(documents.id, documentId));
  return true;
}

/** 서류 삭제. Blob 에서 지울 경로들을 돌려준다 */
export async function deleteDocument(db: Db, orgId: string, id: string): Promise<string[] | null> {
  const doc = await getDocument(db, orgId, id);
  if (!doc) return null;
  await db.delete(documents).where(eq(documents.id, id)); // 이미지 행은 cascade
  return doc.images.map((i) => i.storageKey);
}

/** 정비 기록별로 붙은 서류(첨부 표시용) */
export async function documentsByService(db: Db, orgId: string, vehicleId: string): Promise<Map<string, { id: string; imageCount: number }[]>> {
  const list = await listDocuments(db, orgId, vehicleId, 200);
  const out = new Map<string, { id: string; imageCount: number }[]>();
  for (const d of list) {
    if (!d.serviceRecordId) continue;
    out.set(d.serviceRecordId, [...(out.get(d.serviceRecordId) ?? []), { id: d.id, imageCount: d.imageCount }]);
  }
  return out;
}
