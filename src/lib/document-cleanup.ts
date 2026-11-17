import "server-only";
import type { Db } from "@/lib/catalog";
import { deleteBlobs } from "@/lib/document-blob";
import { deleteDocument } from "@/lib/documents";

/** 서류와 저장소의 사진 파일을 함께 지운다(이미 없는 서류는 건너뜀) */
export async function removeDocuments(db: Db, orgId: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const keys = await deleteDocument(db, orgId, id);
    if (keys) await deleteBlobs(keys);
  }
}
