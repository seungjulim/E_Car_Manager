import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import {
  addDays,
  averageDailyKm,
  findPreset,
  summarizeCosts,
  buildUpcoming,
  todayKst,
  type CostRow,
  type CostSummary,
  type DateRange,
  type KmPoint,
  type UpcomingItem,
} from "@/lib/car-care";
import type { Powertrain } from "@/lib/powertrain";

const {
  vehicles,
  mileageLogs,
  serviceRecords,
  insurancePolicies,
  chargingLogs,
  fuelingLogs,
  vehicleMaintenanceSchedules: schedules,
  repairQuotes,
  repairRequests,
} = schema;

/** 차량번호 비교용: 공백 제거, 영문 대문자 */
export function normalizePlate(plate: string): string {
  return plate.replace(/\s+/g, "").toUpperCase();
}

const alive = (orgId: string) => and(eq(vehicles.orgId, orgId), isNull(vehicles.deletedAt));

/* ------------------------------------------------------------------ */
/* 차량                                                                */
/* ------------------------------------------------------------------ */

export type VehicleRow = {
  id: string;
  plateNo: string;
  nickname: string | null;
  brand: string | null;
  model: string | null;
  trim: string | null;
  powertrain: Powertrain;
  iceFuel: "gasoline" | "diesel" | "lpg" | null;
  purchaseYear: number | null;
  purchasedAt: string | null;
  vin: string | null;
  color: string | null;
  currentMileageKm: number;
  ownerUserId: string | null;
  notes: string | null;
};

const vehicleColumns = {
  id: vehicles.id,
  plateNo: vehicles.plateNo,
  nickname: vehicles.nickname,
  brand: vehicles.brand,
  model: vehicles.model,
  trim: vehicles.trim,
  powertrain: vehicles.powertrain,
  iceFuel: vehicles.iceFuel,
  purchaseYear: vehicles.purchaseYear,
  purchasedAt: vehicles.purchasedAt,
  vin: vehicles.vin,
  color: vehicles.color,
  currentMileageKm: vehicles.currentMileageKm,
  ownerUserId: vehicles.ownerUserId,
  notes: vehicles.notes,
};

export const vehicleLabel = (v: Pick<VehicleRow, "nickname" | "brand" | "model" | "plateNo">) =>
  v.nickname || [v.brand, v.model].filter(Boolean).join(" ") || v.plateNo;

export async function listVehicles(db: Db, orgId: string): Promise<VehicleRow[]> {
  return db.select(vehicleColumns).from(vehicles).where(alive(orgId)).orderBy(asc(vehicles.createdAt));
}

export async function getVehicle(db: Db, orgId: string, id: string): Promise<VehicleRow | null> {
  const [row] = await db
    .select(vehicleColumns)
    .from(vehicles)
    .where(and(alive(orgId), eq(vehicles.id, id)))
    .limit(1);
  return row ?? null;
}

export type VehicleInput = Omit<VehicleRow, "id">;
export type SaveVehicleResult = { ok: true; id: string } | { ok: false; reason: "duplicate" | "notfound" };

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  return err?.code === "23505" || err?.cause?.code === "23505" || /duplicate key|unique constraint/i.test(err?.message ?? "");
};

export async function createVehicle(db: Db, orgId: string, userId: string, input: VehicleInput): Promise<SaveVehicleResult> {
  const plate = normalizePlate(input.plateNo);
  const dup = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(alive(orgId), eq(vehicles.plateNo, plate)))
    .limit(1);
  if (dup.length > 0) return { ok: false, reason: "duplicate" };
  try {
    const [row] = await db
      .insert(vehicles)
      .values({ ...input, plateNo: plate, orgId, createdBy: userId })
      .returning({ id: vehicles.id });
    // 등록할 때 알려 준 주행거리를 첫 기록으로 남겨, 평균 주행거리 계산과 기록 삭제 뒤 재계산에 쓴다
    if (input.currentMileageKm > 0) {
      await db.insert(mileageLogs).values({
        orgId, vehicleId: row.id, recordedOn: todayKst(), mileageKm: input.currentMileageKm, note: "차량 등록", createdBy: userId,
      });
    }
    return { ok: true, id: row.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "duplicate" };
    throw e;
  }
}

