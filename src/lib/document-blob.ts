import "server-only";
import { del, get } from "@vercel/blob";
import { DOCUMENT_IMAGE_TYPES, DOCUMENT_MAX_BYTES } from "@/lib/document-constants";
import type { StatementImage } from "@/lib/statement-extract";

const isAllowedType = (t: string): t is (typeof DOCUMENT_IMAGE_TYPES)[number] => (DOCUMENT_IMAGE_TYPES as readonly string[]).includes(t);

/** 비공개 Blob 이미지를 읽어 Claude 에 보낼 base64 로 바꾼다. 형식·용량이 맞지 않으면 null */
export async function loadStatementImage(pathname: string): Promise<StatementImage | null> {
  const res = await get(pathname, { access: "private" });
  if (!res || res.statusCode !== 200) return null;
  const type = res.blob.contentType;
  if (!isAllowedType(type) || res.blob.size > DOCUMENT_MAX_BYTES) return null;
  const bytes = Buffer.from(await new Response(res.stream).arrayBuffer());
  // Claude 이미지 한도(약 5MB)를 넘는 사진은 보내지 않는다
  if (bytes.byteLength > 5 * 1024 * 1024) return null;
  return { mediaType: type, base64: bytes.toString("base64") };
}

/** 삭제된 서류의 이미지를 Blob 에서 지운다(실패해도 서류 삭제 자체는 유지) */
export async function deleteBlobs(pathnames: string[]): Promise<void> {
  if (pathnames.length === 0) return;
  try {
    await del(pathnames);
  } catch (error) {
    console.error("[deleteBlobs] Blob 삭제 실패(고아 파일이 남을 수 있어요):", error);
  }
}
