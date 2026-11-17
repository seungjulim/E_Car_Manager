/** 이미지 관련 상수 (서버·클라이언트 공용: DB·서버 전용 코드를 가져오지 않는다) */

export const IMAGE_KINDS = ["exterior", "interior", "space", "detail", "other"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
export const IMAGE_KIND_LABEL: Record<ImageKind, string> = {
  exterior: "외관",
  interior: "내부",
  space: "실내공간",
  detail: "휠·디테일",
  other: "기타",
};

export const MAX_IMAGES_PER_MODEL = 30;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/** 이 가족·이 모델 전용 Blob 저장 경로 접두어 */
export function blobPrefix(orgId: string, modelId: string) {
  return `catalog/${orgId}/${modelId}/`;
}