export async function updateVehicle(db: Db, orgId: string, id: string, input: VehicleInput): Promise<SaveVehicleResult> {
  const plate = normalizePlate(input.plateNo);
  try {
    // 이 가족의 차량인지 먼저 확인한 뒤(없으면 notfound), 번호 중복을 검사한다
    const [before] = await db
      .select({ km: vehicles.currentMileageKm })
      .from(vehicles)
      .where(and(alive(orgId), eq(vehicles.id, id)))
      .limit(1);
    if (!before) return { ok: false, reason: "notfound" };

    const dup = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(alive(orgId), eq(vehicles.plateNo, plate)))
      .limit(1);
    if (dup[0] && dup[0].id !== id) return { ok: false, reason: "duplicate" };

    await db
      .update(vehicles)
      .set({ ...input, plateNo: plate, updatedAt: new Date() })
      .where(and(alive(orgId), eq(vehicles.id, id)));
    // 수정 화면에서 주행거리를 바꿨다면 그 값도 기록으로 남긴다
    if (input.currentMileageKm > 0 && input.currentMileageKm !== before.km) {
      await db.insert(mileageLogs).values({
        orgId, vehicleId: id, recordedOn: todayKst(), mileageKm: input.currentMileageKm, note: "차량 정보 수정",
      });
    }
    return { ok: true, id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "duplicate" };
    throw e;
  }
}

/** 삭제는 숨김 처리(soft delete)라 기록은 남는다. 같은 번호로 다시 등록할 수 있다 */
export async function deleteVehicle(db: Db, orgId: string, id: string): Promise<boolean> {
  const done = await db
    .update(vehicles)
    .set({ deletedAt: new Date() })
    .where(and(alive(orgId), eq(vehicles.id, id)))
    .returning({ id: vehicles.id });
  return done.length > 0;
}

/** 차량이 이 가족 것인지(삭제되지 않았는지) 확인 */
export async function vehicleInOrg(db: Db, orgId: string, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(alive(orgId), eq(vehicles.id, id)))
    .limit(1);
  return rows.length > 0;
}

/** 현재 주행거리를 더 큰 값으로만 올린다(과거 날짜 기록이 현재 값을 낮추지 않게) */
export async function raiseMileage(db: Db, vehicleId: string, km: number | null | undefined) {
  if (km == null) return;
  await db
    .update(vehicles)
    .set({ currentMileageKm: sql`greatest(${vehicles.currentMileageKm}, ${km})`, updatedAt: new Date() })
    .where(eq(vehicles.id, vehicleId));
}

/** 주행거리 기록·정비 기록 중 가장 큰 값으로 현재 주행거리를 다시 맞춘다(기록 삭제 후) */
async function recomputeMileage(db: Db, vehicleId: string) {
  const [m] = await db
    .select({ max: sql<number>`coalesce(max(${mileageLogs.mileageKm}), 0)::int` })
    .from(mileageLogs)
    .where(eq(mileageLogs.vehicleId, vehicleId));
  const [s] = await db
    .select({ max: sql<number>`coalesce(max(${serviceRecords.mileageKm}), 0)::int` })
    .from(serviceRecords)
    .where(eq(serviceRecords.vehicleId, vehicleId));
  const [c] = await db
    .select({ max: sql<number>`coalesce(max(${chargingLogs.odometerKm}), 0)::int` })
    .from(chargingLogs)
    .where(eq(chargingLogs.vehicleId, vehicleId));
  const [f] = await db
    .select({ max: sql<number>`coalesce(max(${fuelingLogs.odometerKm}), 0)::int` })
    .from(fuelingLogs)
    .where(eq(fuelingLogs.vehicleId, vehicleId));
  const best = Math.max(m.max, s.max, c.max, f.max);
  // 남은 기록이 하나도 없으면 현재 값을 그대로 둔다
  if (best > 0) {
    await db.update(vehicles).set({ currentMileageKm: best, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId));
  }
}

/* ------------------------------------------------------------------ */
/* 주행거리                                                             */
/* ------------------------------------------------------------------ */

export type MileageRow = { id: string; recordedOn: string; mileageKm: number; note: string | null };

