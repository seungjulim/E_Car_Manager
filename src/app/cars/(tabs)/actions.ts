"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import {
  addEnergy,
  addMileage,
  addPolicy,
  addService,
  createVehicle,
  deleteEnergy,
  deleteMileage,
  deletePolicy,
  deleteService,
  deleteVehicle,
  getVehicle,
  updateVehicle,
} from "@/lib/cars";
import { parseEntries } from "@/lib/inspection";
import { getQuoteBrief, linkServiceToQuote } from "@/lib/repairs";
import { addInspection, deleteInspection } from "@/lib/inspections";
import {
  dateField,
  decimalField,
  firstIssue,
  formString,
  intField,
  requiredText,
  textField,
} from "@/lib/form-parse";
import { POWERTRAINS } from "@/lib/powertrain";

export type FormState = { error?: string };

const NEED_LOGIN: FormState = { error: "로그인과 가족 선택이 필요해요." };
const FAILED: FormState = { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
const uuid = z.uuid();

async function ctx() {
  const { userId, orgId } = await auth();
  return userId && orgId ? { userId, orgId } : null;
}

/** 차량 관련 화면은 모두 /cars 아래에 있어 한 번에 새로 고친다 */
const refresh = () => revalidatePath("/cars", "layout");

const KM_MAX = 2_000_000;
const MONEY_MAX = 2_000_000_000;

/* ------------------------------------------------------------------ */
/* 차량 등록·수정·삭제                                                   */
/* ------------------------------------------------------------------ */

const vehicleSchema = z.object({
  plateNo: requiredText("차량번호", 20).refine((v) => /^[0-9A-Za-z가-힣\s-]+$/.test(v), "차량번호에는 숫자·한글·영문만 쓸 수 있어요."),
  nickname: textField("별명", 30),
  brand: textField("브랜드", 40),
  model: textField("모델", 60),
  trim: textField("트림", 60),
  powertrain: z.enum(POWERTRAINS),
  iceFuel: z.enum(["", "gasoline", "diesel", "lpg"]),
  purchaseYear: intField("구입년도", 1990, 2100),
  purchasedAt: dateField("구입일", { notFuture: true }),
  vin: z
    .string()
    .trim()
    .max(30, "차대번호는 30자까지 쓸 수 있어요.")
    .refine((v) => v === "" || /^[0-9A-Za-z-]+$/.test(v), "차대번호에는 영문·숫자만 쓸 수 있어요.")
    .transform((v) => (v === "" ? null : v.toUpperCase())),
  color: textField("색상", 20),
  currentMileageKm: intField("현재 주행거리", 0, KM_MAX),
  ownerUserId: textField("주 사용자", 64),
  notes: textField("메모", 1000),
});

export async function saveVehicleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;

  const raw = Object.fromEntries(
    ["plateNo", "nickname", "brand", "model", "trim", "powertrain", "iceFuel", "purchaseYear", "purchasedAt", "vin", "color", "currentMileageKm", "ownerUserId", "notes"].map((k) => [k, formString(formData, k)]),
  );
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  const input = {
    plateNo: d.plateNo,
    nickname: d.nickname,
    brand: d.brand,
    model: d.model,
    trim: d.trim,
    powertrain: d.powertrain,
    iceFuel: d.powertrain === "ice" ? d.iceFuel || "gasoline" : null,
    purchaseYear: d.purchaseYear,
    purchasedAt: d.purchasedAt,
    vin: d.vin,
    color: d.color,
    currentMileageKm: d.currentMileageKm ?? 0,
    ownerUserId: d.ownerUserId,
    notes: d.notes,
  } as const;

  const idRaw = formString(formData, "id");
  let id: string;
  try {
    const result = idRaw
      ? await (async () => {
          if (!uuid.safeParse(idRaw).success) return { ok: false, reason: "notfound" } as const;
          return updateVehicle(getDb(), c.orgId, idRaw, input);
        })()
      : await createVehicle(getDb(), c.orgId, c.userId, input);
    if (!result.ok) {
      return { error: result.reason === "duplicate" ? "이미 같은 차량번호의 차가 등록돼 있어요." : "차량을 찾을 수 없어요." };
    }
    id = result.id;
  } catch (error) {
    console.error("[saveVehicle] 실패:", error);
    return FAILED;
  }

  refresh();
  redirect(`/cars/vehicles/${id}`);
}

export async function deleteVehicleAction(formData: FormData): Promise<void> {
  const c = await ctx();
  if (!c) return;
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return;
  try {
    await deleteVehicle(getDb(), c.orgId, id.data);
  } catch (error) {
    console.error("[deleteVehicle] 실패:", error);
    return;
  }
  refresh();
  redirect("/cars/vehicles");
}

