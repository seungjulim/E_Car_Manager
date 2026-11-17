import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { ImageManager } from "@/components/shop/image-manager";
import { getDb } from "@/db";
import { getModelDetail, type ModelDetail } from "@/lib/model-detail";

export const metadata: Metadata = { title: "이미지 추가·관리" };

export default function ModelImagesPage(props: PageProps<"/shop/models/[id]/images">) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <ImagesContent params={props.params} />
    </Suspense>
  );
}

async function ImagesContent({ params }: { params: PageProps<"/shop/models/[id]/images">["params"] }) {
  const [{ userId, orgId }, { id }] = await Promise.all([auth(), params]);
  if (!userId || !orgId) redirect("/");
  if (!z.uuid().safeParse(id).success) notFound();

  let detail: ModelDetail | null;
  try {
    detail = await getModelDetail(getDb(), orgId, id);
  } catch (error) {
    console.error("[model images] 불러오기 실패:", error);
    return (
      <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        이미지 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }
  if (!detail) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/shop/models/${detail.id}`} className="inline-block text-sm text-muted">
        ‹ {detail.brandName} {detail.name}
      </Link>
      <h1 className="text-xl font-bold">이미지 추가·관리</h1>
      <ImageManager
        modelId={detail.id}
        orgId={orgId}
        images={detail.images.map((i) => ({
          id: i.id,
          url: i.url,
          kind: i.kind,
          isCover: i.isCover,
          origin: i.origin,
          sourceUrl: i.sourceUrl,
        }))}
      />
    </div>
  );
}