export async function listMileage(db: Db, orgId: string, vehicleId: string, limit = 60): Promise<MileageRow[]> {
  return db
    .select({ id: mileageLogs.id, recordedOn: mileageLogs.recordedOn, mileageKm: mileageLogs.mileageKm, note: mileageLogs.note })
    .from(mileageLogs)
    .where(and(eq(mileageLogs.orgId, orgId), eq(mileageLogs.vehicleId, vehicleId)))
    .orderBy(desc(mileageLogs.recordedOn), desc(mileageLogs.mileageKm))
    .limit(limit);
}

export async function addMileage(
  db: Db,
  orgId: string,
  userId: string,
  input: { vehicleId: string; recordedOn: string; mileageKm: number; note?: string | null },
): Promise<boolean> {
  if (!(await vehicleInOrg(db, orgId, input.vehicleId))) return false;
  await db.insert(mileageLogs).values({
    orgId,
    vehicleId: input.vehicleId,
    recordedOn: input.recordedOn,
    mileageKm: input.mileageKm,
    note: input.note ?? null,
    createdBy: userId,
  });
  await raiseMileage(db, input.vehicleId, input.mileageKm);
  return true;
}

export async function deleteMileage(db: Db, orgId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ vehicleId: mileageLogs.vehicleId })
    .from(mileageLogs)
    .where(and(eq(mileageLogs.id, id), eq(mileageLogs.orgId, orgId)))
    .limit(1);
  if (!row) return false;
  await db.delete(mileageLogs).where(eq(mileageLogs.id, id));
  await recomputeMileage(db, row.vehicleId);
  return true;
}

/* ------------------------------------------------------------------ */
/* 정비 기록 + 다음 주기                                                  */
/* ------------------------------------------------------------------ */

export type ServiceRow = {
  id: string;
  servicedOn: string;
  mileageKm: number | null;
  itemCode: string | null;
  category: string | null;
  shopName: string | null;
  description: string | null;
  cost: number | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
  /** 이 정비가 따른 견적(없으면 null)과 그 견적 총액 */
  repairQuoteId: string | null;
  quoteAmount: number | null;
};

const serviceColumns = {
  id: serviceRecords.id,
  servicedOn: serviceRecords.servicedOn,
  mileageKm: serviceRecords.mileageKm,
  itemCode: serviceRecords.itemCode,
  category: serviceRecords.category,
  shopName: serviceRecords.shopName,
  description: serviceRecords.description,
  cost: serviceRecords.cost,
  nextDueOn: serviceRecords.nextDueOn,
  nextDueKm: serviceRecords.nextDueKm,
  repairQuoteId: serviceRecords.repairQuoteId,
  quoteAmount: repairQuotes.totalAmount,
};

export async function listServices(db: Db, orgId: string, vehicleId: string, limit = 100): Promise<ServiceRow[]> {
  return db
    .select(serviceColumns)
    .from(serviceRecords)
    .leftJoin(repairQuotes, eq(repairQuotes.id, serviceRecords.repairQuoteId))
    .where(and(eq(serviceRecords.orgId, orgId), eq(serviceRecords.vehicleId, vehicleId)))
    .orderBy(desc(serviceRecords.servicedOn), desc(serviceRecords.createdAt))
    .limit(limit);
}

export type ServiceInput = {
  vehicleId: string;
  servicedOn: string;
  mileageKm: number | null;
  itemCode: string | null;
  category: string | null;
  shopName: string | null;
  description: string | null;
  cost: number | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
};

/**
 * 정비 기록 저장. 항목(item_code)이 있으면 그 항목의 "다음 예정" 일정(schedule)을 갱신한다.
 * 기록이 그 항목의 가장 최근 정비일 때만 일정을 바꾼다(예전 영수증을 나중에 입력해도 일정이 되돌아가지 않게).
 */
