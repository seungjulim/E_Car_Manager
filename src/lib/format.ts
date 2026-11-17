/** 화면 표시용 서식 함수 (서버·클라이언트 공용) */

/** 원 → "5,000만" */
export function formatManwon(won: number): string {
  return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
}

/** 카드에 표시할 가격 문구: 최저가 기준 "5,000만~" (범위가 없으면 단일 가격, 없으면 미등록) */
export function formatPriceRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "가격 미등록";
  const lo = min ?? max!;
  const hi = max ?? min!;
  return lo === hi ? formatManwon(lo) : `${formatManwon(lo)}~`;
}

/** 한국 시간 기준 "11-16 09:00" 형식. 알림 목록처럼 최근 시각을 짧게 보여 줄 때 쓴다 */
export function formatKstShort(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const kst = new Date(d.getTime() + 9 * 3600_000).toISOString();
  return `${kst.slice(5, 10)} ${kst.slice(11, 16)}`;
}
