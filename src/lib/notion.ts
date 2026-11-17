import "server-only";
import { APIResponseError, Client } from "@notionhq/client";
import type { NotionPort } from "@/lib/notion-sync";
import { parseNotionId } from "@/lib/notion-pages";

/** 환경변수 NOTION_TOKEN(통합 토큰)과 NOTION_PARENT_PAGE_ID(저장할 상위 페이지)가 모두 있어야 쓸 수 있다 */
export function notionConfig(): { token: string; parentId: string } | null {
  const token = process.env.NOTION_TOKEN?.trim();
  const parentId = parseNotionId(process.env.NOTION_PARENT_PAGE_ID);
  return token && parentId ? { token, parentId } : null;
}

/** 노션 오류를 사용자가 고칠 수 있는 한국어 안내로 바꾼다. 토큰 등 비밀값은 포함하지 않는다 */
export function describeNotionError(error: unknown): string {
  if (error instanceof APIResponseError) {
    switch (error.code) {
      case "unauthorized":
        return "노션 토큰이 올바르지 않아요. NOTION_TOKEN 을 확인해 주세요.";
      case "object_not_found":
      case "restricted_resource":
        return "노션 페이지를 찾을 수 없어요. 상위 페이지의 ⋯ 메뉴 → 연결(Connections)에서 이 통합을 추가했는지 확인해 주세요.";
      case "rate_limited":
        return "노션 요청이 많아 잠시 막혔어요. 잠시 후 다시 시도해 주세요.";
      case "validation_error":
        return "노션이 내용을 받아들이지 못했어요. 내용이 너무 길거나 형식이 맞지 않을 수 있어요.";
      default:
        return `노션 오류가 났어요. (${error.code})`;
    }
  }
  return "노션에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.";
}

export function createNotionPort(cfg: { token: string; parentId: string }): NotionPort {
  const client = new Client({ auth: cfg.token });
  return {
    async createPage({ title, markdown }) {
      const page = await client.pages.create({
        parent: { page_id: cfg.parentId },
        properties: { title: { title: [{ text: { content: title } }] } },
        markdown,
      });
      return { id: page.id };
    },
    async trashPage(id) {
      await client.pages.update({ page_id: id, in_trash: true });
    },
  };
}

/** 연결 확인: 토큰이 유효한지, 상위 페이지에 접근할 수 있는지 */
export async function checkNotionConnection(cfg: { token: string; parentId: string }): Promise<{ ok: true; botName: string | null } | { ok: false; error: string }> {
  try {
    const client = new Client({ auth: cfg.token });
    const me = await client.users.me({});
    await client.pages.retrieve({ page_id: cfg.parentId });
    return { ok: true, botName: me.name ?? null };
  } catch (error) {
    return { ok: false, error: describeNotionError(error) };
  }
}