export async function addService(db: Db, orgId: string, userId: string, input: ServiceInput): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!(await vehicleInOrg(db, orgId, input.vehicleId))) return { ok: false };

  const [row] = await db
    .insert(serviceRecords)
    .values({ ...input, orgId, createdBy: userId })
    .returning({ id: serviceRecords.id });
  await raiseMileage(db, input.vehicleId, input.mileageKm);

  if (input.itemCode) {
    const preset = findPreset(input.itemCode);
    const [existing] = await db
      .select({ id: schedules.id, lastDoneOn: schedules.lastDoneOn, intervalKm: schedules.intervalKm, intervalMonths: schedules.intervalMonths })
      .from(schedules)
      .where(and(eq(schedules.vehicleId, input.vehicleId), eq(schedules.itemCode, input.itemCode), eq(schedules.kind, "replace")))
      .limit(1);

    const isLatest = !existing?.lastDoneOn || input.servicedOn >= existing.lastDoneOn;
    if (isLatest) {
      const intervalKm = existing?.intervalKm ?? preset?.defaultIntervalKm ?? null;
      const intervalMonths = existing?.intervalMonths ?? preset?.defaultIntervalMonths ?? null;
      const values = {
        intervalKm,
        intervalMonths,
        lastDoneOn: input.servicedOn,
        lastDoneKm: input.mileageKm,
        nextDueOn: input.nextDueOn,
        nextDueKm: input.nextDueKm,
        enabled: true,
        updatedAt: new Date(),
      };
      if (existing) await db.update(schedules).set(values).where(eq(schedules.id, existing.id));
      else
        await db
          .insert(schedules)
          .values({ orgId, vehicleId: input.vehicleId, itemCode: input.itemCode, kind: "replace", ...values })
          .onConflictDoUpdate({ target: [schedules.vehicleId, schedules.itemCode, schedules.kind], set: values });
    }
  }
  return { ok: true, id: row.id };
}

/** 정비 기록 삭제. 일정은 남은 기록 중 가장 최근 것으로 다시 맞춘다 */
export async function deleteService(db: Db, orgId: string, id: string): Promise<boolean> {
  const [rec] = await db
    .select({ vehicleId: serviceRecords.vehicleId, itemCode: serviceRecords.itemCode, repairQuoteId: serviceRecords.repairQuoteId })
    .from(serviceRecords)
    .where(and(eq(serviceRecords.id, id), eq(serviceRecords.orgId, orgId)))
    .limit(1);
  if (!rec) return false;
  await db.delete(serviceRecords).where(eq(serviceRecords.id, id));

  // 견적을 따라 한 정비를 지우면, 완료로 바뀌었던 견적 요청을 다시 '정함' 상태로 되돌린다
  if (rec.repairQuoteId) {
    const [q] = await db.select({ requestId: repairQuotes.requestId }).from(repairQuotes).where(eq(repairQuotes.id, rec.repairQuoteId)).limit(1);
    if (q) await db.update(repairRequests).set({ status: "chosen", updatedAt: new Date() }).where(and(eq(repairRequests.id, q.requestId), eq(repairRequests.orgId, orgId), eq(repairRequests.status, "done")));
  }

  if (rec.itemCode) {
    const [latest] = await db
      .select({ servicedOn: serviceRecords.servicedOn, mileageKm: serviceRecords.mileageKm, nextDueOn: serviceRecords.nextDueOn, nextDueKm: serviceRecords.nextDueKm })
      .from(serviceRecords)
      .where(and(eq(serviceRecords.vehicleId, rec.vehicleId), eq(serviceRecords.itemCode, rec.itemCode)))
      .orderBy(desc(serviceRecords.servicedOn), desc(serviceRecords.createdAt))
      .limit(1);
    const where = and(eq(schedules.vehicleId, rec.vehicleId), eq(schedules.itemCode, rec.itemCode), eq(schedules.kind, "replace"));
    if (latest) {
      await db
        .update(schedules)
        .set({ lastDoneOn: latest.servicedOn, lastDoneKm: latest.mileageKm, nextDueOn: latest.nextDueOn, nextDueKm: latest.nextDueKm, updatedAt: new Date() })
        .where(where);
    } else {
      await db.delete(schedules).where(where);
    }
  }
  await recomputeMileage(db, rec.vehicleId);
  return true;
}

/* ------------------------------------------------------------------ */
/* 보험                                                                 */
/* ------------------------------------------------------------------ */

export type PolicyRow = {
  id: string;
  insurer: string;
  policyNo: string | null;
  coverageType: string | null;
  startOn: string | null;
  endOn: string;
  premium: number | null;
  contact: string | null;
  notes: string | null;
};

