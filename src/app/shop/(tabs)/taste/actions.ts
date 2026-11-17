"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { intField } from "@/lib/form-parse";
import { normalizeTaste } from "@/lib/taste";
import { saveTaste } from "@/lib/taste-data";

export type TasteState = { error?: string; saved?: boolean };

const featuresSchema = z.array(z.object({ name: z.string(), weight: z.number() })).max(100);
const budgetField = (label: string) => intField(label, 0, 100_000);

/** 내 취향(선호 차급·중요한 사양·기본 예산)을 저장한다. 파워트레인 선택은 건드리지 않는다 */
export async function saveTasteAction(_prev: TasteState, formData: FormData): Promise<TasteState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "로그인과 가족 선택이 필요해요." };

  let features: z.infer<typeof featuresSchema>;
  try {
    features = featuresSchema.parse(JSON.parse(String(formData.get("features") ?? "[]")));
  } catch {
    return { error: "중요한 사양 입력이 올바르지 않아요. 화면을 새로 고친 뒤 다시 시도해 주세요." };
  }

  const min = budgetField("최소 예산").safeParse(String(formData.get("minMan") ?? ""));
  const max = budgetField("최대 예산").safeParse(String(formData.get("maxMan") ?? ""));
  if (!min.success || !max.success) return { error: (!min.success ? min.error : max.error!).issues[0]?.message ?? "예산을 확인해 주세요." };

  const result = normalizeTaste({
    segments: formData.getAll("segments").map(String),
    features,
    minMan: min.data,
    maxMan: max.data,
  });
  if (!result.ok) return { error: result.error };

  try {
    await saveTaste(getDb(), orgId, userId, result.value);
  } catch (error) {
    console.error("[saveTaste] 저장 실패:", error);
    return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePath("/shop", "layout");
  return { saved: true };
}
