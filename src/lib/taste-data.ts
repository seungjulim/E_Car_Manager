/** 취향 저장·조회(DB). 모든 쿼리는 가족(org)과 사용자 범위로 한정한다 */
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/catalog";
import { featureKey, type TasteValue } from "@/lib/taste";

const { preferences, catalogTrims } = schema;

/** 취향 항목만 저장한다. 파워트레인 선택값은 건드리지 않는다 */
export async function saveTaste(db: Db, orgId: string, userId: string, v: TasteValue): Promise<void> {
  const set = { bodyTypes: v.bodyTypes, priorityFeatures: v.priorityFeatures, budgetMin: v.budgetMin, budgetMax: v.budgetMax };
  await db
    .insert(preferences)
    .values({ orgId, userId, ...set })
    .onConflictDoUpdate({ target: [preferences.orgId, preferences.userId], set: { ...set, updatedAt: new Date() } });
}

/** 우리 가족 카탈로그의 트림들에 자주 나오는 사양 이름(많이 나온 순). 취향 선택지로 보여 준다 */
export async function listCatalogFeatureNames(db: Db, orgId: string, limit = 24): Promise<string[]> {
  const rows = await db.select({ features: catalogTrims.features }).from(catalogTrims).where(eq(catalogTrims.orgId, orgId));
  const count = new Map<string, { name: string; n: number }>();
  for (const r of rows) {
    const seen = new Set<string>();
    const groups = r.features && typeof r.features === "object" ? Object.values(r.features as Record<string, unknown>) : [];
    for (const g of groups) {
      if (!Array.isArray(g)) continue;
      for (const item of g) {
        if (typeof item !== "string") continue;
        const name = item.replace(/\s+/g, " ").trim();
        const key = featureKey(name);
        if (name === "" || name.length > 30 || seen.has(key)) continue;
        seen.add(key);
        const cur = count.get(key);
        if (cur) cur.n += 1;
        else count.set(key, { name, n: 1 });
      }
    }
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "ko"))
    .slice(0, limit)
    .map((x) => x.name);
}

/** 이 사용자의 취향이 저장돼 있는지 확인용으로 한 번에 읽기 */
export async function loadTasteRow(db: Db, orgId: string, userId: string) {
  const [row] = await db
    .select({ bodyTypes: preferences.bodyTypes, priorityFeatures: preferences.priorityFeatures, budgetMin: preferences.budgetMin, budgetMax: preferences.budgetMax })
    .from(preferences)
    .where(and(eq(preferences.orgId, orgId), eq(preferences.userId, userId)))
    .limit(1);
  return row ?? null;
}
