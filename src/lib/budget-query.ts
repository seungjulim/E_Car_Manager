/** 예산 추천 화면의 검색 조건 ↔ URL 쿼리. 서버·클라이언트 공용(DB 접근 없음). */
import { z } from "zod";
import { POWERTRAINS, type Powertrain } from "@/lib/powertrain";
import type { SortMode } from "@/lib/recommend";

export const SEGMENT_OPTIONS = ["경형", "소형", "준중형", "중형", "대형", "SUV", "MPV"] as const;
export const SORT_LABEL: Record<SortMode, string> = {
  popular: "인기순",
  taste: "가족 취향순",
  combined: "종합",
};
export const BUDGET_PRESETS = [
  { label: "~3천만", min: 0, max: 3000 },
  { label: "3~4천만", min: 3000, max: 4000 },
  { label: "4~5천만", min: 4000, max: 5000 },
  { label: "5~6천만", min: 5000, max: 6000 },
  { label: "6천만~", min: 6000, max: 15000 },
] as const;

export const MAX_BUDGET_MAN = 100_000; // 10억

/** 화면과 주소에서 쓰는 조건(금액은 만원 단위) */
export type BudgetCondition = {
  minMan: number;
  maxMan: number;
  subsidy: boolean;
  powertrains: Powertrain[];
  segments: string[];
  sort: SortMode;
};

export const DEFAULT_CONDITION: BudgetCondition = {
  minMan: 3000,
  maxMan: 5000,
  subsidy: true,
  powertrains: [...POWERTRAINS],
  segments: [],
  sort: "popular",
};

const list = (v: unknown) =>
  typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

const querySchema = z.object({
  min: z.coerce.number().int().min(0).max(MAX_BUDGET_MAN),
  max: z.coerce.number().int().min(0).max(MAX_BUDGET_MAN),
  sub: z.enum(["0", "1"]).default("1"),
  pt: z.string().optional(),
  seg: z.string().optional(),
  sort: z.enum(["popular", "taste", "combined"]).default("popular"),
});

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** URL 쿼리 → 조건. 예산이 없거나 잘못되면 null(호출한 쪽에서 입력 화면으로 보냄) */
export function parseBudgetQuery(params: RawParams): BudgetCondition | null {
  const parsed = querySchema.safeParse({
    min: first(params.min),
    max: first(params.max),
    sub: first(params.sub),
    pt: first(params.pt),
    seg: first(params.seg),
    sort: first(params.sort),
  });
  if (!parsed.success) return null;
  const q = parsed.data;

  const pts = list(q.pt).filter((p): p is Powertrain => (POWERTRAINS as readonly string[]).includes(p));
  const segs = list(q.seg)
    .filter((s) => (SEGMENT_OPTIONS as readonly string[]).includes(s))
    .slice(0, SEGMENT_OPTIONS.length);
  return {
    minMan: Math.min(q.min, q.max),
    maxMan: Math.max(q.min, q.max),
    subsidy: q.sub === "1",
    powertrains: pts.length > 0 ? [...new Set(pts)] : [...POWERTRAINS],
    segments: [...new Set(segs)],
    sort: q.sort,
  };
}

export function toBudgetQuery(c: BudgetCondition): string {
  const p = new URLSearchParams();
  p.set("min", String(c.minMan));
  p.set("max", String(c.maxMan));
  p.set("sub", c.subsidy ? "1" : "0");
  p.set("pt", c.powertrains.join(","));
  if (c.segments.length > 0) p.set("seg", c.segments.join(","));
  p.set("sort", c.sort);
  return p.toString();
}

/** 만원 → 원 */
export const manToWon = (man: number) => man * 10_000;
