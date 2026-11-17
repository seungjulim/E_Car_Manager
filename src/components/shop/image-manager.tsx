"use client";

import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import {
  importImageFromUrl,
  makeCoverImage,
  registerUploadedImage,
  removeImage,
  type ImageActionState,
} from "@/app/shop/(tabs)/models/actions";
import {
  IMAGE_KINDS,
  IMAGE_KIND_LABEL,
  MAX_IMAGES_PER_MODEL,
  blobPrefix,
  type ImageKind,
} from "@/lib/image-constants";
import { prepareImage } from "@/lib/image-prepare";

export type ManagedImage = {
  id: string;
  url: string;
  kind: ImageKind;
  isCover: boolean;
  origin: "upload" | "url";
  sourceUrl: string | null;
};

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";

export function ImageManager({
  modelId,
  orgId,
  images,
}: {
  modelId: string;
  orgId: string;
  images: ManagedImage[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ImageKind>("exterior");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const [urlState, urlAction, urlPending] = useActionState<ImageActionState, FormData>(importImageFromUrl, {});
  const remaining = MAX_IMAGES_PER_MODEL - images.length;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, Math.max(0, remaining));
    const problems: string[] = [];
    if (files.length > list.length) problems.push(`이미지는 모델당 ${MAX_IMAGES_PER_MODEL}장까지라서 ${list.length}장만 올려요.`);

    setBusy(true);
    setErrors([]);
    setDone(0);
    let success = 0;

    for (const [i, file] of list.entries()) {
      setProgress(`${i + 1} / ${list.length} 올리는 중…`);
      try {
        const prepared = await prepareImage(file);
        const pathname = `${blobPrefix(orgId, modelId)}${Date.now()}-${i}.${prepared.ext}`;
        const blob = await upload(pathname, prepared.blob, {
          access: "public",
          handleUploadUrl: "/api/catalog-images/upload",
          clientPayload: JSON.stringify({ modelId }),
          contentType: prepared.type,
        });
        const result = await registerUploadedImage({
          modelId,
          kind,
          url: blob.url,
          width: prepared.width,
          height: prepared.height,
        });
        if (result.error) problems.push(`${file.name}: ${result.error}`);
        else success += 1;
      } catch (error) {
        problems.push(error instanceof Error ? error.message : `${file.name}: 업로드하지 못했어요.`);
      }
    }

    setBusy(false);
    setProgress("");
    setErrors(problems);
    setDone(success);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* 이미지 종류 (업로드·URL 공통) */}
      <section className="space-y-2">
        <h2 className="font-bold">추가할 이미지 종류</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="이미지 종류">
          {IMAGE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                kind === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
              }`}
            >
              {IMAGE_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          지금 {images.length}장 · 최대 {MAX_IMAGES_PER_MODEL}장
        </p>
      </section>

      {/* 직접 업로드 */}
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-bold">사진 올리기</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy || remaining <= 0}
            onClick={() => cameraInput.current?.click()}
            className="min-h-12 rounded-xl border border-line font-semibold disabled:opacity-40"
          >
            📷 촬영하기
          </button>
          <button
            type="button"
            disabled={busy || remaining <= 0}
            onClick={() => fileInput.current?.click()}
            className="min-h-12 rounded-xl border border-line font-semibold disabled:opacity-40"
          >
            🖼 앨범에서 선택
          </button>
        </div>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-xs text-muted">jpg · png · webp, 사진당 10MB 이하. 올리기 전에 자동으로 크기를 줄이고 위치정보를 지워요.</p>
        {busy && (
          <p role="status" className="rounded-lg bg-soft px-3 py-2 text-sm">
            {progress}
          </p>
        )}
        {!busy && done > 0 && errors.length === 0 && (
          <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
            {done}장을 올렸어요.
          </p>
        )}
        {errors.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      {/* 이미지 주소로 가져오기 */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-bold">이미지 주소로 가져오기</h2>
        <form action={urlAction} className="space-y-3">
          <input type="hidden" name="modelId" value={modelId} />
          <input type="hidden" name="kind" value={kind} />
          <label className="block">
            <span className="mb-1 block text-xs text-muted">이미지 주소 (https://…)</span>
            <input name="url" type="url" inputMode="url" required placeholder="https://example.com/car.jpg" className={inputCls} />
          </label>
          {urlState.error && (
            <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              {urlState.error}
            </p>
          )}
          {urlState.ok && !urlPending && (
            <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
              이미지를 가져와 저장했어요.
            </p>
          )}
          <button
            type="submit"
            disabled={urlPending || remaining <= 0}
            className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
          >
            {urlPending ? "가져오는 중…" : "가져와서 저장"}
          </button>
          <p className="text-xs text-muted">
            주소의 이미지를 서버가 내려받아 저장해요(원본 사이트에서 사라져도 유지). 직접 올린 사진이나 사용이 허용된 이미지만 쓰고,
            출처 주소는 함께 기록돼요.
          </p>
        </form>
      </section>

      {/* 등록된 이미지 */}
      <section className="space-y-2">
        <h2 className="font-bold">등록된 이미지 {images.length > 0 && <span className="text-sm font-normal text-muted">{images.length}장</span>}</h2>
        {images.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">아직 이미지가 없어요.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {images.map((img) => (
              <li key={img.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="relative aspect-[4/3] bg-soft">
                  <Image src={img.url} alt={`${IMAGE_KIND_LABEL[img.kind]} 이미지`} fill sizes="(max-width: 448px) 50vw, 220px" className="object-cover" />
                  {img.isCover && (
                    <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">대표</span>
                  )}
                </div>
                <div className="space-y-2 p-2">
                  <p className="text-xs text-muted">
                    {IMAGE_KIND_LABEL[img.kind]} · {img.origin === "url" ? "주소로 가져옴" : "직접 업로드"}
                  </p>
                  <div className="flex gap-2">
                    {!img.isCover && (
                      <form action={makeCoverImage} className="flex-1">
                        <input type="hidden" name="imageId" value={img.id} />
                        <input type="hidden" name="modelId" value={modelId} />
                        <button type="submit" className="min-h-9 w-full rounded-lg border border-line text-xs">
                          대표로
                        </button>
                      </form>
                    )}
                    <form
                      action={removeImage}
                      className="flex-1"
                      onSubmit={(e) => {
                        if (!window.confirm("이 이미지를 삭제할까요?")) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="imageId" value={img.id} />
                      <input type="hidden" name="modelId" value={modelId} />
                      <button type="submit" className="min-h-9 w-full rounded-lg border border-line text-xs text-bad">
                        삭제
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
