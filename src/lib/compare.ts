/**
 * 비교표 계산(순수 함수): 선택한 트림들을 행 단위로 펼치고, 행마다 "트림끼리 값이 다른지"를 표시한다.
 * 서로 다른 파워트레인(전기·하이브리드·내연)을 한 표에 놓아도, 해당 없는 항목은 '-'로 둔다.
 */
import type { FeatureMap, PowertrainSpecs } from "@/db/schema/catalog";
import { SPEC_FIELDS, type SpecField } from "@/lib/car-draft";
import { formatManwon } from "@/lib/format";
import { POWERTRAINS, type Powertrain } from "@/lib/powertrain";
import { normalizeName } from "@/lib/recommend";

export const MAX_COMPARE = 4;

export type CompareTrim = {
  id: string;
  trimName: string;
  modelId: string;
  modelName: string;
  brandName: string;
  powertrain: Powertrain;
  coverUrl: string | null;
  price: number | null; // 원
  subsidyEstimate: number | null; // 원
  features: FeatureMap;
  powertrainSpecs: PowertrainSpecs | null;
  pros: string[];
  cons: string[];
  /** 가족 평점 평균(없으면 null)과 평가한 사람 수 */
  rating: { avg: number | null; count: number };
  /** 구입 전 체크 총점(내 기준). 내 관심 목록에 없거나 체크하지 않았으면 없음 */
  checkScore?: { score: number | null; scored: number; issues: number };
};

export type CompareCell =
  | { kind: "text"; value: string | null } // null → '-'
  | { kind: "bool"; value: boolean }
  | { kind: "list"; items: string[] };

export type CompareRow = {
  key: string;
  group: string;
  label: string;
  cells: CompareCell[];
  /** 트림끼리 값이 하나라도 다르면 true */
  differs: boolean;
};

const POWERTRAIN_LABEL: Record<Powertrain, string> = {
  ev: "전기차",
  hev: "하이브리드(HEV)",
  phev: "플러그인 하이브리드",
  ice: "내연기관",
};

const sameCells = (cells: CompareCell[]) => new Set(cells.map((c) => JSON.stringify(c))).size <= 1;

function row(key: string, group: string, label: string, cells: CompareCell[]): CompareRow {
  return { key, group, label, cells, differs: !sameCells(cells) };
}
const text = (value: string | null): CompareCell => ({ kind: "text", value });

/** 보조금을 반영한 가격(원). 내연기관이거나 보조금이 없으면 null */
export function priceAfterSubsidy(t: Pick<CompareTrim, "price" | "subsidyEstimate" | "powertrain">): number | null {
  if (t.price == null || t.powertrain === "ice" || !t.subsidyEstimate) return null;
  return Math.max(0, t.price - t.subsidyEstimate);
}

function formatSpec(field: SpecField, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const v = typeof value === "number" ? value.toLocaleString("ko-KR") : String(value);
  return field.unit ? `${v} ${field.unit}` : v;
}

export function buildCompareRows(trims: CompareTrim[]): CompareRow[] {
  const rows: CompareRow[] = [];

  // ----- 기본 -----
  rows.push(row("powertrain", "기본", "유형", trims.map((t) => text(POWERTRAIN_LABEL[t.powertrain]))));
  rows.push(row("price", "기본", "가격", trims.map((t) => text(t.price != null ? formatManwon(t.price) : null))));
  rows.push(
    row("price-after", "기본", "보조금 반영(추정)", trims.map((t) => {
      const p = priceAfterSubsidy(t);
      return text(p != null ? formatManwon(p) : null);
    })),
  );

  // ----- 사양: 비교 대상에 나오는 파워트레인들의 항목을 합쳐서(같은 키는 한 줄) -----
  const present = POWERTRAINS.filter((p) => trims.some((t) => t.powertrain === p));
  const fields = new Map<string, SpecField>();
  for (const p of present) for (const f of SPEC_FIELDS[p]) if (!fields.has(f.key)) fields.set(f.key, f);
  for (const [key, field] of fields) {
    rows.push(
      row(`spec-${key}`, "사양", field.label, trims.map((t) => {
        const applicable = SPEC_FIELDS[t.powertrain].some((f) => f.key === key);
        const value = applicable ? (t.powertrainSpecs as Record<string, unknown> | null)?.[key] : null;
        return text(formatSpec(field, value));
      })),
    );
  }

  // ----- 편의사양: 항목 이름(정규화)이 같으면 같은 항목. 분류는 처음 나온 분류를 따른다 -----
  const items = new Map<string, { label: string; category: string }>();
  for (const t of trims) {
    for (const [category, list] of Object.entries(t.features)) {
      for (const item of list) {
        const k = normalizeName(item);
        if (k && !items.has(k)) items.set(k, { label: item, category });
      }
    }
  }
  const owned = trims.map((t) => new Set(Object.values(t.features).flat().map(normalizeName)));
  for (const [k, { label, category }] of items) {
    rows.push(row(`feature-${k}`, `편의사양 · ${category}`, label, owned.map((set) => ({ kind: "bool", value: set.has(k) }) as CompareCell)));
  }

  // ----- 장단점 / 가족 평가 -----
  rows.push(row("pros", "장단점", "장점", trims.map((t) => ({ kind: "list", items: t.pros }) as CompareCell)));
  rows.push(row("cons", "장단점", "단점", trims.map((t) => ({ kind: "list", items: t.cons }) as CompareCell)));
  rows.push(
    row("rating", "가족 평가", "평균 별점", trims.map((t) =>
      text(t.rating.avg == null ? null : `★ ${t.rating.avg.toFixed(1)} (${t.rating.count}명)`),
    )),
  );

  // ----- 구입 전 체크(내 기준): 한 대라도 체크한 점수가 있을 때만 -----
  if (trims.some((t) => t.checkScore?.score != null || (t.checkScore?.issues ?? 0) > 0)) {
    rows.push(
      row("check-score", "구입 전 체크(내 기준)", "가중 총점", trims.map((t) => {
        const c = t.checkScore;
        return text(c?.score == null ? null : `${c.score.toFixed(1)} / 5 (${c.scored}개 항목)`);
      })),
    );
    rows.push(
      row("check-issues", "구입 전 체크(내 기준)", "문제 있음", trims.map((t) => {
        const c = t.checkScore;
        return text(c == null ? null : c.issues > 0 ? `${c.issues}건` : "없음");
      })),
    );
  }

  return rows;
}

/** URL 의 t=id,id,id 파라미터 → 중복 제거한 UUID 목록(최대 4개) */
export function parseCompareIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => uuid.test(s)))].slice(0, MAX_COMPARE);
}
