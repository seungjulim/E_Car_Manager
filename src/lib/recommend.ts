/**
 * 예산별 인기 TOP 10 추천 — 순수 계산 로직(DB·네트워크 없음, 테스트하기 쉽게 분리).
 *
 * 흐름: 예산 안에 들어오는 트림이 있는 모델만 후보 → 인기 점수(최근 3개월 판매량 순위)와
 * 취향 점수(저장된 취향과의 일치도)를 계산 → 선택한 기준으로 정렬해 상위 N개.
 */
import type { Powertrain } from "@/lib/powertrain";

export type CandidateTrim = {
  id: string;
  name: string;
  price: number | null; // 원
  subsidyEstimate: number | null; // 원
  features: Record<string, string[]>;
};

export type Candidate = {
  id: string;
  name: string;
  brandName: string;
  powertrain: Powertrain;
  segment: string | null;
  launchOn: string | null; // YYYY-MM-DD
  coverUrl: string | null;
  trims: CandidateTrim[];
};

export type PopularityRow = {
  modelId: string | null;
  brandRaw: string | null;
  modelRaw: string;
  period: string; // YYYY-MM-DD (해당 월 1일)
  salesCount: number | null;
};

export type TastePrefs = {
  powertrains: Powertrain[] | null;
  decided: boolean;
  bodyTypes: string[] | null;
  priorityFeatures: Record<string, number> | null; // 편의사양 이름 → 중요도
};

export type SortMode = "popular" | "taste" | "combined";

export type RecommendInput = {
  minWon: number;
  maxWon: number;
  includeSubsidy: boolean;
  powertrains: Powertrain[];
  /** 차급 문자열 필터(예: "SUV", "중형"). 모델의 segment 에 포함되면 통과. 비어 있으면 전체 */
  segments: string[];
  sortMode: SortMode;
  /** 종합 점수에서 인기 비중(기본 0.7, 취향은 나머지) */
  popularityWeight?: number;
  limit?: number;
  now?: Date;
};

export type RecommendationItem = {
  modelId: string;
  name: string;
  brandName: string;
  powertrain: Powertrain;
  segment: string | null;
  coverUrl: string | null;
  isNew: boolean;
  affordable: { count: number; minWon: number; maxWon: number; trimNames: string[] };
  popularity: { sales: number; rank: number; of: number; score: number } | null;
  tasteScore: number | null; // 0~1
  finalScore: number | null; // 0~1
  reasons: string[];
};

export type RecommendResult = {
  items: RecommendationItem[];
  totalCandidates: number;
  popularityAnchor: string | null; // YYYY-MM (인기 집계 기준 최신 월)
  hasPopularityData: boolean;
  hasTasteData: boolean;
  /** 가격 정보가 없어 추천에서 빠진 인기 모델(판매량 높은 순) */
  missingPrice: { name: string; brandName: string | null; sales: number }[];
  /** 예산을 올리면 후보가 늘어나는 경우의 제안 */
  budgetUpSuggestion: { addWon: number; extra: number } | null;
};

export const NEW_MODEL_DAYS = 90;
const BUDGET_UP_STEP_WON = 5_000_000;

/** 비교용 이름 정규화: 소문자, 공백·기호 제거 */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s\-_·.()/]/g, "");
}

const monthIndex = (period: string) => {
  const [y, m] = period.split("-");
  return Number(y) * 12 + (Number(m) - 1);
};

/** 보조금을 반영한 실구매가(원). 가격이 없으면 null. 내연기관은 보조금을 적용하지 않는다 */
export function effectivePrice(trim: CandidateTrim, powertrain: Powertrain, includeSubsidy: boolean): number | null {
  if (trim.price == null) return null;
  const subsidy = includeSubsidy && powertrain !== "ice" ? (trim.subsidyEstimate ?? 0) : 0;
  return Math.max(0, trim.price - subsidy);
}

function affordableTrims(c: Candidate, min: number, max: number, includeSubsidy: boolean) {
  return c.trims
    .map((t) => ({ trim: t, price: effectivePrice(t, c.powertrain, includeSubsidy) }))
    .filter((x): x is { trim: CandidateTrim; price: number } => x.price != null && x.price >= min && x.price <= max);
}

/** 차급 문자열을 단어로 나눈다. "중형 SUV", "경·소형", "중형SUV" → [중형, suv] / [경, 소형] / [중형, suv] */
export function segmentTokens(segment: string | null): string[] {
  if (!segment) return [];
  return segment
    .replace(/(suv|mpv)/gi, " $1 ")
    .split(/[\s,/·.]+/)
    .map(normalizeName)
    .filter(Boolean);
}