/* ------------------------------------------------------------------ */
/* 정비 기록                                                            */
/* ------------------------------------------------------------------ */

const serviceSchema = z.object({
  vehicleId: uuid,
  servicedOn: dateField("정비일", { notFuture: true }).refine((v) => v !== null, "정비일을 입력해 주세요."),
  mileageKm: intField("주행거리", 0, KM_MAX),
  itemCode: textField("정비 항목", 40),
  category: textField("정비 분류", 40),
  shopName: textField("정비소", 60),
  description: textField("메모", 1000),
  cost: intField("비용", 0, MONEY_MAX),
  nextDueOn: dateField("다음 예정일"),
  nextDueKm: intField("다음 예정 주행거리", 0, KM_MAX),
  repairQuoteId: z.string().trim(),
});

export async function addServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;
  const parsed = serviceSchema.safeParse(
    Object.fromEntries(["vehicleId", "servicedOn", "mileageKm", "itemCode", "category", "shopName", "description", "cost", "nextDueOn", "nextDueKm", "repairQuoteId"].map((k) => [k, formString(formData, k)])),
  );
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { repairQuoteId, ...d } = parsed.data;
  if (!d.itemCode && !d.category) return { error: "정비 항목을 고르거나 어떤 정비인지 적어 주세요." };
  if (repairQuoteId && !uuid.safeParse(repairQuoteId).success) return { error: "견적 정보가 올바르지 않아요." };

  try {
    if (repairQuoteId) {
      // 먼저 견적이 이 가족·이 차량 것인지 확인한다(아니면 정비 기록도 만들지 않는다)
      const quote = await getQuoteBrief(getDb(), c.orgId, repairQuoteId);
      if (!quote || quote.vehicleId !== d.vehicleId) return { error: "비교할 견적을 찾을 수 없어요." };
    }
    const r = await addService(getDb(), c.orgId, c.userId, { ...d, servicedOn: d.servicedOn as string });
    if (!r.ok) return { error: "차량을 찾을 수 없어요." };
    if (repairQuoteId) await linkServiceToQuote(getDb(), c.orgId, r.id, repairQuoteId);
  } catch (error) {
    console.error("[addService] 실패:", error);
    return FAILED;
  }
  refresh();
  redirect(`/cars/vehicles/${d.vehicleId}?tab=service`);
}

/* ------------------------------------------------------------------ */
/* 보험                                                                 */
/* ------------------------------------------------------------------ */

const policySchema = z.object({
  vehicleId: uuid,
  insurer: requiredText("보험사", 40),
  policyNo: textField("증권번호", 40),
  coverageType: textField("보장 종류", 40),
  startOn: dateField("보험 시작일"),
  endOn: dateField("보험 만기일").refine((v) => v !== null, "보험 만기일을 입력해 주세요."),
  premium: intField("보험료", 0, MONEY_MAX),
  contact: textField("연락처", 40),
  notes: textField("메모", 1000),
});

export async function addPolicyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;
  const parsed = policySchema.safeParse(
    Object.fromEntries(["vehicleId", "insurer", "policyNo", "coverageType", "startOn", "endOn", "premium", "contact", "notes"].map((k) => [k, formString(formData, k)])),
  );
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.startOn && d.endOn && d.endOn < d.startOn) return { error: "만기일은 시작일보다 늦어야 해요." };

  try {
    const ok = await addPolicy(getDb(), c.orgId, c.userId, { ...d, endOn: d.endOn as string });
    if (!ok) return { error: "차량을 찾을 수 없어요." };
  } catch (error) {
    console.error("[addPolicy] 실패:", error);
    return FAILED;
  }
  refresh();
  redirect(`/cars/vehicles/${d.vehicleId}?tab=insurance`);
}

/* ------------------------------------------------------------------ */
/* 주행거리                                                             */
/* ------------------------------------------------------------------ */

const mileageSchema = z.object({
  vehicleId: uuid,
  recordedOn: dateField("기록일", { notFuture: true }).refine((v) => v !== null, "기록일을 입력해 주세요."),
  mileageKm: intField("주행거리", 0, KM_MAX).refine((v) => v !== null && v > 0, "주행거리를 입력해 주세요."),
  note: textField("메모", 200),
});

