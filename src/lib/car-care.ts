/**
 * 차량 관리: 날짜·주기·일정·비용 계산(순수 함수, DB·네트워크 없음).
 * 날짜는 모두 'YYYY-MM-DD' 문자열이고, "오늘"은 한국 시간(KST) 기준이다.
 */
import { maintenancePresets, type SeedMaintenancePreset } from "@/db/seed/data/maintenance";
import type { Powertrain } from "@/lib/powertrain";

/* ------------------------------------------------------------------ */
/* 날짜                                                                */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 한국 시간 기준 오늘 날짜 */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 날짜에 개월 수를 더한다. 말일 보정(1/31 + 1개월 = 2/28) */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + Math.round(months);
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** to − from (일) */
export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

export function formatDday(days: number): string {
  if (days === 0) return "D-day";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

/* ------------------------------------------------------------------ */
/* 정비 항목(소모품) 프리셋                                             */
/* ------------------------------------------------------------------ */

/** 이 차량의 파워트레인에 해당하는 정비 항목(추정 순위순) */
export function presetsFor(powertrain: Powertrain): SeedMaintenancePreset[] {
  return maintenancePresets
    .filter((p) => !p.powertrains || p.powertrains.includes(powertrain))
    .sort((a, b) => a.estRank - b.estRank);
}

export function findPreset(itemCode: string | null | undefined): SeedMaintenancePreset | undefined {
  return itemCode ? maintenancePresets.find((p) => p.itemCode === itemCode) : undefined;
}

export type NextDue = { nextDueOn: string | null; nextDueKm: number | null };

/** 정비한 날·주행거리와 교체 주기로 다음 예정을 계산한다. 주기가 없으면 둘 다 null */
export function suggestNext(
  interval: { km?: number | null; months?: number | null },
  doneOn: string,
  doneKm: number | null,
): NextDue {
  return {
    nextDueOn: interval.months && interval.months > 0 && isDateString(doneOn) ? addMonths(doneOn, interval.months) : null,
    nextDueKm: interval.km && interval.km > 0 && doneKm != null ? doneKm + interval.km : null,
  };
}

/* ------------------------------------------------------------------ */
/* 주행 속도 → 주행거리 기준 예정일 추정                                   */
/* ------------------------------------------------------------------ */

/**
 * 최근 기록으로 하루 평균 주행거리(km)를 구한다.
 * 기록이 2개 미만이거나 기간이 14일보다 짧으면(오차가 커서) null.
 */
export function averageDailyKm(points: { on: string; km: number }[], today: string, lookbackDays = 180): number | null {
  const since = addDays(today, -lookbackDays);
  const recent = points.filter((p) => p.on >= since && p.on <= today && Number.isFinite(p.km));
  if (recent.length < 2) return null;
  const sorted = [...recent].sort((a, b) => a.on.localeCompare(b.on) || a.km - b.km);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = daysBetween(first.on, last.on);
  const driven = last.km - first.km;
  if (span < 14 || driven <= 0) return null;
  return driven / span;
}

/* ------------------------------------------------------------------ */
/* 일정(다가오는 정비·보험 만기)                                          */
/* ------------------------------------------------------------------ */

export type DueLevel = "overdue" | "urgent" | "soon" | "later";

export function dueLevel(days: number): DueLevel {
  if (days < 0) return "overdue";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  return "later";
}

export type UpcomingItem = {
  key: string;
  kind: "service" | "insurance";
  vehicleId: string;
  vehicleLabel: string;
  title: string;
  /** 도래 날짜. 날짜를 알 수 없으면(주행거리 기준만 있고 속도를 모를 때) null */
  dueOn: string | null;
  days: number | null;
  level: DueLevel;
  /** 날짜가 주행 속도로 추정한 값인지 */
  estimated: boolean;
  /** 날짜가 주행거리(추정·이미 도래)에서 나온 값인지. 이런 날짜는 자주 바뀌어서 알림에서는 주 단위로 다룬다 */
  kmBased: boolean;
  detail: string;
};

export type ScheduleInput = {
  id: string;
  vehicleId: string;
  itemCode: string;
  nextDueOn: string | null;
  nextDueKm: number | null;
  enabled: boolean;
};
export type PolicyInput = { id: string; vehicleId: string; insurer: string; endOn: string };
export type VehicleInput = { id: string; label: string; currentKm: number };

export const itemTitle = (itemCode: string) => findPreset(itemCode)?.name ?? itemCode;

/**
 * 정비 예정(날짜·주행거리)과 보험 만기를 하나의 목록으로 합친다.
 * 같은 정비 항목에 날짜와 주행거리가 모두 있으면 더 빨리 오는 쪽을 쓴다.
 * 정렬: 지난 것·가까운 것 먼저, 날짜를 모르는 항목은 맨 뒤.
 */
export function buildUpcoming(args: {
  today: string;
  vehicles: VehicleInput[];
  schedules: ScheduleInput[];
  policies: PolicyInput[];
  avgKmPerDay: Record<string, number | null>;
  /** 보험 만기 지난 뒤 며칠까지 목록에 남길지(기본 30일) */
  keepOverdueDays?: number;
}): UpcomingItem[] {
  const { today, schedules, policies } = args;
  const keep = args.keepOverdueDays ?? 30;
  const vmap = new Map(args.vehicles.map((v) => [v.id, v]));
  const items: UpcomingItem[] = [];

  for (const s of schedules) {
    const v = vmap.get(s.vehicleId);
    if (!v || !s.enabled || (s.nextDueOn == null && s.nextDueKm == null)) continue;

    let dueOn: string | null = s.nextDueOn;
    let estimated = false;
    let kmNote = "";
    let overdueByKm = false;

    if (s.nextDueKm != null) {
      const remaining = s.nextDueKm - v.currentKm;
      if (remaining <= 0) {
        overdueByKm = true;
        kmNote = `${s.nextDueKm.toLocaleString("ko-KR")}km 도래 (현재 ${v.currentKm.toLocaleString("ko-KR")}km)`;
        dueOn = dueOn && dueOn < today ? dueOn : today;
      } else {
        kmNote = `${s.nextDueKm.toLocaleString("ko-KR")}km까지 ${remaining.toLocaleString("ko-KR")}km 남음`;
        const rate = args.avgKmPerDay[s.vehicleId];
        if (rate && rate > 0) {
          const est = addDays(today, Math.ceil(remaining / rate));
          if (dueOn == null || est < dueOn) {
            dueOn = est;
            estimated = true;
          }
        }
      }
    }

    // 주행거리가 이미 도래했다면 날짜와 상관없이 "지남"으로 본다
    let days: number | null = dueOn == null ? null : daysBetween(today, dueOn);
    if (overdueByKm) days = Math.min(days ?? -1, -1);
    items.push({
      key: `schedule-${s.id}`,
      kind: "service",
      vehicleId: s.vehicleId,
      vehicleLabel: v.label,
      title: itemTitle(s.itemCode),
      dueOn,
      days,
      level: days == null ? "later" : dueLevel(days),
      estimated,
      kmBased: estimated || overdueByKm,
      detail: [s.nextDueOn ? `${s.nextDueOn} 예정` : null, kmNote || null, estimated ? "날짜는 평균 주행거리로 추정" : null]
        .filter(Boolean)
        .join(" · "),
    });
  }

  for (const p of policies) {
    const v = vmap.get(p.vehicleId);
    if (!v) continue;
    const days = daysBetween(today, p.endOn);
    if (days < -keep) continue;
    items.push({
      key: `policy-${p.id}`,
      kind: "insurance",
      vehicleId: p.vehicleId,
      vehicleLabel: v.label,
      title: `보험 만기 · ${p.insurer}`,
      dueOn: p.endOn,
      days,
      level: dueLevel(days),
      estimated: false,
      kmBased: false,
      detail: `${p.endOn} 만기`,
    });
  }

  return items.sort((a, b) => {
    if (a.days == null && b.days == null) return a.title.localeCompare(b.title, "ko");
    if (a.days == null) return 1;
    if (b.days == null) return -1;
    return a.days - b.days || a.title.localeCompare(b.title, "ko");
  });
}

/* ------------------------------------------------------------------ */
/* 비용 집계                                                            */
/* ------------------------------------------------------------------ */

export const COST_CATEGORIES = ["service", "insurance", "charging", "fueling"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];
export const COST_LABEL: Record<CostCategory, string> = {
  service: "정비",
  insurance: "보험",
  charging: "충전",
  fueling: "주유",
};

export type CostRow = { vehicleId: string; category: CostCategory; on: string; amount: number };
export type KmPoint = { vehicleId: string; on: string; km: number };

export type CostSummary = {
  total: number;
  byCategory: Record<CostCategory, number>;
  /** 'YYYY-MM' → 합계 (기간 안의 모든 달, 비용이 없는 달은 0) */
  byMonth: { month: string; total: number }[];
  byVehicle: Record<string, number>;
  /** 기간 안에서 달린 거리(차량별로 가장 큰 값 − 가장 작은 값의 합). 계산할 수 없으면 null */
  kmDriven: number | null;
  perKm: number | null; // 원
  count: number;
};

export type DateRange = { from: string; to: string };

export function periodRange(period: "year" | "12m" | "all", today: string, earliest?: string | null): DateRange {
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (period === "12m") return { from: addMonths(today, -12), to: today };
  return { from: earliest ?? addMonths(today, -12), to: today };
}

export function monthsIn(range: DateRange): string[] {
  const out: string[] = [];
  let cur = `${range.from.slice(0, 7)}-01`;
  const end = `${range.to.slice(0, 7)}-01`;
  for (let guard = 0; cur <= end && guard < 600; guard++) {
    out.push(cur.slice(0, 7));
    cur = addMonths(cur, 1);
  }
  return out;
}

const MIN_KM_FOR_PER_KM = 100;

export function summarizeCosts(rows: CostRow[], points: KmPoint[], range: DateRange): CostSummary {
  const inRange = rows.filter((r) => r.on >= range.from && r.on <= range.to && Number.isFinite(r.amount) && r.amount > 0);
  const byCategory: Record<CostCategory, number> = { service: 0, insurance: 0, charging: 0, fueling: 0 };
  const byVehicle: Record<string, number> = {};
  const month = new Map(monthsIn(range).map((m) => [m, 0]));
  let total = 0;
  for (const r of inRange) {
    total += r.amount;
    byCategory[r.category] += r.amount;
    byVehicle[r.vehicleId] = (byVehicle[r.vehicleId] ?? 0) + r.amount;
    const key = r.on.slice(0, 7);
    month.set(key, (month.get(key) ?? 0) + r.amount);
  }

  // 거리: 차량마다 기간 안 주행거리 기록의 (최대 − 최소)를 합친다
  const perVehicleKm = new Map<string, { min: number; max: number }>();
  for (const p of points) {
    if (p.on < range.from || p.on > range.to || !Number.isFinite(p.km)) continue;
    const cur = perVehicleKm.get(p.vehicleId);
    perVehicleKm.set(p.vehicleId, cur ? { min: Math.min(cur.min, p.km), max: Math.max(cur.max, p.km) } : { min: p.km, max: p.km });
  }
  let kmDriven = 0;
  for (const { min, max } of perVehicleKm.values()) kmDriven += max - min;
  const usableKm = kmDriven >= MIN_KM_FOR_PER_KM ? kmDriven : null;

  return {
    total,
    byCategory,
    byMonth: [...month.entries()].map(([m, t]) => ({ month: m, total: t })),
    byVehicle,
    kmDriven: usableKm,
    perKm: usableKm && total > 0 ? Math.round(total / usableKm) : null,
    count: inRange.length,
  };
}
