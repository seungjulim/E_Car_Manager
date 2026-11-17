/** 점검 체크리스트: 어떤 항목을 보여 줄지, 상태를 어떻게 합치고 요약할지(DB 없는 순수 로직) */
import { inspectionItems, type SeedInspectionItem } from "@/db/seed/data/inspection";
import type { Powertrain } from "@/lib/powertrain";

export const STATUSES = ["ok", "warn", "replace", "na"] as const;
export type InspectionStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<InspectionStatus, string> = { ok: "정상", warn: "주의", replace: "교체·정비 필요", na: "해당 없음" };
export const STATUS_SHORT: Record<InspectionStatus, string> = { ok: "정상", warn: "주의", replace: "필요", na: "해당 없음" };
export const STATUS_ICON: Record<InspectionStatus, string> = { ok: "🟢", warn: "🟡", replace: "🔴", na: "⚪" };

export type CheckMode = "self" | "shop";
export const TOP_COUNT = 10;

export type ChecklistItem = SeedInspectionItem;

/** 이 파워트레인에 해당하는 모든 점검 항목(TOP 10 → 나머지 순) */
export function itemsForPowertrain(pt: Powertrain): ChecklistItem[] {
  return inspectionItems
    .map((item, order) => ({ item, order }))
    .filter(({ item }) => !item.powertrains || item.powertrains.includes(pt))
    .sort((a, b) => (a.item.topRank ?? 99) - (b.item.topRank ?? 99) || a.order - b.order)
    .map(({ item }) => item);
}

/** 월간 셀프 점검 대상: 운전자가 직접 볼 수 있고 매달 점검하는 항목 */
export function isSelfCheckItem(item: ChecklistItem): boolean {
  return item.selfCheckCycle === "monthly" && (item.checkMethod === "self" || item.checkMethod === "both");
}

/** 점검 방식(셀프/정비소)에 맞는 항목. 셀프는 월간 항목만, 정비소는 전체 */
export function itemsForMode(pt: Powertrain, mode: CheckMode): ChecklistItem[] {
  const all = itemsForPowertrain(pt);
  return mode === "self" ? all.filter(isSelfCheckItem) : all;
}

export function findItem(code: string | null | undefined): ChecklistItem | undefined {
  return code ? inspectionItems.find((i) => i.itemCode === code) : undefined;
}

export type ChecklistSection = { key: string; title: string; hint?: string; items: ChecklistItem[] };

/** TOP 10 은 맨 위에 따로 묶고, 나머지는 분류별로 나눈다 */
export function sectionsFor(items: ChecklistItem[]): ChecklistSection[] {
  const top = items.filter((i) => i.topRank != null);
  const rest = items.filter((i) => i.topRank == null);
  const out: ChecklistSection[] = [];
  if (top.length > 0) out.push({ key: "top", title: "점검 TOP 10", hint: "빠뜨리면 위험하거나 고장 비용이 큰 항목이에요.", items: top });
  const byCat = new Map<string, ChecklistItem[]>();
  for (const i of rest) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i]);
  for (const [cat, list] of byCat) out.push({ key: `cat:${cat}`, title: cat, items: list });
  return out;
}

/** 항목 상태들 중 가장 나쁜 것. 판단할 상태가 없으면 null */
export function overallOf(statuses: InspectionStatus[]): Exclude<InspectionStatus, "na"> | null {
  if (statuses.includes("replace")) return "replace";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("ok")) return "ok";
  return null;
}

export function isStatus(v: unknown): v is InspectionStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/** 폼 필드 이름 규칙: 상태 `s_<코드>`, 메모 `n_<코드>` */
export const statusField = (code: string) => `s_${code}`;
export const noteField = (code: string) => `n_${code}`;

export type ParsedEntry = { item: ChecklistItem; status: InspectionStatus; note: string | null };
export type ParseResult = { ok: true; entries: ParsedEntry[] } | { ok: false; error: string };
const NOTE_MAX = 200;

/**
 * 폼에서 항목별 결과를 읽는다. 이 차량(파워트레인)에 없는 항목 코드는 무시하고,
 * 고르지 않은 항목은 저장하지 않는다. 상태 값이 잘못됐거나 메모가 너무 길면 오류.
 */
export function parseEntries(pt: Powertrain, get: (name: string) => string): ParseResult {
  const entries: ParsedEntry[] = [];
  for (const item of itemsForPowertrain(pt)) {
    const raw = get(statusField(item.itemCode)).trim();
    if (raw === "") continue;
    if (!isStatus(raw)) return { ok: false, error: `'${item.name}'의 점검 결과가 올바르지 않아요.` };
    const note = get(noteField(item.itemCode)).trim();
    if (note.length > NOTE_MAX) return { ok: false, error: `'${item.name}'의 메모는 ${NOTE_MAX}자까지 쓸 수 있어요.` };
    entries.push({ item, status: raw, note: note === "" ? null : note });
  }
  if (entries.length === 0) return { ok: false, error: "점검한 항목의 결과를 하나 이상 골라 주세요." };
  return { ok: true, entries };
}

/** 이번 달 TOP 10 진행도: 순위(1~10)별로 해당 항목 중 하나라도 점검했으면 완료 */
export function topProgress(pt: Powertrain, checkedCodes: ReadonlySet<string>): { done: number; total: number; pendingRanks: number[] } {
  const done = new Set<number>();
  const all = new Set<number>();
  for (const item of itemsForPowertrain(pt)) {
    if (item.topRank == null) continue;
    all.add(item.topRank);
    if (checkedCodes.has(item.itemCode)) done.add(item.topRank);
  }
  return { done: done.size, total: all.size, pendingRanks: [...all].filter((r) => !done.has(r)).sort((a, b) => a - b) };
}

/** 정비 기록 작성으로 이어 줄 수 있는 항목인지(정비 TOP 10 과 같은 코드) */
export function serviceLink(vehicleId: string, itemCode: string | null): string {
  return `/cars/vehicles/${vehicleId}/service/new${itemCode ? `?item=${encodeURIComponent(itemCode)}` : ""}`;
}
