"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { findPreset, presetsFor, suggestNext } from "@/lib/car-care";
import { addService, getVehicle } from "@/lib/cars";
import { deleteBlobs, loadStatementImage } from "@/lib/document-blob";
import { DOCUMENT_KINDS, MAX_AI_IMAGES, MAX_IMAGES_PER_DOCUMENT } from "@/lib/document-constants";
import { removeDocuments } from "@/lib/document-cleanup";
import { createDocument, deleteDocument, getDocument, linkToService, saveOcr } from "@/lib/documents";
import { attachQuoteDocument, getQuoteBrief, linkServiceToQuote } from "@/lib/repairs";
import { dateField, firstIssue, formString, intField, textField } from "@/lib/form-parse";
import { extractStatement, type StatementDraft, type StatementImage } from "@/lib/statement-extract";

export type StatementFormState = { error?: string };
export type DocResult = { ok: true; id: string } | { ok: false; error: string };
export type ExtractActionResult = { ok: true; draft: StatementDraft } | { ok: false; error: string };

const NEED_LOGIN = "로그인과 가족 선택이 필요해요.";
const FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
const uuid = z.uuid();
const refresh = () => revalidatePath("/cars", "layout");

async function ctx() {
  const { userId, orgId } = await auth();
  return userId && orgId ? { userId, orgId } : null;
}

/* ------------------------------------------------------------------ */
/* 서류 만들기(사진 업로드가 끝난 뒤 브라우저가 호출)                         */
/* ------------------------------------------------------------------ */

const createSchema = z.object({
  vehicleId: uuid,
  kind: z.enum(DOCUMENT_KINDS),
  images: z
    .array(z.object({ pathname: z.string().min(1).max(300), width: z.number().int().nullable(), height: z.number().int().nullable() }))
    .min(1)
    .max(MAX_IMAGES_PER_DOCUMENT),
  /** 견적서 사진을 이 견적에 연결(서류 종류가 '견적서'일 때만) */
  quoteId: uuid.optional(),
});

export async function createDocumentAction(input: z.input<typeof createSchema>): Promise<DocResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: NEED_LOGIN };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `사진은 1~${MAX_IMAGES_PER_DOCUMENT}장까지 올릴 수 있어요.` };
  const { quoteId, ...docInput } = parsed.data;
  if (quoteId && docInput.kind !== "quote") return { ok: false, error: "견적에는 견적서 사진만 연결할 수 있어요." };
  try {
    const db = getDb();
    const r = await createDocument(db, c.orgId, c.userId, docInput);
    if (!r.ok) return { ok: false, error: r.reason === "vehicle" ? "차량을 찾을 수 없어요." : "올라간 사진 정보가 올바르지 않아요. 다시 시도해 주세요." };
    if (quoteId) {
      const link = await attachQuoteDocument(db, c.orgId, quoteId, r.id);
      if (!link.ok) {
        await removeDocuments(db, c.orgId, [r.id]); // 연결할 수 없는 견적이면 방금 올린 서류를 남기지 않는다
        return { ok: false, error: "연결할 견적을 찾을 수 없어요." };
      }
      if (link.replaced) await removeDocuments(db, c.orgId, [link.replaced]); // 새 견적서로 바꾼 경우 이전 견적서는 정리
    }
    refresh();
    return { ok: true, id: r.id };
  } catch (error) {
    console.error("[createDocument] 실패:", error);
    return { ok: false, error: FAILED };
  }
}

/* ------------------------------------------------------------------ */
/* Claude 로 내용 읽기                                                    */
/* ------------------------------------------------------------------ */

export async function extractDocumentAction(documentId: string): Promise<ExtractActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: NEED_LOGIN };
  if (!uuid.safeParse(documentId).success) return { ok: false, error: "서류를 찾을 수 없어요." };

  try {
    const db = getDb();
    const doc = await getDocument(db, c.orgId, documentId);
    if (!doc) return { ok: false, error: "서류를 찾을 수 없어요." };
    const vehicle = await getVehicle(db, c.orgId, doc.vehicleId);
    if (!vehicle) return { ok: false, error: "차량을 찾을 수 없어요." };

    const loaded: StatementImage[] = [];
    for (const img of doc.images.slice(0, MAX_AI_IMAGES)) {
      const data = await loadStatementImage(img.storageKey);
      if (data) loaded.push(data);
    }
    if (loaded.length === 0) return { ok: false, error: "사진을 불러오지 못했어요. 잠시 후 다시 시도하거나 직접 입력해 주세요." };

    const result = await extractStatement(loaded, { presets: presetsFor(vehicle.powertrain).map((p) => ({ itemCode: p.itemCode, name: p.name })) });
    if (!result.ok) return result;
    await saveOcr(db, c.orgId, documentId, result.draft); // 사용자가 다시 열었을 때 재사용(확인 전 초안)
    return { ok: true, draft: result.draft };
  } catch (error) {
    console.error("[extractDocument] 실패:", error);
    return { ok: false, error: "내용을 읽지 못했어요. 직접 입력해 주세요." };
  }
}

