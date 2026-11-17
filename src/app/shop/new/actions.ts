"use server";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { defaultFeatureCategories } from "@/db/seed/data/family";
import {
  aiToDraft,
  draftToRecord,
  MAX_SOURCE_CHARS,
  savePayloadSchema,
  type CarDraft,
} from "@/lib/car-draft";
import { extractCar } from "@/lib/car-extract";
import { saveCarRecord } from "@/lib/car-save";

/** 한글 메시지만 사용자에게 그대로 보여 주고, 라이브러리 기본(영문) 메시지는 일반 문구로 바꾼다 */
function friendlyIssue(message: string | undefined) {
  return message && /[가-힣]/.test(message) ? message : "입력한 내용을 확인해 주세요.";
}

/* ------------------------------------------------------------------ */
/* 1단계: 붙여넣은 자료를 Claude 로 분석                                  */
/* ------------------------------------------------------------------ */

export type AnalyzeState = {
  error?: string;
  draft?: CarDraft;
  notes?: string[];
  rawText?: string;
  sourceUrl?: string;
};

const analyzeInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(30, "자료가 너무 짧아요. 모델·트림·가격이 들어 있는 내용을 붙여넣어 주세요.")
    .max(MAX_SOURCE_CHARS, `자료가 너무 길어요. ${MAX_SOURCE_CHARS.toLocaleString("ko-KR")}자 이하로 나눠서 붙여넣어 주세요.`),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "출처 주소는 http(s)로 시작해야 해요.")
    .optional(),
});

export async function analyzeCarText(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "로그인과 가족 선택이 필요해요." };

  const parsed = analyzeInputSchema.safeParse({
    text: formData.get("text"),
    sourceUrl: formData.get("sourceUrl") ?? "",
  });
  if (!parsed.success) return { error: friendlyIssue(parsed.error.issues[0]?.message) };
  const { text } = parsed.data;
  const sourceUrl = parsed.data.sourceUrl || undefined;

  // 가족이 쓰는 편의사양 카테고리를 Claude 분류 기준으로 전달(없으면 기본값)
  let categories: string[] = [...defaultFeatureCategories];
  try {
    const rows = await getDb()
      .select({ name: schema.featureCategories.name })
      .from(schema.featureCategories)
      .where(eq(schema.featureCategories.orgId, orgId))
      .orderBy(schema.featureCategories.sortOrder);
    if (rows.length > 0) categories = rows.map((r) => r.name);
  } catch {
    // DB 미연결 등: 기본 카테고리로 진행
  }

  const result = await extractCar(text, { categories, sourceUrl });

  // 호출 이력은 부가 정보이므로 실패해도 흐름을 막지 않는다
  try {
    await getDb()
      .insert(schema.aiJobs)
      .values({
        orgId,
        kind: "extract",
        inputRef: "catalog:new",
        status: result.ok ? "done" : "failed",
        result: result.ok ? result.car : null,
        error: result.ok ? null : result.error,
        createdBy: userId,
      });
  } catch {
    /* ignore */
  }

  if (!result.ok) return { error: result.error };
  return { draft: aiToDraft(result.car), notes: result.car.notes, rawText: text, sourceUrl };
}

/* ------------------------------------------------------------------ */
/* 2단계: 확인·수정한 내용을 카탈로그에 저장                                */
/* ------------------------------------------------------------------ */

export type SaveCarState = { error?: string };

export async function saveCar(_prev: SaveCarState, formData: FormData): Promise<SaveCarState> {
  // Server Action 은 직접 POST 로도 호출될 수 있으므로 서버에서 다시 인증·검증한다.
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "로그인과 가족 선택이 필요해요." };

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "저장할 내용을 읽지 못했어요. 다시 시도해 주세요." };
  }

  const parsed = savePayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: friendlyIssue(parsed.error.issues[0]?.message) };

  const converted = draftToRecord(parsed.data.draft);
  if (!converted.ok) return { error: converted.error };

  try {
    await saveCarRecord(getDb(), orgId, converted.record, {
      rawText: parsed.data.rawText,
      sourceUrl: parsed.data.sourceUrl || undefined,
    });
  } catch (error) {
    console.error("[saveCar] 저장 실패:", error);
    return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  redirect("/shop/explore");
}
