/**
 * 시스템 기본 데이터(org_id = null) 시드. 여러 번 실행해도 안전하다(upsert).
 *
 * 실행:  npx tsx src/db/seed/index.ts
 * 필요:  DATABASE_URL (.env.local 또는 .env 에서 자동으로 읽음)
 *
 * 주의: Neon HTTP 드라이버는 트랜잭션을 지원하지 않으므로 문장 단위로 실행한다.
 *       org_id 가 null 인 행은 유니크 인덱스가 중복을 막지 못하므로(NULL 은 서로 다름)
 *       '조회 후 갱신/삽입' 방식으로 멱등성을 보장한다.
 */
import { existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

// DATABASE_URL 을 읽은 뒤에 db 를 불러온다.
const { getDb, schema } = await import('../index');
const db = getDb();
const { and, eq, isNull } = await import('drizzle-orm');
const { BLUEHANDS_TEMPLATE, inspectionItems } = await import('./data/inspection');
const { maintenancePresets } = await import('./data/maintenance');
const { purchaseCriteria } = await import('./data/purchase');

async function seedInspectionTemplate() {
  const t = schema.inspectionTemplates;
  const found = await db
    .select({ id: t.id })
    .from(t)
    .where(and(isNull(t.orgId), eq(t.name, BLUEHANDS_TEMPLATE.name)))
    .limit(1);

  let templateId = found[0]?.id;
  if (templateId) {
    await db
      .update(t)
      .set({ source: BLUEHANDS_TEMPLATE.source, version: BLUEHANDS_TEMPLATE.version })
      .where(eq(t.id, templateId));
  } else {
    const [row] = await db
      .insert(t)
      .values({ orgId: null, ...BLUEHANDS_TEMPLATE })
      .returning({ id: t.id });
    templateId = row.id;
  }

  const items = schema.inspectionTemplateItems;
  for (const [i, it] of inspectionItems.entries()) {
    // 충돌 시 갱신할 값 (templateId, itemCode 는 충돌 키라서 제외)
    const updatable = {
      category: it.category,
      name: it.name,
      checkType: it.checkType ?? 'status',
      unit: it.unit ?? null,
      powertrains: it.powertrains ?? null,
      sortOrder: i,
      topRank: it.topRank ?? null,
      selfCheckCycle: it.selfCheckCycle ?? null,
      checkMethod: it.checkMethod ?? null,
      verified: it.verified,
    } as const;
    await db
      .insert(items)
      .values({ templateId, itemCode: it.itemCode, ...updatable })
      .onConflictDoUpdate({ target: [items.templateId, items.itemCode], set: updatable });
  }
  return inspectionItems.length;
}

async function seedMaintenancePresets() {
  const t = schema.maintenanceItemPresets;
  for (const p of maintenancePresets) {
    const values = {
      orgId: null,
      itemCode: p.itemCode,
      name: p.name,
      category: p.category,
      powertrains: p.powertrains ?? null,
      defaultIntervalKm: p.defaultIntervalKm ?? null,
      defaultIntervalMonths: p.defaultIntervalMonths ?? null,
      estRank: p.estRank,
      verified: p.verified,
    };
    const found = await db
      .select({ id: t.id })
      .from(t)
      .where(and(isNull(t.orgId), eq(t.itemCode, p.itemCode)))
      .limit(1);
    if (found[0]) await db.update(t).set(values).where(eq(t.id, found[0].id));
    else await db.insert(t).values(values);
  }
  return maintenancePresets.length;
}

async function seedPurchaseCriteria() {
  const t = schema.purchaseCriteriaPresets;
  for (const c of purchaseCriteria) {
    const values = {
      orgId: null,
      code: c.code,
      name: c.name,
      question: c.question,
      powertrains: c.powertrains ?? null,
      extraQuestions: c.extraQuestions ?? null,
      defaultWeight: c.defaultWeight,
      estRank: c.estRank,
    };
    const found = await db
      .select({ id: t.id })
      .from(t)
      .where(and(isNull(t.orgId), eq(t.code, c.code)))
      .limit(1);
    if (found[0]) await db.update(t).set(values).where(eq(t.id, found[0].id));
    else await db.insert(t).values(values);
  }
  return purchaseCriteria.length;
}

const a = await seedInspectionTemplate();
const b = await seedMaintenancePresets();
const c = await seedPurchaseCriteria();
console.log(`시드 완료: 점검 항목 ${a}개, 정비 프리셋 ${b}개, 구입 체크 항목 ${c}개`);
