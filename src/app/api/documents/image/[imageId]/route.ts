import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { z } from "zod";
import { getDb } from "@/db";
import { DOCUMENT_IMAGE_TYPES } from "@/lib/document-constants";
import { getImageKey } from "@/lib/documents";

/**
 * 서류 사진은 비공개 저장소에 있어 주소만으로는 볼 수 없다.
 * 로그인한 가족 구성원만 이 경로로 읽을 수 있고, 다른 가족의 이미지 id 는 404 로 답한다.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ imageId: string }> }): Promise<Response> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return new Response("로그인이 필요해요.", { status: 401 });

  const { imageId } = await ctx.params;
  if (!z.uuid().safeParse(imageId).success) return new Response("찾을 수 없어요.", { status: 404 });

  const key = await getImageKey(getDb(), orgId, imageId);
  if (!key) return new Response("찾을 수 없어요.", { status: 404 });

  try {
    const blob = await get(key, { access: "private" });
    if (!blob || blob.statusCode !== 200) return new Response("찾을 수 없어요.", { status: 404 });
    const type = blob.blob.contentType;
    if (!(DOCUMENT_IMAGE_TYPES as readonly string[]).includes(type)) return new Response("지원하지 않는 형식이에요.", { status: 415 });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        // 로그인한 본인 브라우저에만 잠깐 저장(공유 캐시에는 남기지 않는다)
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[documents/image] 읽기 실패:", error);
    return new Response("이미지를 불러오지 못했어요.", { status: 502 });
  }
}