export async function listPolicies(db: Db, orgId: string, vehicleId: string): Promise<PolicyRow[]> {
  return db
    .select({
      id: insurancePolicies.id,
      insurer: insurancePolicies.insurer,
      policyNo: insurancePolicies.policyNo,
      coverageType: insurancePolicies.coverageType,
      startOn: insurancePolicies.startOn,
      endOn: insurancePolicies.endOn,
      premium: insurancePolicies.premium,
      contact: insurancePolicies.contact,
      notes: insurancePolicies.notes,
    })
    .from(insurancePolicies)
    .where(and(eq(insurancePolicies.orgId, orgId), eq(insurancePolicies.vehicleId, vehicleId)))
    .orderBy(desc(insurancePolicies.endOn));
}

export type PolicyInput = Omit<PolicyRow, "id"> & { vehicleId: string };

export async function addPolicy(db: Db, orgId: string, userId: string, input: PolicyInput): Promise<boolean> {
  if (!(await vehicleInOrg(db, orgId, input.vehicleId))) return false;
  await db.insert(insurancePolicies).values({ ...input, orgId, createdBy: userId });
  return true;
}

export async function deletePolicy(db: Db, orgId: string, id: string): Promise<boolean> {
  const done = await db
    .delete(insurancePolicies)
    .where(and(eq(insurancePolicies.id, id), eq(insurancePolicies.orgId, orgId)))
    .returning({ id: insurancePolicies.id });
  return done.length > 0;
}

/* ------------------------------------------------------------------ */
/* 충전·주유                                                            */
/* ------------------------------------------------------------------ */

export type EnergyRow = {
  id: string;
  kind: "charging" | "fueling";
  on: string;
  amount: number | null; // kWh 또는 L
  cost: number | null;
  place: string | null;
  odometerKm: number | null;
  detail: string | null; // 충전 방식 또는 연료 등급
};

export async function listEnergy(db: Db, orgId: string, vehicleId: string, limit = 60): Promise<EnergyRow[]> {
  const [c, f] = await Promise.all([
    db
      .select({ id: chargingLogs.id, on: chargingLogs.chargedOn, amount: chargingLogs.kwh, cost: chargingLogs.cost, place: chargingLogs.place, odometerKm: chargingLogs.odometerKm, detail: chargingLogs.chargeType })
      .from(chargingLogs)
      .where(and(eq(chargingLogs.orgId, orgId), eq(chargingLogs.vehicleId, vehicleId)))
      .orderBy(desc(chargingLogs.chargedOn))
      .limit(limit),
    db
      .select({ id: fuelingLogs.id, on: fuelingLogs.fueledOn, amount: fuelingLogs.liters, cost: fuelingLogs.cost, place: fuelingLogs.place, odometerKm: fuelingLogs.odometerKm, detail: fuelingLogs.fuelGrade })
      .from(fuelingLogs)
      .where(and(eq(fuelingLogs.orgId, orgId), eq(fuelingLogs.vehicleId, vehicleId)))
      .orderBy(desc(fuelingLogs.fueledOn))
      .limit(limit),
  ]);
  return [
    ...c.map((r) => ({ ...r, kind: "charging" as const })),
    ...f.map((r) => ({ ...r, kind: "fueling" as const })),
  ]
    .sort((a, b) => b.on.localeCompare(a.on))
    .slice(0, limit);
}

export type EnergyInput = {
  vehicleId: string;
  kind: "charging" | "fueling";
  on: string;
  amount: number | null;
  cost: number | null;
  place: string | null;
  odometerKm: number | null;
  detail: string | null;
};

export async function addEnergy(db: Db, orgId: string, userId: string, input: EnergyInput): Promise<boolean> {
  if (!(await vehicleInOrg(db, orgId, input.vehicleId))) return false;
  if (input.kind === "charging") {
    await db.insert(chargingLogs).values({
      orgId, vehicleId: input.vehicleId, chargedOn: input.on, kwh: input.amount, cost: input.cost,
      chargeType: input.detail, place: input.place, odometerKm: input.odometerKm, createdBy: userId,
    });
  } else {
    await db.insert(fuelingLogs).values({
      orgId, vehicleId: input.vehicleId, fueledOn: input.on, liters: input.amount, cost: input.cost,
      fuelGrade: input.detail, place: input.place, odometerKm: input.odometerKm, createdBy: userId,
    });
  }
  await raiseMileage(db, input.vehicleId, input.odometerKm);
  return true;
}

