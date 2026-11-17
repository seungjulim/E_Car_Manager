/** 수리 견적: 거리 계산, 최저가 TOP 10 정렬, 견적 요청 문자 초안(DB 없는 순수 로직) */

export const MAX_RADIUS_KM = 40;
export const TOP_N = 10;

export type LatLng = { lat: number; lng: number };

export const isLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90;
export const isLng = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180;

/** 두 지점 사이의 직선거리(km, Haversine). 소수 첫째 자리까지 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371.0088;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}

export type ShopType = "official" | "general" | "specialist";
export const SHOP_TYPE_LABEL: Record<ShopType, string> = { official: "공식·블루핸즈", general: "일반 정비소", specialist: "전문점" };
export type QuoteSource = "phone" | "document" | "manual";
export const SOURCE_LABEL: Record<QuoteSource | "api", string> = { phone: "전화 견적", document: "견적서", manual: "가족 입력", api: "연동" };
export const PART_PREF_LABEL = { any: "상관없음", genuine: "순정 부품", oem: "OEM 인증 부품" } as const;

export type QuoteView = {
  id: string;
  shopId: string;
  shopName: string;
  shopType: ShopType;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  totalAmount: number;
  partsAmount: number | null;
  laborAmount: number | null;
  taxAmount: number | null;
  partType: string | null;
  warrantyMonths: number | null;
  validUntil: string | null;
  source: QuoteSource | "api";
  note: string | null;
  createdAt: string;
  /** 첨부한 견적서(서류) id와 첫 사진 id, 사진 수. 없으면 null / 0 */
  documentId: string | null;
  documentImageId: string | null;
  documentImageCount: number;
};

export type RankedQuote = QuoteView & { distanceKm: number | null; rank: number | null };
export type SortMode = "price" | "distance" | "warranty";
export const SORT_LABEL: Record<SortMode, string> = { price: "최저가순", distance: "가까운 순", warranty: "보증 긴 순" };
export const isSortMode = (v: unknown): v is SortMode => v === "price" || v === "distance" || v === "warranty";

export type RankOptions = { origin: LatLng | null; radiusKm: number; sort: SortMode; officialOnly: boolean; shopTypes?: ShopType[] | null; today: string };
export type RankResult = {
  ranked: RankedQuote[]; // 순위가 매겨진 최대 10곳
  more: number; // 순위권 밖이지만 조건에 맞는 견적 수
  outside: RankedQuote[]; // 반경 밖
  expired: RankedQuote[]; // 유효기간 지남
  filtered: number; // 정비소 유형 조건 때문에 빠진 견적 수
};

/**
 * 견적을 조건에 맞게 걸러 TOP 10 으로 만든다.
 * - 정비소당 가장 싼 견적 하나만 순위에 넣는다(같은 곳 견적 여러 개가 순위를 채우지 않게).
 * - 유효기간이 지난 견적, 반경(최대 40km) 밖 견적은 순위에서 빼고 따로 돌려준다.
 * - 정비소 위치나 내 위치를 모르면 거리는 null 로 두고 순위에는 넣는다.
 */
