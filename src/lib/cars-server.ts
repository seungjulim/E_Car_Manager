import "server-only";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { getVehicle, type VehicleRow } from "@/lib/cars";

/** 로그인과 가족 선택을 확인한다. 없으면 홈으로 보낸다 */
export async function requireOrg(): Promise<{ userId: string; orgId: string }> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) redirect("/");
  return { userId, orgId };
}

/** 이 가족의 차량인지 확인한다. id 형식이 틀리거나 남의 차량·삭제된 차량이면 404 */
export async function requireVehicle(id: string): Promise<{ userId: string; orgId: string; vehicle: VehicleRow }> {
  const ctx = await requireOrg();
  if (!z.uuid().safeParse(id).success) notFound();
  const vehicle = await getVehicle(getDb(), ctx.orgId, id);
  if (!vehicle) notFound();
  return { ...ctx, vehicle };
}

/** 쿼리 문자열에서 첫 값만 꺼낸다 */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
