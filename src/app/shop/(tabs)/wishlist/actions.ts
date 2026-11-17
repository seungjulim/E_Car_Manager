"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { addToWishlist, removeWishlistByTrim, removeWishlistEntry, updateWishlistEntry } from "@/lib/wishlist";
import { WISHLIST_STATUSES } from "@/lib/wishlist-constants";

export type WishlistActionResult = { ok: true; id?: string } | { ok: false; error: string };

const idSchema = z.uuid();
const NEED_LOGIN = { ok: false, error: "로그인과 가족 선택이 필요해요." } as const;
const FAILED = { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." } as const;

function refresh() {
  revalidatePath("/shop/wishlist");
  revalidatePath("/shop/compare");
}

/** 관심 추가(트림 단위) */
export async function addWishlist(trimId: string): Promise<WishlistActionResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NEED_LOGIN;
  if (!idSchema.safeParse(trimId).success) return { ok: false, error: "트림 정보가 올바르지 않아요." };

  try {
    const result = await addToWishlist(getDb(), orgId, userId, trimId);
    if (!result.ok) {
      return {
        ok: false,
        error: result.reason === "limit" ? "관심 목록은 100개까지 담을 수 있어요." : "이 트림을 찾을 수 없어요.",
      };
    }
    refresh();
    return { ok: true, id: result.id };
  } catch (error) {
    console.error("[addWishlist] 실패:", error);
    return FAILED;
  }
}

/** 트림으로 관심 해제(모델 상세의 하트) */
export async function removeWishlistByTrimAction(trimId: string): Promise<WishlistActionResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NEED_LOGIN;
  if (!idSchema.safeParse(trimId).success) return { ok: false, error: "트림 정보가 올바르지 않아요." };

  try {
    await removeWishlistByTrim(getDb(), orgId, userId, trimId);
    refresh();
    return { ok: true };
  } catch (error) {
    console.error("[removeWishlistByTrim] 실패:", error);
    return FAILED;
  }
}

const patchSchema = z.object({
  id: idSchema,
  rating: z.number().int().min(1).max(5).nullable().optional(),
  status: z.enum(WISHLIST_STATUSES).optional(),
  memo: z.string().max(500, "메모는 500자까지 적을 수 있어요.").nullable().optional(),
});

/** 내 별점·상태·메모 수정 */
export async function updateWishlistAction(input: z.input<typeof patchSchema>): Promise<WishlistActionResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NEED_LOGIN;

  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return { ok: false, error: msg && /[가-힣]/.test(msg) ? msg : "입력한 내용을 확인해 주세요." };
  }
  const { id, ...patch } = parsed.data;

  try {
    const ok = await updateWishlistEntry(getDb(), orgId, userId, id, patch);
    if (!ok) return { ok: false, error: "내 관심 항목만 수정할 수 있어요." };
    refresh();
    return { ok: true };
  } catch (error) {
    console.error("[updateWishlist] 실패:", error);
    return FAILED;
  }
}

/** 내 관심 항목 삭제 */
export async function removeWishlistAction(id: string): Promise<WishlistActionResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return NEED_LOGIN;
  if (!idSchema.safeParse(id).success) return { ok: false, error: "항목 정보가 올바르지 않아요." };

  try {
    const ok = await removeWishlistEntry(getDb(), orgId, userId, id);
    if (!ok) return { ok: false, error: "내 관심 항목만 삭제할 수 있어요." };
    refresh();
    return { ok: true };
  } catch (error) {
    console.error("[removeWishlist] 실패:", error);
    return FAILED;
  }
}