export function rankQuotes(quotes: QuoteView[], opts: RankOptions): RankResult {
  const radius = Math.min(Math.max(opts.radiusKm, 1), MAX_RADIUS_KM);
  const withDist: RankedQuote[] = quotes.map((q) => ({
    ...q,
    distanceKm: opts.origin && q.lat != null && q.lng != null ? distanceKm(opts.origin, { lat: q.lat, lng: q.lng }) : null,
    rank: null,
  }));

  const allowedTypes = opts.officialOnly ? (["official"] as ShopType[]) : opts.shopTypes && opts.shopTypes.length > 0 ? opts.shopTypes : null;
  const typed = allowedTypes ? withDist.filter((q) => allowedTypes.includes(q.shopType)) : withDist;
  const filtered = withDist.length - typed.length;

  const expired = typed.filter((q) => q.validUntil != null && q.validUntil < opts.today);
  const live = typed.filter((q) => !(q.validUntil != null && q.validUntil < opts.today));
  const outside = live.filter((q) => q.distanceKm != null && q.distanceKm > radius);
  const inside = live.filter((q) => !(q.distanceKm != null && q.distanceKm > radius));

  // 정비소당 최저가 하나
  const best = new Map<string, RankedQuote>();
  for (const q of inside) {
    const cur = best.get(q.shopId);
    if (!cur || q.totalAmount < cur.totalAmount || (q.totalAmount === cur.totalAmount && q.createdAt > cur.createdAt)) best.set(q.shopId, q);
  }
  const price = (a: RankedQuote, b: RankedQuote) => a.totalAmount - b.totalAmount;
  // 거리를 모르는 견적은 맨 뒤로
  const dist = (a: RankedQuote, b: RankedQuote) => (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER);
  // 보증이 긴 쪽이 앞, 보증 정보가 없으면 맨 뒤
  const warr = (a: RankedQuote, b: RankedQuote) => (b.warrantyMonths ?? -1) - (a.warrantyMonths ?? -1);
  const byName = (a: RankedQuote, b: RankedQuote) => a.shopName.localeCompare(b.shopName, "ko");
  const order = opts.sort === "distance" ? [dist, price, warr] : opts.sort === "warranty" ? [warr, price, dist] : [price, dist, warr];
  const cmp = (a: RankedQuote, b: RankedQuote): number => {
    for (const f of order) {
      const d = f(a, b);
      if (d !== 0) return d;
    }
    return byName(a, b);
  };
  const sorted = [...best.values()].sort(cmp);
  const ranked = sorted.slice(0, TOP_N).map((q, i) => ({ ...q, rank: i + 1 }));
  return {
    ranked,
    more: Math.max(0, sorted.length - TOP_N),
    outside: outside.sort((a, b) => a.totalAmount - b.totalAmount),
    expired: expired.sort((a, b) => a.totalAmount - b.totalAmount),
    filtered,
  };
}

/** 한 견적의 부품·공임·부가세 합이 총액과 맞는지(입력 실수 확인용). 일부만 입력했으면 확인 불가(null) */
export function breakdownMatches(q: Pick<QuoteView, "totalAmount" | "partsAmount" | "laborAmount" | "taxAmount">): boolean | null {
  if (q.partsAmount == null || q.laborAmount == null) return null;
  return q.partsAmount + q.laborAmount + (q.taxAmount ?? 0) === q.totalAmount;
}

/** 견적을 받지 못한 정비소에 보낼 문자 초안 */
export function smsDraft(input: { vehicle: string; item: string; description: string | null; partPref: keyof typeof PART_PREF_LABEL }): string {
  const lines = [
    "안녕하세요. 수리 견적 문의드립니다.",
    `차량: ${input.vehicle}`,
    `수리 내용: ${input.item}${input.description ? ` (${input.description})` : ""}`,
    `부품: ${PART_PREF_LABEL[input.partPref]}`,
    "부품·공임 포함 총 금액과 보증 기간을 알려 주실 수 있을까요?",
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* 견적 대비 실제 금액                                                    */
/* ------------------------------------------------------------------ */

export type QuoteDiff = {
  /** 실제 − 견적 (원). 음수면 견적보다 적게 냈다 */
  diff: number;
  kind: "saved" | "extra" | "same";
  /** 견적 대비 변동률(%), 소수 첫째 자리. 견적이 0이면 null */
  percent: number | null;
};

/** 견적과 실제 지불 금액을 비교한다. 둘 중 하나라도 없으면 null */
export function compareToQuote(quoteAmount: number | null | undefined, actual: number | null | undefined): QuoteDiff | null {
  if (quoteAmount == null || actual == null || !Number.isFinite(quoteAmount) || !Number.isFinite(actual)) return null;
  const diff = actual - quoteAmount;
  return {
    diff,
    kind: diff < 0 ? "saved" : diff > 0 ? "extra" : "same",
    percent: quoteAmount > 0 ? Math.round((diff / quoteAmount) * 1000) / 10 : null,
  };
}

/** "견적보다 20,000원 절약(-5.7%)" 같은 한 줄 문구. 금액 표기는 호출한 쪽 함수를 쓴다 */
export function quoteDiffText(d: QuoteDiff, fmt: (n: number) => string): string {
  if (d.kind === "same") return "견적과 같은 금액이에요";
  const abs = fmt(Math.abs(d.diff));
  const pct = d.percent != null ? ` (${d.percent > 0 ? "+" : ""}${d.percent}%)` : "";
  return d.kind === "saved" ? `견적보다 ${abs} 절약${pct}` : `견적보다 ${abs} 추가${pct}`;
}
