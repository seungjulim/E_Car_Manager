import { getDb, schema } from '../index';
import { defaultFeatureCategories } from './data/family';

/**
 * 새 가족(Clerk Organization)이 만들어질 때 호출한다 (예: Clerk webhook `organization.created`).
 * 여러 번 호출해도 중복 생성되지 않는다.
 */
export async function seedFamilyDefaults(orgId: string) {
  await getDb()
    .insert(schema.featureCategories)
    .values(defaultFeatureCategories.map((name, i) => ({ orgId, name, sortOrder: i })))
    .onConflictDoNothing({ target: [schema.featureCategories.orgId, schema.featureCategories.name] });
}
