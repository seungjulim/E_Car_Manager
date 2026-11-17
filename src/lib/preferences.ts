import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Powertrain } from "@/lib/powertrain";

export type PowertrainPreference = { powertrains: Powertrain[]; decided: boolean };

/**
 * 내 파워트레인 선택값. 저장된 값이 없으면 null.
 * DB 가 아직 연결되지 않은 개발 초기에는 null 로 취급해 선택 화면이 보이게 한다.
 */
export async function getPowertrainPreference(orgId: string, userId: string): Promise<PowertrainPreference | null> {
  try {
    const rows = await getDb()
      .select({
        powertrains: schema.preferences.powertrains,
        decided: schema.preferences.powertrainDecided,
      })
      .from(schema.preferences)
      .where(and(eq(schema.preferences.orgId, orgId), eq(schema.preferences.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row || !row.powertrains || row.powertrains.length === 0) return null;
    return { powertrains: row.powertrains, decided: row.decided };
  } catch (error) {
    console.error("[preferences] 파워트레인 선택값을 읽지 못했어요:", error);
    return null;
  }
}
