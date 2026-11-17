/** 점검 기록 저장·조회(DB). 항목명은 점검 시점 스냅샷으로 저장한다 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import { addDays } from "@/lib/car-care";
import { listVehicles, raiseMileage, vehicleInOrg, vehicleLabel } from "@/lib/cars";
import { overallOf, type InspectionStatus, type ParsedEntry } from "@/lib/inspection";
import { followUpDueOn, followUpSource, selfCheckSource, type ReminderSource } from "@/lib/reminders";

const { inspectionRecords: records, inspectionRecordItems: recordItems, serviceRecords } = schema;

export type InspectionSummaryRow = {
  id: string;
  inspectedOn: string;
  mileageKm: number | null;
  place: string | null;
  isSelfCheck: boolean;
  overallStatus: Exclude<InspectionStatus, "na"> | null;
  memo: string | null;
  itemCount: number;
  problemCount: number;
};

export type InspectionItemRow = {
  id: string;
  itemCode: string | null;
  itemName: string;
  category: string | null;
  status: InspectionStatus;
  note: string | null;
};

export type InspectionInput = {
  vehicleId: string;
  inspectedOn: string;
  mileageKm: number | null;
  place: string | null;
  isSelfCheck: boolean;
  memo: string | null;
  entries: ParsedEntry[];
};

export async function addInspection(db: Db, orgId: string, userId: string, input: InspectionInput): Promise<{ ok: true; id: string } | { ok: false }> {
  if (input.entries.length === 0) return { ok: false };
  if (!(await vehicleInOrg(db, orgId, input.vehicleId))) return { ok: false };

  const [row] = await db
    .insert(records)
    .values({
      orgId,
      vehicleId: input.vehicleId,
      inspectedOn: input.inspectedOn,
      mileageKm: input.mileageKm,
      place: input.place,
      isSelfCheck: input.isSelfCheck,
      overallStatus: overallOf(input.entries.map((e) => e.status)),
      memo: input.memo,
      createdBy: userId,
    })
    .returning({ id: records.id });

  try {
    await db.insert(recordItems).values(
      input.entries.map((e) => ({
        recordId: row.id,
        itemCode: e.item.itemCode,
        itemName: e.item.name,
        category: e.item.category,
        status: e.status,
        note: e.note,
      })),
    );
  } catch (error) {
    // 트랜잭션을 못 쓰는 환경이라, 항목 저장에 실패하면 빈 점검 기록이 남지 않게 되돌린다
    await db.delete(records).where(eq(records.id, row.id));
    throw error;
  }
  await raiseMileage(db, input.vehicleId, input.mileageKm);
  return { ok: true, id: row.id };
}

export async function listInspections(db: Db, orgId: string, vehicleId: string, limit = 50): Promise<InspectionSummaryRow[]> {
  const list = await db
    .select({
      id: records.id,
      inspectedOn: records.inspectedOn,
      mileageKm: records.mileageKm,
      place: records.place,
      isSelfCheck: records.isSelfCheck,
      overallStatus: records.overallStatus,
      memo: records.memo,
    })
    .from(records)
    .where(and(eq(records.orgId, orgId), eq(records.vehicleId, vehicleId)))
    .orderBy(desc(records.inspectedOn), desc(records.createdAt))
    .limit(limit);
  if (list.length === 0) return [];

  const items = await db
    .select({ recordId: recordItems.recordId, status: recordItems.status })
    .from(recordItems)
    .where(
      inArray(
        recordItems.recordId,
        list.map((r) => r.id),
      ),
    );
  const counts = new Map<string, { n: number; bad: number }>();
  for (const it of items) {
    const c = counts.get(it.recordId) ?? { n: 0, bad: 0 };
    c.n += 1;
    if (it.status === "warn" || it.status === "replace") c.bad += 1;
    counts.set(it.recordId, c);
  }
  return list.map((r) => ({
    ...r,
    overallStatus: r.overallStatus === "na" ? null : r.overallStatus,
    itemCount: counts.get(r.id)?.n ?? 0,
    problemCount: counts.get(r.id)?.bad ?? 0,
  }));
}

export async function getInspection(
  db: Db,
  orgId: string,
  id: string,
): Promise<({ vehicleId: string } & Omit<InspectionSummaryRow, "itemCount" | "problemCount"> & { items: InspectionItemRow[] }) | null> {
  const [r] = await db
    .select({
      id: records.id,
      vehicleId: records.vehicleId,
      inspectedOn: records.inspectedOn,
      mileageKm: records.mileageKm,
      place: records.place,
      isSelfCheck: records.isSelfCheck,
      overallStatus: records.overallStatus,
      memo: records.memo,
    })
    .from(records)
    .where(and(eq(records.id, id), eq(records.orgId, orgId)))
    .limit(1);
  if (!r) return null;
  const items = await db
    .select({ id: recordItems.id, itemCode: recordItems.itemCode, itemName: recordItems.itemName, category: recordItems.category, status: recordItems.status, note: recordItems.note })
    .from(recordItems)
    .where(eq(recordItems.recordId, id));
  return { ...r, overallStatus: r.overallStatus === "na" ? null : r.overallStatus, items };
}

export async function deleteInspection(db: Db, orgId: string, id: string): Promise<boolean> {
  const [r] = await db.select({ id: records.id }).from(records).where(and(eq(records.id, id), eq(records.orgId, orgId))).limit(1);
  if (!r) return false;
  await db.delete(records).where(eq(records.id, id)); // 항목은 cascade
  return true;
}

export type LatestStatus = { status: InspectionStatus; on: string };

/** 항목별로 가장 최근에 점검한 결과(해당 없음은 제외) */
export async function latestStatuses(db: Db, orgId: string, vehicleId: string): Promise<Map<string, LatestStatus>> {
  const rows = await db
    .select({ code: recordItems.itemCode, status: recordItems.status, on: records.inspectedOn })
    .from(recordItems)
    .innerJoin(records, eq(records.id, recordItems.recordId))
    .where(and(eq(records.orgId, orgId), eq(records.vehicleId, vehicleId)))
    .orderBy(desc(records.inspectedOn), desc(records.createdAt));
  const out = new Map<string, LatestStatus>();
  for (const r of rows) {
    if (!r.code || r.status === "na" || out.has(r.code)) continue;
    out.set(r.code, { status: r.status, on: r.on });
  }
  return out;
}

