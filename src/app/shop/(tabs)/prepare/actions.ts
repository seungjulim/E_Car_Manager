"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { resetWeights, setWeight, upsertCheck } from "@/lib/purchase";
import { CHECK_STATUSES, MAX_WEIGHT, MIN_WEIGHT } from "@/lib/purchase-score";

export type PrepareActionResult = { ok: true } | { ok: false; error: string };

const NEED_LOGIN = { ok: false, error: "로그인과 가족 선택이 필요해요." } as const;
const FAILED = { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." } as const;

const checkSchema = z.object({
  wishlistId: z.uuid(),
  criteriaCode: z.string().min(1).max(40),
  status: z.enum(CHECK_STATUSES).optional(),
  score: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(500, "메모는 500자까지 적을 수 있어요.").nullable().optional(),
});

/** 후보 하나의 체크 항목 상태·점수·메모 저장(보낸 필드만 갱신) */
export async function saveCheckAction(input: z.input<typeof checkSchema>): Promise<PrepareActionResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NEED_LOGIN;

  const parsed = checkSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return { ok: false, error: msg && /[가-힣]/.test(msg) ? msg : "입력한 내용을 확인해 주세요." };
  }

  try {
    const result = await upsertCheck(getDb(), orgId, userId, parsed.data);
    if (!result.ok) {
      const error =
        result.reason === "wishlist"
          ? "내 관심 목록의 후보만 체크할 수 있어요."
          : result.reason === "criteria"
            ? "알 수 없는 체크 항목이에요."
            : "바꿀 내용이 없어요.";
      return { ok: false, error };
    }
    revalidatePath("/shop/prepare");
    revalidatePath("/shop/compare");
    return { ok: true };
  } catch (error) {
    console.error("[saveCheck] 실패:", error);
    return FAILED;
  }
}

const weightSchema = z.object({
  criteriaCode: z.string().min(1).max(40),
  weight: z.number().int().min(MIN_WEIGHT).max(MAX_WEIGHT),
});

/** 항목 중요도(1~5) 저장 */
export async function setWeightAction(input: z.input<typeof weightSchema>): Promise<PrepareActionResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NEED_LOGIN;

  const parsed = weightSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "중요도는 1~5 사이로 정해 주세요." };

  try {
    const ok = await setWeight(getDb(), orgId, userId, parsed.data.criteriaCode, parsed.data.weight);
    if (!ok) return { ok: false, error: "알 수 없는 체크 항목이에요." };
    revalidatePath("/shop/prepare");
    revalidatePath("/shop/compare");
    return { ok: true };
  } catch (error) {
    console.error("[setWeight] 실패:", error);
    return FAILED;
  }
}

/** 중요도를 기본값으로 되돌리기 */
export async function resetWeightsAction(): Promise<PrepareActionResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NEED_LOGIN;
  try {
    await resetWeights(getDb(), orgId, userId);
    revalidatePath("/shop/prepare");
    revalidatePath("/shop/compare");
    return { ok: true };
  } catch (error) {
    console.error("[resetWeights] 실패:", error);
    return FAILED;
  }
}