export async function deleteEnergy(db: Db, orgId: string, kind: "charging" | "fueling", id: string): Promise<boolean> {
  const table = kind === "charging" ? chargingLogs : fuelingLogs;
  const [row] = await db
    .select({ vehicleId: table.vehicleId })
    .from(table)
    .where(and(eq(table.id, id), eq(table.orgId, orgId)))
    .limit(1);
  if (!row) return false;
  await db.delete(table).where(eq(table.id, id));
  await recomputeMileage(db, row.vehicleId);
  return true;
}

/* ------------------------------------------------------------------ */
/* 일정                                                                 */
/* ------------------------------------------------------------------ */

export async function loadUpcoming(db: Db, orgId: string, now = new Date()): Promise<UpcomingItem[]> {
  const today = todayKst(now);
  const vs = await listVehicles(db, orgId);
  if (vs.length === 0) return [];
  const ids = vs.map((v) => v.id);

  const [sch, pol, logs, svc] = await Promise.all([
    db
      .select({ id: schedules.id, vehicleId: schedules.vehicleId, itemCode: schedules.itemCode, nextDueOn: schedules.nextDueOn, nextDueKm: schedules.nextDueKm, enabled: schedules.enabled })
      .from(schedules)
      .where(and(eq(schedules.orgId, orgId), inArray(schedules.vehicleId, ids), eq(schedules.kind, "replace"))),
    db
      .select({ id: insurancePolicies.id, vehicleId: insurancePolicies.vehicleId, insurer: insurancePolicies.insurer, endOn: insurancePolicies.endOn })
      .from(insurancePolicies)
      .where(and(eq(insurancePolicies.orgId, orgId), inArray(insurancePolicies.vehicleId, ids))),
    db
      .select({ vehicleId: mileageLogs.vehicleId, on: mileageLogs.recordedOn, km: mileageLogs.mileageKm })
      .from(mileageLogs)
      .where(and(eq(mileageLogs.orgId, orgId), inArray(mileageLogs.vehicleId, ids), gte(mileageLogs.recordedOn, addDays(today, -200)))),
    db
      .select({ vehicleId: serviceRecords.vehicleId, on: serviceRecords.servicedOn, km: serviceRecords.mileageKm })
      .from(serviceRecords)
      .where(and(eq(serviceRecords.orgId, orgId), inArray(serviceRecords.vehicleId, ids))),
  ]);

  // 보험은 차량별로 가장 최신 만기일 하나만(이미 갱신한 옛 보험이 '지남'으로 남지 않게)
  const latestPolicy = new Map<string, (typeof pol)[number]>();
  for (const p of pol) {
    const cur = latestPolicy.get(p.vehicleId);
    if (!cur || p.endOn > cur.endOn) latestPolicy.set(p.vehicleId, p);
  }

  const avg: Record<string, number | null> = {};
  for (const v of vs) {
    const pts = [
      ...logs.filter((l) => l.vehicleId === v.id).map((l) => ({ on: l.on, km: l.km })),
      ...svc.filter((s) => s.vehicleId === v.id && s.km != null).map((s) => ({ on: s.on, km: s.km as number })),
    ];
    avg[v.id] = averageDailyKm(pts, today);
  }

  return buildUpcoming({
    today,
    vehicles: vs.map((v) => ({ id: v.id, label: vehicleLabel(v), currentKm: v.currentMileageKm })),
    schedules: sch,
    policies: [...latestPolicy.values()],
    avgKmPerDay: avg,
  });
}

/* ------------------------------------------------------------------ */
/* 비용                                                                 */
/* ------------------------------------------------------------------ */

