"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { powertrainFormSchema, resolvePowertrains } from "@/lib/powertrain";

export type SavePowertrainState = { error?: string };

/** 파워트레인 선택값을 내 취향(preferences)에 저장하고 탐색 화면으로 이동한다. */
export async function savePowertrain(
  _prev: SavePowertrainState,
  formData: FormData,
): Promise<SavePowertrainState> {
  // Server Action 은 직접 POST 로도 호출될 수 있으므로 반드시 서버에서 인증·소속을 확인한다.
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return { error: "로그인과 가족 선택이 필요해요." };
  }

  const parsed = powertrainFormSchema.safeParse({
    groups: formData.getAll("groups"),
    hybridTypes: formData.getAll("hybridTypes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "선택한 내용을 확인해 주세요." };
  }

  const { powertrains, decided } = resolvePowertrains(parsed.data);

  try {
    await getDb()
      .insert(schema.preferences)
      .values({ orgId, userId, powertrains, powertrainDecided: decided })
      .onConflictDoUpdate({
        target: [schema.preferences.orgId, schema.preferences.userId],
        set: { powertrains, powertrainDecided: decided, updatedAt: new Date() },
      });
  } catch (error) {
    console.error("[savePowertrain] 저장 실패:", error);
    return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  redirect("/shop/explore");
}
