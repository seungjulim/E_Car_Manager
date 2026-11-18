import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { buildExport, isExportKind, kstToday, loadExportData } from "@/lib/export";

/**
 * 로그인한 가족 구성원이 자기 가족의 기록을 파일로 내려받는다.
 * 다른 가족의 자료는 조회 단계에서 가족(org) 범위로 걸러진다.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return new Response("로그인이 필요해요.", { status: 401 });

  const { kind } = await ctx.params;
  if (!isExportKind(kind)) return new Response("찾을 수 없어요.", { status: 404 });

  try {
    const data = await loadExportData(getDb(), orgId);
    const file = buildExport(kind, data, kstToday());
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="export-${kind}.${file.filename.split(".").pop()}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[export] 실패:", error);
    return new Response("파일을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.", { status: 500 });
  }
}
