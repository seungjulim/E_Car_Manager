/** 구입 전 체크 TOP 10: 항목별 상태·점수와 가중 총점 계산(순수 함수, 서버·클라이언트 공용) */

export type CheckStatus = "todo" | "ok" | "issue";
export const CHECK_STATUSES = ["todo", "ok", "issue"] as const;
export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  todo: "확인 전",
  ok: "확인함",
  issue: "문제 있음",
};

export type CheckValue = { status: CheckStatus; score: number | null; note: string | null };
export type CriterionLite = { code: string; defaultWeight: number };

export type ScoreSummary = {
  /** 점수를 매긴 항목들의 가중 평균(1~5). 점수가 하나도 없으면 null */
  score: number | null;
  /** 점수를 매긴 항목 수 */
  scored: number;
  /** '확인함' 항목 수 */
  confirmed: number;
  /** '문제 있음' 항목 수 */
  issues: number;
  total: number;
};

export const MIN_WEIGHT = 1;
export const MAX_WEIGHT = 5;

/**
 * 가중 총점 = Σ(중요도 × 점수) ÷ Σ(중요도). 점수를 매긴 항목만 계산에 넣는다(아직 안 본 항목이 점수를 깎지 않음).
 * 중요도는 사용자가 정한 값이 있으면 그것을, 없으면 기본 중요도를 쓴다.
 */
export function weightedScore(
  criteria: CriterionLite[],
  checks: Record<string, CheckValue | undefined>,
  weights: Record<string, number | undefined>,
): ScoreSummary {
  let sum = 0;
  let weightSum = 0;
  let scored = 0;
  let confirmed = 0;
  let issues = 0;

  for (const c of criteria) {
    const check = checks[c.code];
    if (!check) continue;
    if (check.status === "ok") confirmed += 1;
    if (check.status === "issue") issues += 1;
    if (check.score != null) {
      const w = clampWeight(weights[c.code] ?? c.defaultWeight);
      sum += w * check.score;
      weightSum += w;
      scored += 1;
    }
  }
  return { score: weightSum > 0 ? sum / weightSum : null, scored, confirmed, issues, total: criteria.length };
}

export function clampWeight(w: number): number {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(w)));
}
