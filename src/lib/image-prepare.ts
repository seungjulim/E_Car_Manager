/**
 * 브라우저에서 업로드 전에 사진을 줄이고 WebP 로 바꾼다.
 * 카메라 사진(수 MB)을 그대로 올리지 않아 속도·저장 용량이 줄고, 다시 그리는 과정에서 위치정보(EXIF)도 제거된다.
 */
import { MAX_UPLOAD_BYTES } from "@/lib/image-constants";

export type PreparedImage = {
  blob: Blob;
  type: "image/webp" | "image/jpeg";
  ext: "webp" | "jpg";
  width: number;
  height: number;
};

const MAX_SIDE = 2000;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`'${file.name}'은(는) 열 수 없는 사진이에요. jpg · png · webp 사진을 선택해 주세요.`);
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("이 기기에서는 사진을 처리할 수 없어요.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // 브라우저가 WebP 인코딩을 지원하지 않으면 JPEG 로 대신한다
  const webp = await toBlob(canvas, "image/webp", 0.85);
  const result =
    webp && webp.type === "image/webp"
      ? ({ blob: webp, type: "image/webp", ext: "webp" } as const)
      : await toBlob(canvas, "image/jpeg", 0.88).then((b) => (b ? ({ blob: b, type: "image/jpeg", ext: "jpg" } as const) : null));

  if (!result) throw new Error("사진을 변환하지 못했어요. 다른 사진으로 시도해 주세요.");
  if (result.blob.size > MAX_UPLOAD_BYTES) throw new Error(`'${file.name}'이(가) 너무 커요. (10MB 이하만 가능)`);
  return { ...result, width, height };
}
