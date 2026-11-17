"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { checkNotionConnection, createNotionPort, describeNotionError, notionConfig } from "@/lib/notion";
import { isNotionEntity, saveToNotion } from "@/lib/notion-sync";

export type NotionSaveResult = { ok: true; url: string; replaced: boolean } | { ok: false; error: string; needsSetup?: boolean };

/** 정비 기록·점검 기록·비교를 노션에 저장한다. 이미 저장했다면 새 내용으로 다시 저장한다 */
export async function saveToNotionAction(entityType: string, entityId: string): Promise<NotionSaveResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { ok: false, error: "로그인과 가족 선택이 필요해요." };
  if (!isNotionEntity(entityType) || !z.uuid().safeParse(entityId).success) return { ok: false, error: "저장할 항목을 찾을 수 없어요." };

  const cfg = notionConfig();
  if (!cfg) return { ok: false, needsSetup: true, error: "노션 연동이 아직 설정되지 않았어요." };

  try {
    const r = await saveToNotion(getDb(), orgId, createNotionPort(cfg), entityType, entityId);
    if (!r.ok) return { ok: false, error: r.reason === "notfound" ? "저장할 항목을 찾을 수 없어요." : describeNotionError(r.error) };
    revalidatePath("/cars", "layout");
    revalidatePath("/shop", "layout");
    revalidatePath("/notion");
    return { ok: true, url: r.url, replaced: r.replaced };
  } catch (error) {
    console.error("[saveToNotion] 실패:", error instanceof Error ? error.message : error);
    return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export type NotionCheckResult = { ok: true; botName: string | null } | { ok: false; error: string };

/** 연결 확인(토큰 유효성 + 상위 페이지 접근) */
export async function checkNotionAction(): Promise<NotionCheckResult> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { ok: false, error: "로그인과 가족 선택이 필요해요." };
  const cfg = notionConfig();
  if (!cfg) return { ok: false, error: "NOTION_TOKEN 과 NOTION_PARENT_PAGE_ID 가 설정되지 않았어요." };
  return checkNotionConnection(cfg);
}