/* ------------------------------------------------------------------ */
/* 확인한 내용으로 정비 기록 저장 + 서류 연결                                  */
/* ------------------------------------------------------------------ */

const KM_MAX = 2_000_000;
const saveSchema = z.object({
  documentId: uuid,
  servicedOn: dateField("정비일", { notFuture: true }).refine((v) => v !== null, "정비일을 입력해 주세요."),
  mileageKm: intField("주행거리", 0, KM_MAX),
  itemCode: textField("정비 항목", 40),
  category: textField("정비 내용", 40),
  shopName: textField("정비소", 60),
  description: textField("메모", 1000),
  cost: intField("실제 지불 금액", 0, 2_000_000_000),
  repairQuoteId: z.string().trim(),
});

export async function saveStatementAction(_prev: StatementFormState, formData: FormData): Promise<StatementFormState> {
  const c = await ctx();
  if (!c) return { error: NEED_LOGIN };
  const parsed = saveSchema.safeParse(Object.fromEntries(["documentId", "servicedOn", "mileageKm", "itemCode", "category", "shopName", "description", "cost", "repairQuoteId"].map((k) => [k, formString(formData, k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.repairQuoteId && !uuid.safeParse(d.repairQuoteId).success) return { error: "견적 정보가 올바르지 않아요." };
  if (!d.itemCode && !d.category) return { error: "정비 항목을 고르거나 어떤 정비인지 적어 주세요." };
  if (d.itemCode && !findPreset(d.itemCode)) return { error: "정비 항목이 올바르지 않아요." };

  let vehicleId: string;
  try {
    const db = getDb();
    const doc = await getDocument(db, c.orgId, d.documentId);
    if (!doc) return { error: "서류를 찾을 수 없어요." };
    if (doc.serviceRecordId) return { error: "이미 정비 기록에 연결된 서류예요." };
    vehicleId = doc.vehicleId;
    if (d.repairQuoteId) {
      const quote = await getQuoteBrief(db, c.orgId, d.repairQuoteId);
      if (!quote || quote.vehicleId !== vehicleId) return { error: "비교할 견적을 찾을 수 없어요." };
    }

    const preset = findPreset(d.itemCode);
    const next = suggestNext({ km: preset?.defaultIntervalKm, months: preset?.defaultIntervalMonths }, d.servicedOn as string, d.mileageKm);
    const r = await addService(db, c.orgId, c.userId, {
      vehicleId,
      servicedOn: d.servicedOn as string,
      mileageKm: d.mileageKm,
      itemCode: d.itemCode,
      category: d.category,
      shopName: d.shopName,
      description: d.description,
      cost: d.cost,
      nextDueOn: next.nextDueOn,
      nextDueKm: next.nextDueKm,
    });
    if (!r.ok) return { error: "차량을 찾을 수 없어요." };
    await linkToService(db, c.orgId, d.documentId, r.id);
    if (d.repairQuoteId) await linkServiceToQuote(db, c.orgId, r.id, d.repairQuoteId);
  } catch (error) {
    console.error("[saveStatement] 실패:", error);
    return { error: FAILED };
  }
  refresh();
  redirect(`/cars/vehicles/${vehicleId}?tab=service`);
}

/* ------------------------------------------------------------------ */
/* 서류 삭제                                                            */
/* ------------------------------------------------------------------ */

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const c = await ctx();
  if (!c) return;
  const p = z.object({ id: uuid, vehicleId: uuid }).safeParse({ id: formData.get("id"), vehicleId: formData.get("vehicleId") });
  if (!p.success) return;
  let back = `/cars/vehicles/${p.data.vehicleId}?tab=service`;
  try {
    const doc = await getDocument(getDb(), c.orgId, p.data.id);
    if (doc?.kind === "quote") back = `/cars/vehicles/${p.data.vehicleId}?tab=quotes`; // 견적서는 견적 탭으로 돌아간다
    const keys = await deleteDocument(getDb(), c.orgId, p.data.id);
    if (keys) await deleteBlobs(keys);
  } catch (error) {
    console.error("[deleteDocument] 실패:", error);
    return;
  }
  refresh();
  redirect(back);
}
