/**
 * 판매 순위(인기) 자료: Claude 추출 스키마, 편집용 초안, 저장 입력 검증.
 * 서버·클라이언트 공용 순수 코드(서버 전용 호출은 popularity-extract.ts / popularity-save.ts).
 */
import { z } from "zod";
import { normalizeName } from "@/lib/recommend";

export const MAX_POPULARITY_ROWS = 200;

/* ---------- 1) Claude 가 돌려주는 구조 ---------- */
export const popularityAiSchema = z.object({
  /** 판매 집계 월 "YYYY-MM". 자료에서 알 수 없으면 null */
  period: z.string().nullable(),
  rows: z.array(
    z.object({
      brand: z.string().nullable(),
      model: z.string(),
      salesCount: z.number().int().nullable(),
      rank: z.number().int().nullable(),
    }),
  ),
  notes: z.array(z.string()),
});
export type PopularityAi = z.infer<typeof popularityAiSchema>;

/* ---------- 2) 화면 편집용 초안 ---------- */
export type PopularityRowDraft = { brand: string; model: string; sales: string; rank: string };
export type PopularityDraft = { period: string; rows: PopularityRowDraft[] };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonth = (s: string) => MONTH_RE.test(s);

export function aiToPopularityDraft(ai: PopularityAi): PopularityDraft {
  return {
    period: ai.period && isMonth(ai.period.trim()) ? ai.period.trim() : "",
    rows: ai.rows
      .filter((r) => r.model.trim() !== "")
      .slice(0, MAX_POPULARITY_ROWS)
      .map((r) => ({
        brand: r.brand?.trim() ?? "",
        model: r.model.trim(),
        sales: r.salesCount == null ? "" : String(r.salesCount),
        rank: r.rank == null ? "" : String(r.rank),
      })),
  };
}

/* ---------- 3) 저장 입력 검증 ---------- */
const text = (max: number) => z.string().trim().max(max);

export const popularityDraftSchema = z.object({
  period: z.string().trim().refine(isMonth, "집계 월을 선택해 주세요."),
  rows: z
    .array(
      z.object({
        brand: text(60),
        model: text(80).min(1, "모델명이 비어 있는 행이 있어요."),
        sales: text(12),
        rank: text(6),
      }),
    )
    .min(1, "저장할 행이 없어요.")
    .max(MAX_POPULARITY_ROWS, `한 번에 ${MAX_POPULARITY_ROWS}행까지만 저장할 수 있어요.`),
});

export const popularitySavePayloadSchema = z.object({
  draft: popularityDraftSchema,
  sourceUrl: z.string().max(2000).optional(),
});

export type PopularityRecord = {
  period: string; // YYYY-MM-01
  rows: { brandRaw: string | null; modelRaw: string; salesCount: number | null; rankOverall: number | null }[];
};

const toInt = (s: string): number | null | undefined => {
  const t = s.replace(/[,\s]/g, "").replace(/(대|위)$/, "");
  if (t === "") return null;
  return /^\d+$/.test(t) && Number(t) <= 100_000_000 ? Number(t) : undefined;
};

/** 검증된 초안 → DB 값. 같은 브랜드·모델이 중복되면 판매량을 합친다 */
export function draftToPopularityRecord(
  draft: z.infer<typeof popularityDraftSchema>,
): { ok: true; record: PopularityRecord } | { ok: false; error: string } {
  const merged = new Map<string, PopularityRecord["rows"][number]>();
  for (const [i, r] of draft.rows.entries()) {
    const sales = toInt(r.sales);
    const rank = toInt(r.rank);
    if (sales === undefined) return { ok: false, error: `${i + 1}번째 행(${r.model}): 판매량을 숫자로 입력해 주세요.` };
    if (rank === undefined) return { ok: false, error: `${i + 1}번째 행(${r.model}): 순위를 숫자로 입력해 주세요.` };

    const key = `${normalizeName(r.brand)}|${normalizeName(r.model)}`;
    const prev = merged.get(key);
    if (prev) {
      prev.salesCount = prev.salesCount == null && sales == null ? null : (prev.salesCount ?? 0) + (sales ?? 0);
      prev.rankOverall = prev.rankOverall ?? rank;
    } else {
      merged.set(key, { brandRaw: r.brand || null, modelRaw: r.model, salesCount: sales, rankOverall: rank });
    }
  }
  return { ok: true, record: { period: `${draft.period}-01`, rows: [...merged.values()] } };
}
