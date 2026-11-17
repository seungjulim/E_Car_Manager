"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { MAX_SOURCE_CHARS } from "@/lib/car-draft";
import {
  aiToPopularityDraft,
  draftToPopularityRecord,
  popularitySavePayloadSchema,
  type PopularityDraft,
} from "@/lib/popularity";
import { extractPopularity } from "@/lib/popularity-extract";
import { savePopularity } from "@/lib/popularity-save";

function friendlyIssue(message: string | undefined) {
  return message && /[가-힣]/.test(message) ? message : "입력한 내용을 확인해 주세요.";
}

/* ------------------------------------------------------------------ */
/* 1단계: 붙여넣은 판매 순위 자료를 Claude 로 분석                         */
/* ------------------------------------------------------------------ */

export type AnalyzePopularityState = {
  error?: string;
  draft?: PopularityDraft;
  notes?: string[];
  sourceUrl?: string;
};

const analyzeSchema = z.object({
  text: z
    .string()
    .trim()
    .min(30, "자료가 너무 짧아요. 모델별 판매량이 들어 있는 표나 기사를 붙여넣어 주세요.")
    .max(MAX_SOURCE_CHARS, `자료가 너무 길어요. ${MAX_SOURCE_CHARS.toLocaleString("ko-KR")}자 이하로 나눠서 붙여넣어 주세요.`),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "출처 주소는 http(s)로 시작해야 해요.")
    .optional(),
});

export async function analyzePopularity(_prev: AnalyzePopularityState, formData: FormData): Promise<AnalyzePopularityState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "로그인과 가족 선택이 필요해요." };

  const parsed = analyzeSchema.safeParse({ text: formData.get("text"), sourceUrl: formData.get("sourceUrl") ?? "" });
  if (!parsed.success) return { error: friendlyIssue(parsed.error.issues[0]?.message) };
  const sourceUrl = parsed.data.sourceUrl || undefined;

  const result = await extractPopularity(parsed.data.text, { sourceUrl });
  if (!result.ok) return { error: result.error };

  return { draft: aiToPopularityDraft(result.data), notes: result.data.notes, sourceUrl };
}

/* ------------------------------------------------------------------ */
/* 2단계: 확인·수정한 판매 자료 저장                                      */
/* ------------------------------------------------------------------ */

export type SavePopularityState = { error?: string };

export async function savePopularityAction(_prev: SavePopularityState, formData: FormData): Promise<SavePopularityState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "로그인과 가족 선택이 필요해요." };

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "저장할 내용을 읽지 못했어요. 다시 시도해 주세요." };
  }
  const parsed = popularitySavePayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: friendlyIssue(parsed.error.issues[0]?.message) };

  const converted = draftToPopularityRecord(parsed.data.draft);
  if (!converted.ok) return { error: converted.error };

  try {
    await savePopularity(getDb(), orgId, userId, converted.record, { sourceUrl: parsed.data.sourceUrl || undefined });
  } catch (error) {
    console.error("[savePopularity] 저장 실패:", error);
    return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/shop/budget/result");
  redirect("/shop/budget");
}
