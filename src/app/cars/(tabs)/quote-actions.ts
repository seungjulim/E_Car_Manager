"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { findPreset } from "@/lib/car-care";
import { dateField, decimalField, firstIssue, formString, intField, textField } from "@/lib/form-parse";
import { MAX_RADIUS_KM, type ShopType } from "@/lib/quotes";
import { loadStatementImage } from "@/lib/document-blob";
import { removeDocuments } from "@/lib/document-cleanup";
import { getDocument, saveOcr } from "@/lib/documents";
import { extractQuote, type QuoteDraft } from "@/lib/quote-extract";
import { MAX_AI_IMAGES } from "@/lib/document-constants";
import { addQuote, attachQuoteDocument, chooseQuote, createRequest, deleteQuote, deleteRequest, getRequest, listShops, matchShopByName, quoteDocumentIds, quoteForDocument, updateQuoteDetails } from "@/lib/repairs";

export type QuoteFormState = { error?: string };

const NEED_LOGIN: QuoteFormState = { error: "로그인과 가족 선택이 필요해요." };
const FAILED: QuoteFormState = { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
const uuid = z.uuid();
const SHOP_TYPES = ["official", "general", "specialist"] as const;

async function ctx() {
  const { userId, orgId } = await auth();
  return userId && orgId ? { userId, orgId } : null;
}
const refresh = () => revalidatePath("/cars", "layout");

/* ------------------------------------------------------------------ */
/* 견적 요청                                                            */
/* ------------------------------------------------------------------ */

const requestSchema = z.object({
  vehicleId: uuid,
  itemCode: textField("수리 항목", 40),
  description: textField("증상·수리 내용", 500),
  partPref: z.enum(["any", "genuine", "oem"]),
  originLat: decimalField("위도", -90, 90),
  originLng: decimalField("경도", -180, 180),
  radiusKm: intField("반경", 1, MAX_RADIUS_KM),
});

export async function createRequestAction(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;
  const parsed = requestSchema.safeParse(Object.fromEntries(["vehicleId", "itemCode", "description", "partPref", "originLat", "originLng", "radiusKm"].map((k) => [k, formString(formData, k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (!d.itemCode && !d.description) return { error: "수리 항목을 고르거나 어떤 수리인지 적어 주세요." };
  if (d.itemCode && !findPreset(d.itemCode)) return { error: "수리 항목이 올바르지 않아요." };
  if ((d.originLat == null) !== (d.originLng == null)) return { error: "위치는 위도와 경도를 함께 입력해 주세요." };
  const types = formData.getAll("shopTypes").filter((v): v is ShopType => typeof v === "string" && (SHOP_TYPES as readonly string[]).includes(v));

  let id: string;
  try {
    const r = await createRequest(getDb(), c.orgId, c.userId, {
      vehicleId: d.vehicleId,
      itemCode: d.itemCode,
      description: d.description,
      partPref: d.partPref,
      origin: d.originLat != null && d.originLng != null ? { lat: d.originLat, lng: d.originLng } : null,
      radiusKm: d.radiusKm ?? MAX_RADIUS_KM,
      shopTypes: [...new Set(types)],
    });
    if (!r.ok) return { error: "차량을 찾을 수 없어요." };
    id = r.id;
  } catch (error) {
    console.error("[createRequest] 실패:", error);
    return FAILED;
  }
  refresh();
  redirect(`/cars/vehicles/${d.vehicleId}/quotes/${id}`);
}

/* ------------------------------------------------------------------ */
/* 견적 입력                                                            */
/* ------------------------------------------------------------------ */

const MONEY_MAX = 500_000_000;

const quoteSchema = z.object({
  requestId: uuid,
  shopId: z.string().trim(), // 기존 정비소 id, 또는 "new"
  shopName: textField("정비소 이름", 60),
  shopType: z.enum(SHOP_TYPES),
  shopPhone: textField("전화번호", 30),
  shopAddress: textField("주소", 120),
  shopLat: decimalField("정비소 위도", -90, 90),
  shopLng: decimalField("정비소 경도", -180, 180),
  totalAmount: intField("총 견적 금액", 1, MONEY_MAX),
  partsAmount: intField("부품비", 0, MONEY_MAX),
  laborAmount: intField("공임", 0, MONEY_MAX),
  taxAmount: intField("부가세", 0, MONEY_MAX),
  partType: textField("부품 종류", 30),
  warrantyMonths: intField("보증 기간", 0, 120),
  validUntil: dateField("견적 유효기간"),
  source: z.enum(["phone", "document", "manual"]),
  note: textField("메모", 500),
  documentId: z.string().trim(),
});
const QUOTE_KEYS = ["requestId", "shopId", "shopName", "shopType", "shopPhone", "shopAddress", "shopLat", "shopLng", "totalAmount", "partsAmount", "laborAmount", "taxAmount", "partType", "warrantyMonths", "validUntil", "source", "note", "documentId"];

export async function addQuoteAction(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;
  const parsed = quoteSchema.safeParse(Object.fromEntries(QUOTE_KEYS.map((k) => [k, formString(formData, k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.totalAmount == null) return { error: "총 견적 금액을 입력해 주세요." };

  const isNew = d.shopId === "new";
  if (!isNew && !uuid.safeParse(d.shopId).success) return { error: "정비소를 고르거나 새로 입력해 주세요." };
  if (isNew && !d.shopName) return { error: "정비소 이름을 입력해 주세요." };
  if (isNew && (d.shopLat == null) !== (d.shopLng == null)) return { error: "정비소 위치는 위도와 경도를 함께 입력해 주세요." };
  if (d.partsAmount != null && d.laborAmount != null && d.partsAmount + d.laborAmount + (d.taxAmount ?? 0) !== d.totalAmount) {
    return { error: "부품비 + 공임 + 부가세가 총 견적 금액과 달라요. 금액을 다시 확인해 주세요." };
  }

  if (d.documentId && !uuid.safeParse(d.documentId).success) return { error: "견적서 사진 정보가 올바르지 않아요." };

  let vehicleId: string;
  let newQuoteId: string;
  try {
    const req = await getRequest(getDb(), c.orgId, d.requestId);
    if (!req) return { error: "견적 요청을 찾을 수 없어요." };
    vehicleId = req.vehicleId;
    if (d.documentId) {
      // 사진으로 입력하는 경우: 이 차량의 견적서이고 아직 어떤 견적에도 붙지 않은 서류여야 한다(아니면 견적도 만들지 않는다)
      const doc = await getDocument(getDb(), c.orgId, d.documentId);
      if (!doc || doc.kind !== "quote" || doc.vehicleId !== vehicleId || (await quoteForDocument(getDb(), c.orgId, doc.id))) {
        return { error: "첨부할 견적서 사진을 사용할 수 없어요. 사진을 다시 올려 주세요." };
      }
    }
    const r = await addQuote(getDb(), c.orgId, c.userId, {
      requestId: d.requestId,
      shopId: isNew ? null : d.shopId,
      newShop: isNew ? { name: d.shopName as string, type: d.shopType, address: d.shopAddress, phone: d.shopPhone, lat: d.shopLat, lng: d.shopLng } : null,
      totalAmount: d.totalAmount,
      partsAmount: d.partsAmount,
      laborAmount: d.laborAmount,
      taxAmount: d.taxAmount,
      partType: d.partType,
      warrantyMonths: d.warrantyMonths,
      validUntil: d.validUntil,
      source: d.source,
      note: d.note,
    });
    if (!r.ok) return { error: r.reason === "shop" ? "정비소를 찾을 수 없어요." : "견적 요청을 찾을 수 없어요." };
    newQuoteId = r.id;
    if (d.documentId) await attachQuoteDocument(getDb(), c.orgId, r.id, d.documentId);
  } catch (error) {
    console.error("[addQuote] 실패:", error);
    return FAILED;
  }
  refresh();
  // '저장 후 견적서 사진 첨부'를 고른 경우 바로 사진 올리는 화면으로
  if (!d.documentId && formData.get("attach") === "on") redirect(`/cars/vehicles/${vehicleId}/statements/new?kind=quote&quote=${newQuoteId}`);
  redirect(`/cars/vehicles/${vehicleId}/quotes/${d.requestId}`);
}

/* ------------------------------------------------------------------ */
/* 견적 선택·삭제 / 요청 삭제 (폼 버튼용)                                   */
/* ------------------------------------------------------------------ */

export async function chooseQuoteAction(formData: FormData): Promise<void> {
  const c = await ctx();
  if (!c) return;
  const p = z.object({ requestId: uuid, quoteId: uuid }).safeParse({ requestId: formData.get("requestId"), quoteId: formData.get("quoteId") });
  if (!p.success) return;
  try {
    await chooseQuote(getDb(), c.orgId, p.data.requestId, p.data.quoteId);
  } catch (error) {
    console.error("[chooseQuote] 실패:", error);
    return;
  }
  refresh();
}

export async function deleteQuoteAction(formData: FormData): Promise<void> {
  const c = await ctx();
  if (!c) return;
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return;
  try {
    const docs = await quoteDocumentIds(getDb(), c.orgId, { quoteId: id.data });
    await deleteQuote(getDb(), c.orgId, id.data);
    await removeDocuments(getDb(), c.orgId, docs); // 견적서 사진도 함께 정리
  } catch (error) {
    console.error("[deleteQuote] 실패:", error);
    return;
  }
  refresh();
}

export async function deleteRequestAction(formData: FormData): Promise<void> {
  const c = await ctx();
  if (!c) return;
  const p = z.object({ id: uuid, vehicleId: uuid }).safeParse({ id: formData.get("id"), vehicleId: formData.get("vehicleId") });
  if (!p.success) return;
  try {
    const docs = await quoteDocumentIds(getDb(), c.orgId, { requestId: p.data.id });
    await deleteRequest(getDb(), c.orgId, p.data.id);
    await removeDocuments(getDb(), c.orgId, docs);
  } catch (error) {
    console.error("[deleteRequest] 실패:", error);
    return;
  }
  refresh();
  redirect(`/cars/vehicles/${p.data.vehicleId}?tab=quotes`);
}


/* ------------------------------------------------------------------ */
/* 견적서 사진을 AI 로 읽기                                               */
/* ------------------------------------------------------------------ */

export type QuoteReadActionResult = { ok: true; draft: QuoteDraft; shopId: string | null } | { ok: false; error: string };

export async function extractQuoteDocumentAction(documentId: string): Promise<QuoteReadActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: NEED_LOGIN.error as string };
  if (!uuid.safeParse(documentId).success) return { ok: false, error: "견적서를 찾을 수 없어요." };
  try {
    const db = getDb();
    const doc = await getDocument(db, c.orgId, documentId);
    if (!doc || doc.kind !== "quote") return { ok: false, error: "견적서를 찾을 수 없어요." };
    const loaded = [];
    for (const img of doc.images.slice(0, MAX_AI_IMAGES)) {
      const data = await loadStatementImage(img.storageKey);
      if (data) loaded.push(data);
    }
    if (loaded.length === 0) return { ok: false, error: "사진을 불러오지 못했어요. 잠시 후 다시 시도하거나 직접 입력해 주세요." };
    const result = await extractQuote(loaded);
    if (!result.ok) return result;
    await saveOcr(db, c.orgId, documentId, result.draft);
    return { ok: true, draft: result.draft, shopId: matchShopByName(await listShops(db, c.orgId), result.draft.shopName) };
  } catch (error) {
    console.error("[extractQuoteDocument] 실패:", error);
    return { ok: false, error: "내용을 읽지 못했어요. 직접 입력해 주세요." };
  }
}

/* ------------------------------------------------------------------ */
/* 읽은 값을 기존 견적에 반영                                              */
/* ------------------------------------------------------------------ */

const patchSchema = z.object({
  quoteId: uuid,
  totalAmount: intField("총 견적 금액", 1, MONEY_MAX),
  partsAmount: intField("부품비", 0, MONEY_MAX),
  laborAmount: intField("공임", 0, MONEY_MAX),
  taxAmount: intField("부가세", 0, MONEY_MAX),
  partType: textField("부품 종류", 30),
  warrantyMonths: intField("보증 기간", 0, 120),
  validUntil: dateField("견적 유효기간"),
});

export async function updateQuoteAction(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;
  const parsed = patchSchema.safeParse(Object.fromEntries(["quoteId", "totalAmount", "partsAmount", "laborAmount", "taxAmount", "partType", "warrantyMonths", "validUntil"].map((k) => [k, formString(formData, k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.totalAmount == null) return { error: "총 견적 금액을 입력해 주세요." };
  if (d.partsAmount != null && d.laborAmount != null && d.partsAmount + d.laborAmount + (d.taxAmount ?? 0) !== d.totalAmount) {
    return { error: "부품비 + 공임 + 부가세가 총 견적 금액과 달라요. 금액을 다시 확인해 주세요." };
  }
  let target: { requestId: string; vehicleId: string } | null;
  try {
    const { quoteId, ...patch } = d;
    target = await updateQuoteDetails(getDb(), c.orgId, quoteId, { ...patch, totalAmount: d.totalAmount });
  } catch (error) {
    console.error("[updateQuote] 실패:", error);
    return FAILED;
  }
  if (!target) return { error: "견적을 찾을 수 없어요." };
  refresh();
  redirect(`/cars/vehicles/${target.vehicleId}/quotes/${target.requestId}`);
}
