"use server";

import { auth } from "@clerk/nextjs/server";
import { del, put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import {
  addCatalogImage,
  deleteCatalogImage,
  modelBelongsToOrg,
  parseOwnBlobUrl,
  setCoverImage,
} from "@/lib/catalog-images";
import { IMAGE_KINDS, blobPrefix } from "@/lib/image-constants";
import { fetchImageSafely, ImageFetchError } from "@/lib/safe-fetch";

export type ImageActionState = { ok?: boolean; error?: string };

const kindSchema = z.enum(IMAGE_KINDS);
const idSchema = z.uuid();

const REASON_MESSAGE = {
  limit: "이미지는 모델당 최대 30장까지 올릴 수 있어요.",
  model: "이 모델에 이미지를 추가할 수 없어요.",
  trim: "선택한 트림을 찾을 수 없어요.",
} as const;

function refresh(modelId: string) {
  revalidatePath(`/shop/models/${modelId}`);
  revalidatePath(`/shop/models/${modelId}/images`);
  revalidatePath("/shop/explore");
}

/* ------------------------------------------------------------------ */
/* 직접 업로드: 브라우저가 Blob 에 올린 뒤, 올라간 파일을 DB 에 등록한다     */
/* ------------------------------------------------------------------ */

const registerSchema = z.object({
  modelId: idSchema,
  kind: kindSchema,
  url: z.string().max(2000),
  width: z.number().int().positive().max(20000).nullable().optional(),
  height: z.number().int().positive().max(20000).nullable().optional(),
});

export async function registerUploadedImage(input: z.input<typeof registerSchema>): Promise<ImageActionState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "로그인과 가족 선택이 필요해요." };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { error: "이미지 정보가 올바르지 않아요." };
  const { modelId, kind, url, width, height } = parsed.data;

  // 브라우저가 보낸 주소를 그대로 믿지 않고, 우리 저장소의 이 모델 경로인지 확인한다
  const storageKey = parseOwnBlobUrl(url, orgId, modelId);
  if (!storageKey) return { error: "올바르지 않은 이미지 주소예요." };

  try {
    const result = await addCatalogImage(getDb(), orgId, userId, {
      modelId,
      kind,
      url,
      storageKey,
      origin: "upload",
      width,
      height,
    });
    if (!result.ok) {
      // 등록하지 못한 파일은 저장소에 남기지 않는다
      await del(url).catch(() => undefined);
      return { error: REASON_MESSAGE[result.reason] };
    }
  } catch (error) {
    console.error("[registerUploadedImage] 실패:", error);
    return { error: "이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  refresh(modelId);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 이미지 주소(URL) 가져오기: 서버가 안전하게 내려받아 Blob 에 다시 저장      */
/* ------------------------------------------------------------------ */

const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export async function importImageFromUrl(_prev: ImageActionState, formData: FormData): Promise<ImageActionState> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return { error: "로그인과 가족 선택이 필요해요." };

  const parsed = z
    .object({ modelId: idSchema, kind: kindSchema, url: z.string().trim().min(1, "이미지 주소를 입력해 주세요.") })
    .safeParse({ modelId: formData.get("modelId"), kind: formData.get("kind"), url: formData.get("url") });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return { error: msg && /[가-힣]/.test(msg) ? msg : "입력한 내용을 확인해 주세요." };
  }
  const { modelId, kind, url } = parsed.data;

  // 모델 소유 확인을 먼저 해서, 남의 모델에는 외부 요청 자체를 하지 않는다
  const db = getDb();
  try {
    if (!(await modelBelongsToOrg(db, orgId, modelId))) return { error: REASON_MESSAGE.model };
  } catch (error) {
    console.error("[importImageFromUrl] 모델 확인 실패:", error);
    return { error: "이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  let fetched;
  try {
    fetched = await fetchImageSafely(url);
  } catch (error) {
    if (error instanceof ImageFetchError) return { error: error.message };
    console.error("[importImageFromUrl] 가져오기 실패:", error);
    return { error: "이미지를 가져오지 못했어요." };
  }

  let blobUrl: string | null = null;
  try {
    const pathname = `${blobPrefix(orgId, modelId)}${Date.now()}.${EXTENSION[fetched.contentType]}`;
    const blob = await put(pathname, Buffer.from(fetched.bytes), {
      access: "public",
      contentType: fetched.contentType,
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
    const storageKey = parseOwnBlobUrl(blob.url, orgId, modelId) ?? blob.pathname;

    const result = await addCatalogImage(db, orgId, userId, {
      modelId,
      kind,
      url: blob.url,
      storageKey,
      origin: "url",
      sourceUrl: fetched.finalUrl,
    });
    if (!result.ok) {
      await del(blob.url).catch(() => undefined);
      return { error: REASON_MESSAGE[result.reason] };
    }
  } catch (error) {
    console.error("[importImageFromUrl] 저장 실패:", error);
    if (blobUrl) await del(blobUrl).catch(() => undefined);
    return { error: "이미지를 저장하지 못했어요. 저장소(Blob) 설정을 확인해 주세요." };
  }

  refresh(modelId);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 대표 이미지 지정 / 삭제 (폼 버튼용)                                     */
/* ------------------------------------------------------------------ */

export async function makeCoverImage(formData: FormData): Promise<void> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return;
  const imageId = idSchema.safeParse(formData.get("imageId"));
  const modelId = idSchema.safeParse(formData.get("modelId"));
  if (!imageId.success || !modelId.success) return;

  if (await setCoverImage(getDb(), orgId, imageId.data)) refresh(modelId.data);
}

export async function removeImage(formData: FormData): Promise<void> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return;
  const imageId = idSchema.safeParse(formData.get("imageId"));
  const modelId = idSchema.safeParse(formData.get("modelId"));
  if (!imageId.success || !modelId.success) return;

  const removed = await deleteCatalogImage(getDb(), orgId, imageId.data);
  if (removed) {
    // 저장소 파일도 지운다(실패해도 목록에서는 이미 사라짐)
    await del(removed.storageKey).catch((e) => console.error("[removeImage] Blob 삭제 실패:", e));
    refresh(modelId.data);
  }
}
