/**
 * 자료 내려받기: 가족(org)의 차량 관리 기록을 CSV(엑셀용)나 전체 백업(JSON)으로 만든다.
 * 모든 조회는 가족 범위로 한정하고, 삭제된 차량은 제외한다. 서류 사진 파일은 포함하지 않는다.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";

const { vehicles, serviceRecords, insurancePolicies, mileageLogs, fuelingLogs, chargingLogs, repairRequests, repairQuotes, repairShops } = schema;

/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

export type Cell = string | number | boolean | null | undefined;

/** 엑셀에서 수식으로 실행될 수 있는 시작 글자(= + - @ 탭 줄바꿈)로 시작하는 글은 앞에 ' 를 붙여 글자로만 읽히게 한다 */
export function safeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvField(value: Cell): string {
  const text = safeCell(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 엑셀에서 한글이 깨지지 않도록 맨 앞에 BOM 을 붙인 CSV 글자를 만든다 */
export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [headers.map(csvField).join(","), ...rows.map((r) => r.map(csvField).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ */
/* 데이터 모으기                                                          */
/* ------------------------------------------------------------------ */

export type ExportData = Awaited<ReturnType<typeof loadExportData>>;

export async function loadExportData(db: Db, orgId: string) {
  const vehicleRows = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.orgId, orgId), isNull(vehicles.deletedAt)))
    .orderBy(asc(vehicles.createdAt));
  const ids = vehicleRows.map((v) => v.id);

  const byVehicle = <T extends { vehicleId: string }>(rows: T[]) => rows.filter((r) => ids.includes(r.vehicleId));

  const [service, insurance, mileage, fueling, charging, requests] = await Promise.all([
    db.select().from(serviceRecords).where(eq(serviceRecords.orgId, orgId)).orderBy(desc(serviceRecords.servicedOn)),
    db.select().from(insurancePolicies).where(eq(insurancePolicies.orgId, orgId)).orderBy(desc(insurancePolicies.endOn)),
    db.select().from(mileageLogs).where(eq(mileageLogs.orgId, orgId)).orderBy(desc(mileageLogs.recordedOn)),
    db.select().from(fuelingLogs).where(eq(fuelingLogs.orgId, orgId)).orderBy(desc(fuelingLogs.fueledOn)),
    db.select().from(chargingLogs).where(eq(chargingLogs.orgId, orgId)).orderBy(desc(chargingLogs.chargedOn)),
    db.select().from(repairRequests).where(eq(repairRequests.orgId, orgId)).orderBy(desc(repairRequests.createdAt)),
  ]);
  const quoteRows = await db.select().from(repairQuotes).where(eq(repairQuotes.orgId, orgId)).orderBy(desc(repairQuotes.createdAt));
  const shopIds = [...new Set(quoteRows.map((q) => q.shopId))];
  const shops = shopIds.length > 0 ? await db.select().from(repairShops).where(inArray(repairShops.id, shopIds)) : [];

  return {
    vehicles: vehicleRows,
    service: byVehicle(service),
    insurance: byVehicle(insurance),
    mileage: byVehicle(mileage),
    fueling: byVehicle(fueling),
    charging: byVehicle(charging),
    requests: byVehicle(requests),
    quotes: quoteRows.filter((q) => requests.some((r) => r.id === q.requestId && ids.includes(r.vehicleId))),
    shops,
  };
}

/* ------------------------------------------------------------------ */
/* 내려받기 종류                                                          */
/* ------------------------------------------------------------------ */

export type ExportKind = "vehicles" | "service" | "insurance" | "mileage" | "fueling" | "charging" | "quotes" | "all";

export const EXPORT_KINDS: readonly { kind: ExportKind; label: string; desc: string; format: "csv" | "json" }[] = [
  { kind: "vehicles", label: "차량 목록", desc: "차량번호·모델·연료·현재 주행거리", format: "csv" },
  { kind: "service", label: "정비 기록", desc: "날짜·항목·정비소·금액·다음 예정", format: "csv" },
  { kind: "insurance", label: "보험", desc: "보험사·보장·기간·보험료", format: "csv" },
  { kind: "mileage", label: "주행거리", desc: "날짜별 기록", format: "csv" },
  { kind: "fueling", label: "주유 기록", desc: "날짜·리터·금액", format: "csv" },
  { kind: "charging", label: "충전 기록", desc: "날짜·kWh·금액", format: "csv" },
  { kind: "quotes", label: "수리 견적", desc: "정비소별 견적 금액", format: "csv" },
  { kind: "all", label: "전체 백업", desc: "위 자료를 한 파일(JSON)에 모두", format: "json" },
];

export const isExportKind = (v: string): v is ExportKind => EXPORT_KINDS.some((k) => k.kind === v);

export type ExportFile = { filename: string; contentType: string; body: string };

const POWERTRAIN: Record<string, string> = { ev: "전기", hev: "하이브리드", phev: "플러그인 하이브리드", ice: "내연기관" };
const FUEL: Record<string, string> = { gasoline: "휘발유", diesel: "경유", lpg: "LPG" };
const PART_PREF: Record<string, string> = { oem: "OEM", genuine: "순정", any: "상관없음" };

/** 차량 id 로 "차량번호(별칭)" 글자를 찾는 함수 */
function vehicleNamer(data: ExportData) {
  const map = new Map(data.vehicles.map((v) => [v.id, v] as const));
  return {
    plate: (id: string) => map.get(id)?.plateNo ?? "",
    name: (id: string) => {
      const v = map.get(id);
      return v ? [v.brand, v.model].filter(Boolean).join(" ") || (v.nickname ?? "") : "";
    },
  };
}

export function buildExport(kind: ExportKind, data: ExportData, today: string): ExportFile {
  const n = vehicleNamer(data);
  const csv = (name: string, headers: string[], rows: Cell[][]): ExportFile => ({
    filename: `${name}-${today}.csv`,
    contentType: "text/csv; charset=utf-8",
    body: toCsv(headers, rows),
  });

  switch (kind) {
    case "vehicles":
      return csv(
        "차량목록",
        ["차량번호", "별칭", "브랜드", "모델", "트림", "연료", "내연기관 연료", "구입 연도", "구입일", "차대번호", "색상", "현재 주행거리(km)", "메모"],
        data.vehicles.map((v) => [
          v.plateNo, v.nickname, v.brand, v.model, v.trim, POWERTRAIN[v.powertrain] ?? v.powertrain, v.iceFuel ? (FUEL[v.iceFuel] ?? v.iceFuel) : "",
          v.purchaseYear, v.purchasedAt, v.vin, v.color, v.currentMileageKm, v.notes,
        ]),
      );
    case "service":
      return csv(
        "정비기록",
        ["날짜", "차량번호", "차량", "주행거리(km)", "항목 코드", "분류", "정비소", "내용", "금액(원)", "다음 예정일", "다음 예정 주행거리(km)"],
        data.service.map((s) => [s.servicedOn, n.plate(s.vehicleId), n.name(s.vehicleId), s.mileageKm, s.itemCode, s.category, s.shopName, s.description, s.cost, s.nextDueOn, s.nextDueKm]),
      );
    case "insurance":
      return csv(
        "보험",
        ["차량번호", "차량", "보험사", "증권번호", "보장 종류", "시작일", "만기일", "보험료(원)", "연락처", "메모"],
        data.insurance.map((i) => [n.plate(i.vehicleId), n.name(i.vehicleId), i.insurer, i.policyNo, i.coverageType, i.startOn, i.endOn, i.premium, i.contact, i.notes]),
      );
    case "mileage":
      return csv(
        "주행거리",
        ["날짜", "차량번호", "차량", "주행거리(km)", "메모"],
        data.mileage.map((m) => [m.recordedOn, n.plate(m.vehicleId), n.name(m.vehicleId), m.mileageKm, m.note]),
      );
    case "fueling":
      return csv(
        "주유기록",
        ["날짜", "차량번호", "차량", "리터", "유종", "금액(원)", "장소", "주행거리(km)"],
        data.fueling.map((f) => [f.fueledOn, n.plate(f.vehicleId), n.name(f.vehicleId), f.liters, f.fuelGrade, f.cost, f.place, f.odometerKm]),
      );
    case "charging":
      return csv(
        "충전기록",
        ["날짜", "차량번호", "차량", "kWh", "충전 방식", "금액(원)", "장소", "주행거리(km)"],
        data.charging.map((c) => [c.chargedOn, n.plate(c.vehicleId), n.name(c.vehicleId), c.kwh, c.chargeType === "dc" ? "급속" : c.chargeType === "ac" ? "완속" : c.chargeType, c.cost, c.place, c.odometerKm]),
      );
    case "quotes": {
      const shopName = new Map(data.shops.map((s) => [s.id, s.name] as const));
      const request = new Map(data.requests.map((r) => [r.id, r] as const));
      return csv(
        "수리견적",
        ["등록일", "차량번호", "차량", "수리 내용", "부품 선호", "정비소", "총액(원)", "부품(원)", "공임(원)", "세금(원)", "부품 종류", "보증(개월)", "유효기한", "메모"],
        data.quotes.map((q) => {
          const r = request.get(q.requestId);
          return [
            q.createdAt.toISOString().slice(0, 10), r ? n.plate(r.vehicleId) : "", r ? n.name(r.vehicleId) : "", r?.description ?? r?.itemCode,
            r ? (PART_PREF[r.partPref] ?? r.partPref) : "", shopName.get(q.shopId), q.totalAmount, q.partsAmount, q.laborAmount, q.taxAmount,
            q.partType, q.warrantyMonths, q.validUntil, q.note,
          ];
        }),
      );
    }
    case "all":
      return {
        filename: `차량기록-전체백업-${today}.json`,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ exportedAt: new Date().toISOString(), note: "서류 사진 파일은 포함되지 않아요.", ...data }, null, 2),
      };
  }
}

/** 한국 날짜(YYYY-MM-DD) */
export function kstToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
}
