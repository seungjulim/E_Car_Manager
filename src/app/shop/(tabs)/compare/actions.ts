"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { MAX_COMPARE } from "@/lib/compare";
import { deleteComparison, saveComparison } from "@/lib/wishlist";

export type SaveComparisonState = { error?: string };

const saveSchema = z.object({
  title: z.string().trim().min(1, "비교 이름을 입력해 주세요.").max(60, "이름은 60자까지 쓸 수 있어요."),
  trimIds: z.array(z.uuid()).min(2, "2대 이상 비교할 때 저장할 수 있어요.").max(MAX_COMPARE),
});

/** 지금 보고 있는 비교를 저장해 가족과 다시 볼 수 있게 한다 */
export async function saveComparisonAction(_prev: SaveComparisonState, formData: FormData): Promise<SaveComparisonState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "로그인과 가족 선택이 필요해요." };

  const parsed = saveSchema.safeParse({ title: formData.get("title"), trimIds: formData.getAll("trimId") });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return { error: msg && /[가-힣]/.test(msg) ? msg : "입력한 내용을 확인해 주세요." };
  }

  try {
    const result = await saveComparison(getDb(), orgId, userId, parsed.data.title, parsed.data.trimIds);
    if (!result.ok) {
      return { error: result.reason === "count" ? "2~4대를 골라 주세요." : "비교할 차량을 찾을 수 없어요." };
    }
  } catch (error) {
    console.error("[saveComparison] 실패:", error);
    return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/shop/compare");
  redirect("/shop/compare");
}

/** 저장한 비교 삭제(폼 버튼용) */
export async function deleteComparisonAction(formData: FormData): Promise<void> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  try {
    await deleteComparison(getDb(), orgId, id.data);
  } catch (error) {
    console.error("[deleteComparison] 실패:", error);
    return;
  }
  revalidatePath("/shop/compare");
}