/** 차급 문구(segment)가 찾는 차급(term)을 포함하는지 — 단어 단위로 비교(중형은 준중형과 구분) */
export function hasSegment(segment: string | null, term: string): boolean {
  const t = normalizeName(term);
  return segmentTokens(segment).includes(t);
}

function segmentMatches(c: Candidate, segments: string[]) {
  if (segments.length === 0) return true;
  return segments.some((s) => hasSegment(c.segment, s));
}

/** 판매 자료의 한 행이 어느 후보 모델의 것인지 찾는다(modelId → 브랜드+모델명 → 모델명 유일 일치 순) */
function buildMatcher(models: { id: string; name: string; brandName: string }[]) {
  const byId = new Set(models.map((m) => m.id));
  const byBrandModel = new Map<string, string[]>();
  const byModel = new Map<string, string[]>();
  for (const m of models) {
    const k1 = `${normalizeName(m.brandName)}|${normalizeName(m.name)}`;
    const k2 = normalizeName(m.name);
    byBrandModel.set(k1, [...(byBrandModel.get(k1) ?? []), m.id]);
    byModel.set(k2, [...(byModel.get(k2) ?? []), m.id]);
  }
  return (row: Pick<PopularityRow, "modelId" | "brandRaw" | "modelRaw">): string | null => {
    if (row.modelId && byId.has(row.modelId)) return row.modelId;
    if (row.brandRaw) {
      const hit = byBrandModel.get(`${normalizeName(row.brandRaw)}|${normalizeName(row.modelRaw)}`);
      if (hit?.length === 1) return hit[0];
    }
    const hit = byModel.get(normalizeName(row.modelRaw));
    return hit?.length === 1 ? hit[0] : null;
  };
}

