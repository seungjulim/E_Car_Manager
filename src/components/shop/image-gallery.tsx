"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { IMAGE_KINDS, IMAGE_KIND_LABEL, type ImageKind } from "@/lib/image-constants";

export type GalleryImage = { id: string; url: string; kind: ImageKind; caption: string | null };

/** 좌우로 넘겨 보는 이미지 갤러리 + 종류 필터 + 탭하면 크게 보기 */
export function ImageGallery({ images, alt }: { images: GalleryImage[]; alt: string }) {
  const [kind, setKind] = useState<ImageKind | "all">("all");
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<GalleryImage | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const kinds = useMemo(() => IMAGE_KINDS.filter((k) => images.some((i) => i.kind === k)), [images]);
  const visible = useMemo(() => (kind === "all" ? images : images.filter((i) => i.kind === kind)), [images, kind]);

  if (images.length === 0) {
    return (
      <div className="grid aspect-[16/10] place-items-center rounded-xl border border-dashed border-line bg-soft text-sm text-muted">
        등록된 이미지가 없어요
      </div>
    );
  }

  function selectKind(next: ImageKind | "all") {
    setKind(next);
    setIndex(0);
    scroller.current?.scrollTo({ left: 0 });
  }

  function openZoom(img: GalleryImage) {
    setZoom(img);
    dialogRef.current?.showModal();
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-xl bg-soft [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={`${alt} 이미지 갤러리`}
        >
          {visible.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => openZoom(img)}
              className="relative aspect-[16/10] w-full shrink-0 snap-center"
              aria-label={`${IMAGE_KIND_LABEL[img.kind]} 이미지 ${i + 1} 크게 보기`}
            >
              <Image
                src={img.url}
                alt={img.caption ?? `${alt} ${IMAGE_KIND_LABEL[img.kind]}`}
                fill
                sizes="(max-width: 448px) 100vw, 448px"
                className="object-cover"
                priority={i === 0}
              />
            </button>
          ))}
        </div>
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
          {Math.min(index + 1, visible.length)} / {visible.length}
        </span>
      </div>

      {visible.length > 1 && (
        <div className="flex justify-center gap-1.5" aria-hidden>
          {visible.map((img, i) => (
            <span key={img.id} className={`size-1.5 rounded-full ${i === index ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
      )}

      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="이미지 종류">
          <KindChip active={kind === "all"} onClick={() => selectKind("all")} label={`전체 ${images.length}`} />
          {kinds.map((k) => (
            <KindChip
              key={k}
              active={kind === k}
              onClick={() => selectKind(k)}
              label={`${IMAGE_KIND_LABEL[k]} ${images.filter((i) => i.kind === k).length}`}
            />
          ))}
        </div>
      )}

      {/* 크게 보기 */}
      <dialog
        ref={dialogRef}
        onClose={() => setZoom(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
        className="m-0 h-dvh max-h-none w-dvw max-w-none bg-black p-0 backdrop:bg-black"
      >
        {zoom && (
          <div className="relative h-full w-full">
            <Image src={zoom.url} alt={zoom.caption ?? alt} fill sizes="100vw" className="object-contain" />
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/60 text-lg text-white"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}

function KindChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
      }`}
    >
      {label}
    </button>
  );
}
