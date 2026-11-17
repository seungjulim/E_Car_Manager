/** 수리내역서 등 서류 이미지 관련 상수 (서버·클라이언트 공용) */

export const DOCUMENT_KINDS = ["repair_statement", "quote", "service_receipt"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  repair_statement: "수리내역서",
  quote: "견적서",
  service_receipt: "영수증",
};
export const isDocumentKind = (v: unknown): v is DocumentKind => typeof v === "string" && (DOCUMENT_KINDS as readonly string[]).includes(v);

export const MAX_IMAGES_PER_DOCUMENT = 8;
/** Claude 에 한 번에 보내는 최대 장수(비용·속도). 나머지는 보관만 한다 */
export const MAX_AI_IMAGES = 4;

/** 이 가족·이 차량 전용 Blob 저장 경로 접두어 */
export function documentPrefix(orgId: string, vehicleId: string) {
  return `documents/${orgId}/${vehicleId}/`;
}

/** 클라이언트가 알려 준 Blob 경로가 이 가족·차량 전용 경로인지 확인한다 */
export function isOwnDocumentPath(pathname: string, orgId: string, vehicleId: string): boolean {
  return pathname.startsWith(documentPrefix(orgId, vehicleId)) && !pathname.includes("..") && !pathname.includes("//") && !/[\s\\]/.test(pathname) && pathname.length <= 300;
}

export const DOCUMENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** 이미지 열람 주소(로그인·가족 확인 후 비공개 저장소에서 읽어 주는 경로) */
export const documentImageUrl = (imageId: string) => `/api/documents/image/${imageId}`;