/** 취향 일치도(0~1). 판단할 근거가 하나도 없으면 null */
function tasteScoreOf(c: Candidate, trims: CandidateTrim[], prefs: TastePrefs | null): number | null {
  if (!prefs) return null;
  const parts: number[] = [];

  if (prefs.decided && prefs.powertrains && prefs.powertrains.length > 0) {
    parts.push(prefs.powertrains.includes(c.powertrain) ? 1 : 0);
  }
  if (prefs.bodyTypes && prefs.bodyTypes.length > 0) {
    parts.push(prefs.bodyTypes.some((b) => hasSegment(c.segment, b)) ? 1 : 0);
  }
  if (prefs.priorityFeatures) {
    const wanted = Object.entries(prefs.priorityFeatures).filter(([, w]) => w > 0);
    const total = wanted.reduce((s, [, w]) => s + w, 0);
    if (total > 0) {
      // 예산 안 트림 중 원하는 사양을 가장 많이 갖춘 트림 기준
      const best = Math.max(
        0,
        ...trims.map((t) => {
          const items = Object.values(t.features).flat().map(normalizeName);
          return wanted.reduce((s, [name, w]) => {
            const n = normalizeName(name);
            return items.some((i) => i.includes(n) || n.includes(i)) ? s + w : s;
          }, 0);
        }),
      );
      parts.push(best / total);
    }
  }
  return parts.length === 0 ? null : parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function recommend(
  candidates: Candidate[],
  popularity: PopularityRow[],
  prefs: TastePrefs | null,
  input: RecommendInput,
): RecommendResult {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 10;
  const wPop = input.popularityWeight ?? 0.7;
  const pool = candidates.filter((c) => input.powertrains.includes(c.powertrain) && segmentMatches(c, input.segments));

  const inBudget = (min: number, max: number) =>
    pool
      .map((c) => ({ c, trims: affordableTrims(c, min, max, input.includeSubsidy) }))
      .filter((x) => x.trims.length > 0);
  const matched = inBudget(input.minWon, input.maxWon);

  /* ---- 인기: 가장 최근 월 기준 3개월 합계 ---- */
  const valid = popularity.filter((r) => r.salesCount != null && r.salesCount >= 0);
  const anchorIdx = valid.length > 0 ? Math.max(...valid.map((r) => monthIndex(r.period))) : null;
  const recent = anchorIdx == null ? [] : valid.filter((r) => monthIndex(r.period) >= anchorIdx - 2);
  const matchModel = buildMatcher(pool.map((c) => ({ id: c.id, name: c.name, brandName: c.brandName })));

  const salesByModel = new Map<string, number>();
  const unmatchedSales = new Map<string, { name: string; brandName: string | null; sales: number }>();
  for (const r of recent) {
    const id = matchModel(r);
    if (id) salesByModel.set(id, (salesByModel.get(id) ?? 0) + (r.salesCount ?? 0));
    else {
      const key = `${normalizeName(r.brandRaw ?? "")}|${normalizeName(r.modelRaw)}`;
      const prev = unmatchedSales.get(key);
      unmatchedSales.set(key, { name: r.modelRaw, brandName: r.brandRaw, sales: (prev?.sales ?? 0) + (r.salesCount ?? 0) });
    }
  }

  // 후보 안에서의 판매량 순위(동률은 같은 순위)와 백분위 점수
  const withSales = matched.filter((x) => salesByModel.has(x.c.id));
  const sorted = withSales.map((x) => salesByModel.get(x.c.id)!).sort((a, b) => b - a);
  const popOf = (id: string) => {
    const sales = salesByModel.get(id);
    if (sales == null) return null;
    const rank = sorted.findIndex((s) => s === sales) + 1;
    const lower = sorted.filter((s) => s < sales).length;
    const score = sorted.length <= 1 ? 1 : lower / (sorted.length - 1);
    return { sales, rank, of: sorted.length, score };
  };

  /* ---- 점수 계산 ---- */
  const items: RecommendationItem[] = matched.map(({ c, trims }) => {
    const pop = popOf(c.id);
    const taste = tasteScoreOf(c, trims.map((t) => t.trim), prefs);
    const prices = trims.map((t) => t.price);
    const isNew =
      c.launchOn != null && (now.getTime() - new Date(c.launchOn).getTime()) / 86_400_000 <= NEW_MODEL_DAYS;

    let finalScore: number | null;
    if (input.sortMode === "popular") finalScore = pop?.score ?? null;
    else if (input.sortMode === "taste") finalScore = taste;
    else if (pop && taste != null) finalScore = wPop * pop.score + (1 - wPop) * taste;
    else finalScore = pop?.score ?? taste;

    const reasons: string[] = [`예산 안 트림 ${trims.length}개`];
    if (input.includeSubsidy && c.powertrain !== "ice" && trims.some((t) => (t.trim.subsidyEstimate ?? 0) > 0)) {
      reasons.push("보조금 반영 시 예산 안");
    }
    if (pop) reasons.push(`최근 3개월 판매 ${pop.rank}위`);
    if (taste != null) reasons.push(`취향 일치 ${Math.round(taste * 100)}%`);
    if (isNew) reasons.push("신규 출시");

    return {
      modelId: c.id,
      name: c.name,
      brandName: c.brandName,
      powertrain: c.powertrain,
      segment: c.segment,
      coverUrl: c.coverUrl,
      isNew,
      affordable: {
        count: trims.length,
        minWon: Math.min(...prices),
        maxWon: Math.max(...prices),
        trimNames: trims.map((t) => t.trim.name),
      },
      popularity: pop,
      tasteScore: taste,
      finalScore,
      reasons,
    };
  });

  // 점수 내림차순(점수 없는 모델은 뒤로) → 판매량 → 취향 → 낮은 가격 → 이름
  items.sort((a, b) => {
    const fa = a.finalScore ?? -1;
    const fb = b.finalScore ?? -1;
    if (fb !== fa) return fb - fa;
    const sa = a.popularity?.sales ?? -1;
    const sb = b.popularity?.sales ?? -1;
    if (sb !== sa) return sb - sa;
    const ta = a.tasteScore ?? -1;
    const tb = b.tasteScore ?? -1;
    if (tb !== ta) return tb - ta;
    if (a.affordable.minWon !== b.affordable.minWon) return a.affordable.minWon - b.affordable.minWon;
    return `${a.brandName}${a.name}`.localeCompare(`${b.brandName}${b.name}`, "ko");
  });

  /* ---- 가격 정보가 없는 인기 모델 ---- */
  const unpricedIds = new Set(pool.filter((c) => c.trims.every((t) => t.price == null)).map((c) => c.id));
  const missing: RecommendResult["missingPrice"] = [];
  for (const [id, sales] of salesByModel) {
    if (unpricedIds.has(id)) {
      const c = pool.find((x) => x.id === id)!;
      missing.push({ name: c.name, brandName: c.brandName, sales });
    }
  }
  missing.push(...unmatchedSales.values());
  missing.sort((a, b) => b.sales - a.sales);

  /* ---- 예산을 올리면? ---- */
  const bigger = inBudget(input.minWon, input.maxWon + BUDGET_UP_STEP_WON).length;
  const budgetUpSuggestion =
    bigger > matched.length ? { addWon: BUDGET_UP_STEP_WON, extra: bigger - matched.length } : null;

  const hasTasteData = items.some((i) => i.tasteScore != null);
  return {
    items: items.slice(0, limit),
    totalCandidates: matched.length,
    popularityAnchor:
      anchorIdx == null ? null : `${Math.floor(anchorIdx / 12)}-${String((anchorIdx % 12) + 1).padStart(2, "0")}`,
    hasPopularityData: salesByModel.size > 0,
    hasTasteData,
    missingPrice: missing.slice(0, 5),
    budgetUpSuggestion,
  };
}