export async function loadCostSummary(
  db: Db,
  orgId: string,
  range: DateRange,
  vehicleId?: string,
): Promise<CostSummary> {
  const vs = await listVehicles(db, orgId);
  const ids = vehicleId ? vs.filter((v) => v.id === vehicleId).map((v) => v.id) : vs.map((v) => v.id);
  if (ids.length === 0) return summarizeCosts([], [], range);

  const [svc, pol, chg, fue, mil] = await Promise.all([
    db
      .select({ vehicleId: serviceRecords.vehicleId, on: serviceRecords.servicedOn, amount: serviceRecords.cost, km: serviceRecords.mileageKm })
      .from(serviceRecords)
      .where(and(inArray(serviceRecords.vehicleId, ids), gte(serviceRecords.servicedOn, range.from), lte(serviceRecords.servicedOn, range.to))),
    db
      .select({ vehicleId: insurancePolicies.vehicleId, on: insurancePolicies.startOn, createdAt: insurancePolicies.createdAt, amount: insurancePolicies.premium })
      .from(insurancePolicies)
      .where(inArray(insurancePolicies.vehicleId, ids)),
    db
      .select({ vehicleId: chargingLogs.vehicleId, on: chargingLogs.chargedOn, amount: chargingLogs.cost, km: chargingLogs.odometerKm })
      .from(chargingLogs)
      .where(and(inArray(chargingLogs.vehicleId, ids), gte(chargingLogs.chargedOn, range.from), lte(chargingLogs.chargedOn, range.to))),
    db
      .select({ vehicleId: fuelingLogs.vehicleId, on: fuelingLogs.fueledOn, amount: fuelingLogs.cost, km: fuelingLogs.odometerKm })
      .from(fuelingLogs)
      .where(and(inArray(fuelingLogs.vehicleId, ids), gte(fuelingLogs.fueledOn, range.from), lte(fuelingLogs.fueledOn, range.to))),
    db
      .select({ vehicleId: mileageLogs.vehicleId, on: mileageLogs.recordedOn, km: mileageLogs.mileageKm })
      .from(mileageLogs)
      .where(and(inArray(mileageLogs.vehicleId, ids), gte(mileageLogs.recordedOn, range.from), lte(mileageLogs.recordedOn, range.to))),
  ]);

  const rows: CostRow[] = [
    ...svc.filter((r) => r.amount != null).map((r) => ({ vehicleId: r.vehicleId, category: "service" as const, on: r.on, amount: r.amount as number })),
    // 보험료는 보험 시작일(없으면 입력한 날)에 한 번 낸 것으로 센다
    ...pol
      .filter((r) => r.amount != null)
      .map((r) => ({ vehicleId: r.vehicleId, category: "insurance" as const, on: r.on ?? r.createdAt.toISOString().slice(0, 10), amount: r.amount as number })),
    ...chg.filter((r) => r.amount != null).map((r) => ({ vehicleId: r.vehicleId, category: "charging" as const, on: r.on, amount: r.amount as number })),
    ...fue.filter((r) => r.amount != null).map((r) => ({ vehicleId: r.vehicleId, category: "fueling" as const, on: r.on, amount: r.amount as number })),
  ];
  const points: KmPoint[] = [
    ...mil.map((r) => ({ vehicleId: r.vehicleId, on: r.on, km: r.km })),
    ...svc.filter((r) => r.km != null).map((r) => ({ vehicleId: r.vehicleId, on: r.on, km: r.km as number })),
    ...chg.filter((r) => r.km != null).map((r) => ({ vehicleId: r.vehicleId, on: r.on, km: r.km as number })),
    ...fue.filter((r) => r.km != null).map((r) => ({ vehicleId: r.vehicleId, on: r.on, km: r.km as number })),
  ];
  return summarizeCosts(rows, points, range);
}

/** 기록이 있는 가장 이른 날짜(비용 '전체 기간'의 시작점). 기록이 없으면 null */
export async function earliestActivity(db: Db, orgId: string): Promise<string | null> {
  const ids = (await listVehicles(db, orgId)).map((v) => v.id);
  if (ids.length === 0) return null;
  const [s, c, f, p] = await Promise.all([
    db.select({ d: sql<string | null>`min(${serviceRecords.servicedOn})` }).from(serviceRecords).where(inArray(serviceRecords.vehicleId, ids)),
    db.select({ d: sql<string | null>`min(${chargingLogs.chargedOn})` }).from(chargingLogs).where(inArray(chargingLogs.vehicleId, ids)),
    db.select({ d: sql<string | null>`min(${fuelingLogs.fueledOn})` }).from(fuelingLogs).where(inArray(fuelingLogs.vehicleId, ids)),
    db.select({ d: sql<string | null>`min(${insurancePolicies.startOn})` }).from(insurancePolicies).where(inArray(insurancePolicies.vehicleId, ids)),
  ]);
  const dates = [s[0]?.d, c[0]?.d, f[0]?.d, p[0]?.d].filter((d): d is string => typeof d === "string" && d !== "");
  return dates.length === 0 ? null : dates.sort()[0];
}
