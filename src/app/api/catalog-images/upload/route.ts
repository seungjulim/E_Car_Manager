import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { modelBelongsToOrg } from "@/lib/catalog-images";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, blobPrefix } from "@/lib/image-constants";

const payloadSchema = z.object({ modelId: z.uuid() });

/**
 * 브라우저가 Vercel Blob 으로 이미지를 직접 올리기 위한 일회용 토큰을 발급한다.
 * 로그인·가족 소속·모델 소유를 확인하고, 이 모델 전용 경로와 허용 형식·용량으로 제한한다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "로그인과 가족 선택이 필요해요." }, { status: 401 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = payloadSchema.safeParse(JSON.parse(clientPayload ?? "{}"));
        if (!payload.success) throw new Error("모델 정보가 올바르지 않아요.");
        const { modelId } = payload.data;

        if (!(await modelBelongsToOrg(getDb(), orgId, modelId))) throw new Error("이 모델에 이미지를 올릴 수 없어요.");
        if (!pathname.startsWith(blobPrefix(orgId, modelId)) || pathname.includes("..")) {
          throw new Error("저장 경로가 올바르지 않아요.");
        }

        return {
          allowedContentTypes: [...ALLOWED_UPLOAD_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[catalog-images/upload] 토큰 발급 실패:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "업로드를 시작하지 못했어요." }, { status: 400 });
  }
}
