/** 취향 설정: 입력 검증과 정리(DB 없는 순수 로직). 추천 엔진(recommend.ts)이 읽는 모양으로 바꿔 준다 */
import { SEGMENT_OPTIONS } from "@/lib/budget-query";

export const WEIGHT_CHOICES = [
  { value: 1, label: "있으면 좋아요" },
  { value: 3, label: "중요해요" },
  { value: 5, label: "꼭 필요해요" },
] as const;
export const WEIGHT_VALUES: readonly number[] = WEIGHT_CHOICES.map((w) => w.value);

export const MAX_FEATURES = 20;
export const FEATURE_NAME_MAX = 30;
export const BUDGET_MAN_MAX = 100_000; // 10억 원

/**
 * 자주 찾는 사양 예시. 추천은 "사양 이름에 이 글자가 들어 있는지"로 맞추므로
 * 너무 구체적이지 않은 짧은 이름이 잘 맞는다. 목록에 없는 사양은 직접 입력할 수 있다.
 */
export const FEATURE_SUGGESTIONS: { category: string; items: string[] }[] = [
  { category: "안전", items: ["전방충돌방지", "후측방 경고", "후방 교차충돌", "서라운드 뷰", "에어백"] },
  { category: "주행보조", items: ["어댑티브 크루즈", "고속도로 주행보조", "차선 유지", "자동 주차", "원격 주차"] },
  { category: "편의", items: ["통풍시트", "열선 스티어링", "전동 트렁크", "무선 충전", "스마트키", "파노라마 선루프"] },
  { category: "인포테인먼트", items: ["헤드업 디스플레이", "빌트인 캠", "블루투스", "무선 안드로이드 오토", "프리미엄 사운드"] },
  { category: "공간·전기차", items: ["V2L", "히트펌프", "급속충전", "3열 시트", "2열 슬라이딩"] },
];

export type TasteFeature = { name: string; weight: number };

export type TasteInput = {
  segments: string[];
  features: TasteFeature[];
  minMan: number | null;
  maxMan: number | null;
};

export type TasteValue = {
  bodyTypes: string[] | null;
  priorityFeatures: Record<string, number> | null;
  budgetMin: number | null;
  budgetMax: number | null;
};

export type TasteResult = { ok: true; value: TasteValue } | { ok: false; error: string };

/** 사양 이름 비교용 키(공백·대소문자 무시) */
export const featureKey = (name: string) => name.replace(/\s+/g, "").toLowerCase();

const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();

/** 입력을 검증하고 저장 형태로 바꾼다. 같은 사양이 두 번 오면 나중 것이 이긴다 */
export function normalizeTaste(input: TasteInput): TasteResult {
  const segs = [...new Set(input.segments.filter((s) => (SEGMENT_OPTIONS as readonly string[]).includes(s)))];

  const byKey = new Map<string, TasteFeature>();
  for (const f of input.features) {
    const name = cleanName(f.name);
    if (name === "") continue;
    if (name.length > FEATURE_NAME_MAX) return { ok: false, error: `사양 이름은 ${FEATURE_NAME_MAX}자까지 쓸 수 있어요.` };
    if (!WEIGHT_VALUES.includes(f.weight)) return { ok: false, error: `'${name}'의 중요도가 올바르지 않아요.` };
    byKey.set(featureKey(name), { name, weight: f.weight });
  }
  if (byKey.size > MAX_FEATURES) return { ok: false, error: `중요한 사양은 ${MAX_FEATURES}개까지 고를 수 있어요.` };

  const { minMan, maxMan } = input;
  for (const [label, v] of [["최소 예산", minMan], ["최대 예산", maxMan]] as const) {
    if (v != null && (!Number.isInteger(v) || v < 0 || v > BUDGET_MAN_MAX)) return { ok: false, error: `${label}은 0~${BUDGET_MAN_MAX.toLocaleString("ko-KR")}만원 사이의 정수로 입력해 주세요.` };
  }
  if (minMan != null && maxMan != null && minMan > maxMan) return { ok: false, error: "최소 예산이 최대 예산보다 클 수 없어요." };

  return {
    ok: true,
    value: {
      bodyTypes: segs.length > 0 ? segs : null,
      priorityFeatures: byKey.size > 0 ? Object.fromEntries([...byKey.values()].map((f) => [f.name, f.weight])) : null,
      budgetMin: minMan != null ? minMan * 10_000 : null,
      budgetMax: maxMan != null ? maxMan * 10_000 : null,
    },
  };
}

/** 저장된 값을 화면용 입력 모양으로 되돌린다 */
export function toTasteInput(stored: { bodyTypes: string[] | null; priorityFeatures: Record<string, number> | null; budgetMin: number | null; budgetMax: number | null } | null): TasteInput {
  return {
    segments: stored?.bodyTypes ?? [],
    features: Object.entries(stored?.priorityFeatures ?? {})
      .filter(([, w]) => WEIGHT_VALUES.includes(w))
      .map(([name, weight]) => ({ name, weight }))
      .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, "ko")),
    minMan: stored?.budgetMin != null ? Math.round(stored.budgetMin / 10_000) : null,
    maxMan: stored?.budgetMax != null ? Math.round(stored.budgetMax / 10_000) : null,
  };
}

/** 취향이 하나라도 설정돼 있는지(추천 화면 안내용) */
export function hasTaste(v: { bodyTypes: string[] | null; priorityFeatures: Record<string, number> | null } | null): boolean {
  return !!v && ((v.bodyTypes?.length ?? 0) > 0 || Object.keys(v.priorityFeatures ?? {}).length > 0);
}