export async function addMileageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;
  const parsed = mileageSchema.safeParse(Object.fromEntries(["vehicleId", "recordedOn", "mileageKm", "note"].map((k) => [k, formString(formData, k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  try {
    const ok = await addMileage(getDb(), c.orgId, c.userId, { vehicleId: d.vehicleId, recordedOn: d.recordedOn as string, mileageKm: d.mileageKm as number, note: d.note });
    if (!ok) return { error: "차량을 찾을 수 없어요." };
  } catch (error) {
    console.error("[addMileage] 실패:", error);
    return FAILED;
  }
  refresh();
  redirect(`/cars/vehicles/${d.vehicleId}?tab=mileage`);
}

/* ------------------------------------------------------------------ */
/* 충전·주유                                                            */
/* ------------------------------------------------------------------ */

const energySchema = z.object({
  vehicleId: uuid,
  kind: z.enum(["charging", "fueling"]),
  on: dateField("날짜", { notFuture: true }).refine((v) => v !== null, "날짜를 입력해 주세요."),
  amount: decimalField("충전량·주유량", 0, 10_000),
  cost: intField("금액", 0, MONEY_MAX),
  place: textField("장소", 60),
  odometerKm: intField("주행거리", 0, KM_MAX),
  detail: textField("충전 방식·연료 등급", 30),
});

export async function addEnergyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;
  const parsed = energySchema.safeParse(
    Object.fromEntries(["vehicleId", "kind", "on", "amount", "cost", "place", "odometerKm", "detail"].map((k) => [k, formString(formData, k)])),
  );
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  try {
    const ok = await addEnergy(getDb(), c.orgId, c.userId, { ...d, on: d.on as string });
    if (!ok) return { error: "차량을 찾을 수 없어요." };
  } catch (error) {
    console.error("[addEnergy] 실패:", error);
    return FAILED;
  }
  refresh();
  redirect(`/cars/vehicles/${d.vehicleId}?tab=energy`);
}

/* ------------------------------------------------------------------ */
/* 점검 체크리스트                                                       */
/* ------------------------------------------------------------------ */

const inspectionSchema = z.object({
  vehicleId: uuid,
  mode: z.enum(["self", "shop"]),
  inspectedOn: dateField("점검일", { notFuture: true }).refine((v) => v !== null, "점검일을 입력해 주세요."),
  mileageKm: intField("주행거리", 0, KM_MAX),
  place: textField("점검 장소", 60),
  memo: textField("메모", 1000),
});

export async function addInspectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const c = await ctx();
  if (!c) return NEED_LOGIN;
  const parsed = inspectionSchema.safeParse(Object.fromEntries(["vehicleId", "mode", "inspectedOn", "mileageKm", "place", "memo"].map((k) => [k, formString(formData, k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;

  let recordId: string;
  try {
    const vehicle = await getVehicle(getDb(), c.orgId, d.vehicleId);
    if (!vehicle) return { error: "차량을 찾을 수 없어요." };
    const entries = parseEntries(vehicle.powertrain, (name) => formString(formData, name));
    if (!entries.ok) return { error: entries.error };
    const r = await addInspection(getDb(), c.orgId, c.userId, {
      vehicleId: d.vehicleId,
      inspectedOn: d.inspectedOn as string,
      mileageKm: d.mileageKm,
      place: d.place ?? (d.mode === "self" ? "셀프 점검" : null),
      isSelfCheck: d.mode === "self",
      memo: d.memo,
      entries: entries.entries,
    });
    if (!r.ok) return { error: "차량을 찾을 수 없어요." };
    recordId = r.id;
  } catch (error) {
    console.error("[addInspection] 실패:", error);
    return FAILED;
  }
  refresh();
  redirect(`/cars/vehicles/${d.vehicleId}/inspections/${recordId}`);
}

/* ------------------------------------------------------------------ */
/* 기록 삭제(폼 버튼용)                                                   */
/* ------------------------------------------------------------------ */

const deleteSchema = z.object({
  id: uuid,
  vehicleId: uuid,
  type: z.enum(["service", "policy", "mileage", "charging", "fueling", "inspection"]),
});

export async function deleteRecordAction(formData: FormData): Promise<void> {
  const c = await ctx();
  if (!c) return;
  const parsed = deleteSchema.safeParse({ id: formData.get("id"), vehicleId: formData.get("vehicleId"), type: formData.get("type") });
  if (!parsed.success) return;
  const { id, type } = parsed.data;

  try {
    const db = getDb();
    if (type === "service") await deleteService(db, c.orgId, id);
    else if (type === "policy") await deletePolicy(db, c.orgId, id);
    else if (type === "mileage") await deleteMileage(db, c.orgId, id);
    else if (type === "inspection") await deleteInspection(db, c.orgId, id);
    else await deleteEnergy(db, c.orgId, type, id);
  } catch (error) {
    console.error("[deleteRecord] 실패:", error);
    return;
  }
  refresh();
}
