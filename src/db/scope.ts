import { and, eq, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * 모든 가족 데이터 쿼리는 현재 활성 Clerk Organization 으로 한정한다.
 *
 * 사용 예:
 *   db.select().from(vehicles).where(inOrg(vehicles.orgId, orgId, isNull(vehicles.deletedAt)))
 */
export function inOrg(orgIdColumn: AnyPgColumn, orgId: string, ...extra: (SQL | undefined)[]) {
  if (!orgId) throw new Error('활성 가족(organization)이 없습니다.');
  return and(eq(orgIdColumn, orgId), ...extra);
}
