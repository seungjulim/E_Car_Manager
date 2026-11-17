import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * 가족(Clerk Organization) 구성원의 표시 이름: userId → 이름.
 * Clerk 를 불러오지 못해도 화면이 깨지지 않도록 빈 객체를 돌려주고, 호출한 쪽에서 '가족 구성원'으로 대신 보여 준다.
 */
export async function getMemberNames(orgId: string): Promise<Record<string, string>> {
  try {
    const client = await clerkClient();
    const { data } = await client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100 });
    const names: Record<string, string> = {};
    for (const m of data) {
      const u = m.publicUserData;
      if (!u?.userId) continue;
      const full = [u.lastName, u.firstName].filter(Boolean).join("") || u.firstName || u.identifier || "";
      if (full) names[u.userId] = full;
    }
    return names;
  } catch (error) {
    console.error("[members] 가족 구성원 이름을 불러오지 못했어요:", error);
    return {};
  }
}

export function displayName(names: Record<string, string>, userId: string, me: string): string {
  if (userId === me) return "나";
  return names[userId] ?? "가족 구성원";
}
