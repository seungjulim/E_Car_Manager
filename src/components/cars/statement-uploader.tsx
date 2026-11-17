"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createDocumentAction } from "@/app/cars/(tabs)/statement-actions";
import { DOCUMENT_KIND_LABEL, DOCUMENT_KINDS, documentPrefix, MAX_IMAGES_PER_DOCUMENT, type DocumentKind } from "@/lib/document-constants";
import { prepareImage } from "@/lib/image-prepare";

/** 사진 촬영·앨범 선택 → 줄이고 WebP 로 변환 → 비공개 저장소에 업로드 → 서류 만들기 */
export function StatementUploader({
  vehicleId,
  orgId,
  defaultKind = "repair_statement",
  quoteId,
  redirectTo,
  lockKind = false,
}: {
  vehicleId: string;
  orgId: string;
  defaultKind?: DocumentKind;
  /** 있으면 올린 사진을 이 견적의 견적서로 연결하고, 서류 종류는 '견적서'로 고정한다 */
  quoteId?: string;
  /** 업로드가 끝난 뒤 이동할 앱 안 경로(기본: 서류 화면) */
  /** 이동 경로에 {id} 가 있으면 방금 만든 서류 id 로 바꿔 넣는다 */
  redirectTo?: string;
  /** 서류 종류를 바꾸지 못하게 한다 */
  lockKind?: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<DocumentKind>(quoteId ? "quote" : defaultKind);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError("");
    const next = [...files, ...Array.from(list)];
    if (next.length > MAX_IMAGES_PER_DOCUMENT) setError(`사진은 최대 ${MAX_IMAGES_PER_DOCUMENT}장까지 올릴 수 있어요.`);
    setFiles(next.slice(0, MAX_IMAGES_PER_DOCUMENT));
    if (cameraRef.current) cameraRef.current.value = "";
    if (albumRef.current) albumRef.current.value = "";
  }

  async function submit() {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const uploaded: { pathname: string; width: number; height: number }[] = [];
      const stamp = Date.now();
      for (const [i, file] of files.entries()) {
        setProgress(`사진 ${i + 1}/${files.length} 올리는 중…`);
        const prepared = await prepareImage(file);
        const blob = await upload(`${documentPrefix(orgId, vehicleId)}${stamp}-${i}.${prepared.ext}`, prepared.blob, {
          access: "private",
          handleUploadUrl: "/api/documents/upload",
          clientPayload: JSON.stringify({ vehicleId }),
          contentType: prepared.type,
        });
        uploaded.push({ pathname: blob.pathname, width: prepared.width, height: prepared.height });
      }
      setProgress("저장하는 중…");
      const result = await createDocumentAction({ vehicleId, kind, images: uploaded, ...(quoteId ? { quoteId } : {}) });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      router.push(redirectTo && redirectTo.startsWith("/cars/") ? redirectTo.replace("{id}", result.id) : `/cars/vehicles/${vehicleId}/statements/${result.id}`);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.message ? e.message : "사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!quoteId && !lockKind && (
      <fieldset className="space-y-2">
        <legend className="mb-1 block text-xs text-muted">서류 종류</legend>
        <div className="flex flex-wrap gap-2">
          {DOCUMENT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 text-sm ${kind === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
            >
              {DOCUMENT_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} className="min-h-14 rounded-xl border border-line bg-surface font-semibold disabled:opacity-40">
          📷 사진 찍기
        </button>
        <button type="button" onClick={() => albumRef.current?.click()} disabled={busy} className="min-h-14 rounded-xl border border-line bg-surface font-semibold disabled:opacity-40">
          🖼 앨범·스크린샷
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
      <input ref={albumRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />

      {files.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-line bg-surface p-3 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {i + 1}. {f.name}
              </span>
              <button type="button" disabled={busy} onClick={() => setFiles(files.filter((_, n) => n !== i))} className="shrink-0 text-xs text-bad disabled:opacity-40">
                빼기
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">글자가 잘 보이게 밝은 곳에서 서류 전체를 찍어 주세요. 여러 장이면 순서대로 올려 주세요. 사진은 줄여서(위치정보 제거) 우리 가족만 볼 수 있게 저장해요.</p>

      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {busy && progress && (
        <p role="status" className="text-sm text-muted">
          {progress}
        </p>
      )}
      <button type="button" onClick={submit} disabled={busy || files.length === 0} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40">
        {busy ? "올리는 중…" : files.length === 0 ? "사진을 먼저 선택해 주세요" : `${files.length}장 올리기`}
      </button>
    </div>
  );
}