/** 이번 달(from 이후)에 점검한 항목 코드들 */
export async function checkedCodesSince(db: Db, orgId: string, vehicleId: string, from: string): Promise<Set<string>> {
  const rows = await db
    .select({ code: recordItems.itemCode, status: recordItems.status })
    .from(recordItems)
    .innerJoin(records, eq(records.id, recordItems.recordId))
    .where(and(eq(records.orgId, orgId), eq(records.vehicleId, vehicleId), gte(records.inspectedOn, from)));
  return new Set(rows.filter((r) => r.code && r.status !== "na").map((r) => r.code as string));
}

/* ------------------------------------------------------------------ */
/* 알림 원천: 월간 셀프 점검 · 점검 후속                                     */
/* ------------------------------------------------------------------ */

const FOLLOW_UP_LOOKBACK_DAYS = 60;

/**
 * 점검 기능에서 나오는 알림 원천을 만든다.
 * - 셀프 점검: 차량마다 매달 1일 알림(이번 달 셀프 점검을 이미 했다면 보낼 때 취소).
 * - 점검 후속: 점검에서 '교체·정비 필요'(1주일 뒤) 또는 '주의'(한 달 뒤)로 기록한 항목을 다시 확인하라는 알림.
 *   그 뒤에 같은 항목을 다시 점검했거나 정비 기록을 남겼다면 해결된 것으로 보고 만들지 않는다.
 */
export async function loadInspectionSources(db: Db, orgId: string, today: string): Promise<ReminderSource[]> {
  const vlist = await listVehicles(db, orgId);
  if (vlist.length === 0) return [];
  const label = new Map(vlist.map((v) => [v.id, vehicleLabel(v)]));
  const vehicleIds = vlist.map((v) => v.id);
  const out: ReminderSource[] = [];

  // 셀프 점검
  const selfRows = await db
    .select({ vehicleId: records.vehicleId, last: sql<string>`max(${records.inspectedOn})` })
    .from(records)
    .where(and(eq(records.orgId, orgId), eq(records.isSelfCheck, true), inArray(records.vehicleId, vehicleIds)))
    .groupBy(records.vehicleId);
  const lastSelf = new Map(selfRows.map((r) => [r.vehicleId, r.last]));
  for (const v of vlist) out.push(selfCheckSource({ id: v.id, label: label.get(v.id) as string }, lastSelf.get(v.id) ?? null));

  // 점검 후속
  const since = addDays(today, -FOLLOW_UP_LOOKBACK_DAYS);
  const rows = await db
    .select({
      itemId: recordItems.id,
      recordId: records.id,
      vehicleId: records.vehicleId,
      inspectedOn: records.inspectedOn,
      itemCode: recordItems.itemCode,
      itemName: recordItems.itemName,
      status: recordItems.status,
      followUpDueOn: recordItems.followUpDueOn,
    })
    .from(recordItems)
    .innerJoin(records, eq(records.id, recordItems.recordId))
    .where(and(eq(records.orgId, orgId), inArray(records.vehicleId, vehicleIds), gte(records.inspectedOn, since)));
  const candidates = rows.filter((r) => (r.status === "warn" || r.status === "replace") && r.itemCode);
  if (candidates.length > 0) {
    const services = await db
      .select({ vehicleId: serviceRecords.vehicleId, itemCode: serviceRecords.itemCode, servicedOn: serviceRecords.servicedOn })
      .from(serviceRecords)
      .where(and(eq(serviceRecords.orgId, orgId), gte(serviceRecords.servicedOn, since), inArray(serviceRecords.vehicleId, vehicleIds)));
    for (const c of candidates) {
      const later = rows.some((r) => r.vehicleId === c.vehicleId && r.itemCode === c.itemCode && r.status !== "na" && r.inspectedOn > c.inspectedOn);
      const fixed = services.some((s) => s.vehicleId === c.vehicleId && s.itemCode === c.itemCode && s.servicedOn >= c.inspectedOn);
      if (later || fixed) continue;
      const status = c.status as "warn" | "replace";
      out.push(
        followUpSource({
          itemId: c.itemId,
          vehicleId: c.vehicleId,
          vehicleLabel: label.get(c.vehicleId) as string,
          recordId: c.recordId,
          itemName: c.itemName,
          status,
          dueOn: c.followUpDueOn ?? followUpDueOn(c.inspectedOn, status),
        }),
      );
    }
  }
  return out;
}

/** 가족 전체 차량에 대해, from 이후 점검한 항목 코드를 차량별로 모은다(홈 대시보드용 한 번의 쿼리) */
export async function checkedCodesByVehicle(db: Db, orgId: string, from: string): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({ vehicleId: records.vehicleId, code: recordItems.itemCode, status: recordItems.status })
    .from(recordItems)
    .innerJoin(records, eq(records.id, recordItems.recordId))
    .where(and(eq(records.orgId, orgId), gte(records.inspectedOn, from)));
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.code || r.status === "na") continue;
    const set = out.get(r.vehicleId) ?? new Set<string>();
    set.add(r.code);
    out.set(r.vehicleId, set);
  }
  return out;
}
