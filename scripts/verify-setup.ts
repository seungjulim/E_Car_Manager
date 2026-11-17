/**
 * 실제 키로 설정이 맞는지 한 번에 확인한다. 값은 절대 출력하지 않고 통과/실패만 보여 준다.
 *
 * 실행:  npm run verify            (모든 항목)
 *        npm run verify -- --skip-ai          (Claude 호출 건너뛰기: 비용 거의 없지만 끌 수 있음)
 *        npm run verify -- --base-url https://내-배포-주소   (배포된 서버의 크론 경로도 확인)
 *
 * 이 스크립트가 하는 일 (외부에 남기는 흔적은 아래뿐이다):
 *  - Neon: SELECT 만 실행(테이블·시드 확인). 데이터를 바꾸지 않는다.
 *  - Clerk: 사용자 수·조직 목록 조회(읽기).
 *  - Vercel Blob: healthcheck/ 아래에 아주 작은 비공개 파일을 올렸다가 읽고 바로 지운다.
 *  - Claude: 아주 짧은 요청 1~2번(이미지 1×1 포함). 몇 원 미만.
 *  - 푸시: 키 형식만 검사(실제 푸시는 보내지 않는다).
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

type Result = { name: string; ok: boolean | "skip"; detail: string };
const results: Result[] = [];
const args = new Set(process.argv.slice(2));
const baseUrlIdx = process.argv.indexOf("--base-url");
const baseUrl = baseUrlIdx > -1 ? process.argv[baseUrlIdx + 1] : null;

function record(name: string, ok: boolean | "skip", detail: string) {
  results.push({ name, ok, detail });
  const mark = ok === "skip" ? "⏭ " : ok ? "✅" : "❌";
  console.log(`${mark} ${name} — ${detail}`);
}

/** 오류 메시지에서 키·비밀번호가 새지 않게 한다 */
function safe(error: unknown): string {
  let msg = error instanceof Error ? error.message : String(error);
  // Clerk 처럼 메시지가 비고 상세가 errors 배열에 들어 있는 오류도 읽을 수 있게 한다
  const extra = error as { status?: number; errors?: { longMessage?: string; message?: string }[] };
  if (extra?.errors?.[0]) msg = `${msg ? `${msg} · ` : ""}${extra.errors[0].longMessage ?? extra.errors[0].message ?? ""}`;
  if (extra?.status) msg = `[${extra.status}] ${msg}`;
  if (!msg.trim()) msg = error instanceof Error ? error.name : "알 수 없는 오류";
  for (const key of ["DATABASE_URL", "CLERK_SECRET_KEY", "BLOB_READ_WRITE_TOKEN", "ANTHROPIC_API_KEY", "VAPID_PRIVATE_KEY", "CRON_SECRET", "NOTION_TOKEN"]) {
    const v = process.env[key];
    if (v && v.length > 6) msg = msg.split(v).join(`<${key}>`);
  }
  return msg.slice(0, 300);
}

const has = (k: string) => !!process.env[k] && process.env[k]!.trim() !== "";

async function checkEnv() {
  const required = ["DATABASE_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "BLOB_READ_WRITE_TOKEN", "ANTHROPIC_API_KEY", "CRON_SECRET", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  const missing = required.filter((k) => !has(k));
  record("환경변수", missing.length === 0, missing.length === 0 ? "필요한 값이 모두 있어요" : `비어 있음: ${missing.join(", ")}`);
}

async function checkDb() {
  if (!has("DATABASE_URL")) return record("Neon DB", "skip", "DATABASE_URL 이 없어요");
  try {
    const { neon } = await import("@neondatabase/serverless");
    const { is, getTableName } = await import("drizzle-orm");
    const { PgTable } = await import("drizzle-orm/pg-core");
    const schema = await import("../src/db/schema");
    const sql = neon(process.env.DATABASE_URL!);
    await sql.query("select 1");
    record("Neon DB 연결", true, "연결됐어요");

    const expected: string[] = [];
    for (const v of Object.values(schema)) {
      if (is(v, PgTable)) expected.push(getTableName(v as InstanceType<typeof PgTable>));
    }
    const rows = (await sql.query("select table_name from information_schema.tables where table_schema = 'public'")) as { table_name: string }[];
    const have = new Set(rows.map((r) => r.table_name));
    const missing = expected.filter((t) => !have.has(t));
    record("DB 테이블", missing.length === 0, missing.length === 0 ? `${expected.length}개 모두 있어요` : `없는 테이블 ${missing.length}개(${missing.slice(0, 5).join(", ")}…) → npm run db:generate && npm run db:migrate`);

    if (missing.length === 0) {
      const count = async (t: string) => Number(((await sql.query(`select count(*)::int as n from ${t}`)) as { n: number }[])[0].n);
      const seeds = { inspection_template_items: await count("inspection_template_items"), maintenance_item_presets: await count("maintenance_item_presets"), purchase_criteria_presets: await count("purchase_criteria_presets") };
      const empty = Object.entries(seeds).filter(([, n]) => n === 0).map(([t]) => t);
      record("시드 데이터", empty.length === 0, empty.length === 0 ? `점검 항목 ${seeds.inspection_template_items}개 · 정비 프리셋 ${seeds.maintenance_item_presets}개 · 구입 체크 ${seeds.purchase_criteria_presets}개` : `비어 있음: ${empty.join(", ")} → npm run db:seed`);
    }
  } catch (e) {
    record("Neon DB", false, safe(e));
  }
}

async function checkClerk() {
  if (!has("CLERK_SECRET_KEY")) return record("Clerk", "skip", "CLERK_SECRET_KEY 가 없어요");
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  const pkEnv = pk.startsWith("pk_live_") ? "live" : pk.startsWith("pk_test_") ? "test" : null;
  const skEnv = sk.startsWith("sk_live_") ? "live" : sk.startsWith("sk_test_") ? "test" : null;
  if (!pkEnv || !skEnv) record("Clerk 키 형식", false, "pk_test_/pk_live_ · sk_test_/sk_live_ 로 시작해야 해요");
  else if (pkEnv !== skEnv) record("Clerk 키 짝", false, `공개키는 ${pkEnv}, 비밀키는 ${skEnv} 라서 서로 다른 환경이에요`);
  else record("Clerk 키 형식", true, `${pkEnv} 환경 키 한 쌍이에요`);
  try {
    const { createClerkClient } = await import("@clerk/backend");
    const clerk = createClerkClient({ secretKey: sk });
    const users = await clerk.users.getCount();
    record("Clerk 인증", true, `비밀키가 유효해요 (사용자 ${users}명)`);
    try {
      const orgs = await clerk.organizations.getOrganizationList({ limit: 1 });
      record("Clerk Organizations", true, `가족(조직) 기능이 켜져 있어요 (현재 ${orgs.totalCount}개)`);
    } catch (e) {
      record("Clerk Organizations", false, `조직 기능을 쓸 수 없어요: Clerk 대시보드 > Organizations 를 켜세요 (${safe(e)})`);
    }
  } catch (e) {
    record("Clerk 인증", false, safe(e));
  }
}

async function checkBlob() {
  if (!has("BLOB_READ_WRITE_TOKEN")) return record("Vercel Blob", "skip", "BLOB_READ_WRITE_TOKEN 이 없어요");
  const pathname = `healthcheck/${randomUUID()}.txt`;
  try {
    const { put, get, del } = await import("@vercel/blob");
    await put(pathname, "ok", { access: "private", contentType: "text/plain", addRandomSuffix: false });
    record("Blob 비공개 업로드", true, "access: private 로 올릴 수 있어요");
    const res = await get(pathname, { access: "private" });
    const text = res && res.statusCode === 200 ? await new Response(res.stream).text() : null;
    record("Blob 비공개 읽기", text === "ok", text === "ok" ? "토큰으로 다시 읽을 수 있어요(서류 사진 열람 경로와 같은 방식)" : "올린 파일을 읽지 못했어요");
    await del(pathname);
    record("Blob 삭제", true, "정리했어요");
  } catch (e) {
    record("Vercel Blob", false, `${safe(e)} (스토어가 'private' 접근을 지원하는지, 토큰이 맞는지 확인하세요)`);
    try {
      const { del } = await import("@vercel/blob");
      await del(pathname);
    } catch {
      /* 올라가지 않았다면 지울 것도 없다 */
    }
  }
}

async function checkAnthropic() {
  if (args.has("--skip-ai")) return record("Claude API", "skip", "--skip-ai 로 건너뛰었어요");
  if (!has("ANTHROPIC_API_KEY")) return record("Claude API", "skip", "ANTHROPIC_API_KEY 가 없어요");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
    const { z } = await import("zod");
    const client = new Anthropic();
    // 앱이 쓰는 호출 모양 그대로(구조화 출력 + 이미지 + 대체 모델 베타)로 아주 작은 요청을 보낸다
    const schema = z.object({ answer: z.string(), sawImage: z.boolean() });
    const png1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const r = await client.beta.messages.parse({
      model,
      max_tokens: 200,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: png1x1 } },
            { type: "text", text: "이 이미지가 보이면 sawImage 를 true 로, answer 에는 '확인'이라고 답하세요." },
          ],
        },
      ],
    });
    const ok = r.stop_reason !== "refusal" && !!r.parsed_output;
    record("Claude 구조화 출력·이미지", ok, ok ? `모델 ${model} 로 이미지+구조화 출력이 동작해요 (앱의 차량 추출·내역서·견적서 읽기와 같은 호출 방식)` : `응답을 해석하지 못했어요 (stop_reason: ${r.stop_reason})`);
  } catch (e) {
    record("Claude API", false, `${safe(e)} (모델 이름 ${model}, 베타 옵션이 계정에서 허용되는지 확인하세요. 필요하면 ANTHROPIC_MODEL 로 바꿀 수 있어요)`);
  }
}

async function checkPush() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "";
  if (!pub || !priv) return record("Web Push(VAPID)", "skip", "VAPID 키가 없어요 → npx web-push generate-vapid-keys");
  try {
    const decode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const pubLen = decode(pub).length;
    const privLen = decode(priv).length;
    if (pubLen !== 65 || privLen !== 32) return record("Web Push(VAPID)", false, `키 길이가 달라요(공개 ${pubLen}B/비공개 ${privLen}B, 기대: 65/32)`);
    if (!/^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/.test(subject)) return record("Web Push(VAPID)", false, "VAPID_SUBJECT 는 mailto:메일주소 또는 https:// 주소여야 해요");
    const webpush = await import("web-push");
    webpush.setVapidDetails(subject, pub, priv);
    record("Web Push(VAPID)", true, "키 형식이 맞아요 (실제 푸시는 설정 화면의 '시험 알림'으로 확인하세요)");
  } catch (e) {
    record("Web Push(VAPID)", false, safe(e));
  }
}

async function checkNotion() {
  const token = process.env.NOTION_TOKEN?.trim();
  const raw = process.env.NOTION_PARENT_PAGE_ID ?? "";
  if (!token && !raw) return record("노션", "skip", "선택 기능이에요. 쓰려면 NOTION_TOKEN, NOTION_PARENT_PAGE_ID 를 넣어 주세요");
  const { parseNotionId } = await import("../src/lib/notion-pages");
  const parentId = parseNotionId(raw);
  if (!token) return record("노션", false, "NOTION_TOKEN 이 비어 있어요");
  if (!parentId) return record("노션", false, "NOTION_PARENT_PAGE_ID 에서 32자리 페이지 id 를 찾지 못했어요(페이지 주소 전체를 붙여 넣어도 돼요)");
  try {
    const { Client } = await import("@notionhq/client");
    const client = new Client({ auth: token });
    const me = await client.users.me({});
    record("노션 토큰", true, `통합 '${me.name ?? "이름 없음"}' 으로 인증됐어요`);
    await client.pages.retrieve({ page_id: parentId });
    record("노션 상위 페이지", true, "페이지에 접근할 수 있어요(저장 버튼을 쓸 수 있어요)");
  } catch (e) {
    record("노션", false, `${safe(e)} (상위 페이지의 ⋯ → 연결(Connections)에 이 통합을 추가했는지 확인하세요)`);
  }
}

async function checkCron() {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return record("Cron 비밀값", "skip", "CRON_SECRET 이 없어요");
  record("Cron 비밀값", secret.length >= 16, secret.length >= 16 ? "충분히 길어요" : "16자 이상으로 만들어 주세요");
  if (!baseUrl) return record("배포된 크론 경로", "skip", "--base-url https://내-주소 를 주면 확인해요");
  try {
    const url = new URL("/api/cron/reminders", baseUrl).toString();
    const noAuth = await fetch(url);
    record("크론 보호", noAuth.status === 401, noAuth.status === 401 ? "비밀값 없이는 거부해요(401)" : `비밀값 없이 호출했는데 ${noAuth.status} 가 왔어요`);
    const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` } });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; orgs?: number; errors?: unknown[] } | null;
    record("크론 실행", res.status === 200 && body?.ok === true, res.status === 200 ? `가족 ${body?.orgs ?? 0}곳 처리, 오류 ${body?.errors?.length ?? 0}건` : `상태 ${res.status} — 배포 환경변수에 CRON_SECRET 이 같은 값으로 들어갔는지 확인하세요`);
  } catch (e) {
    record("배포된 크론 경로", false, safe(e));
  }
}

async function main() {
  console.log("E-car-manage 설정 확인\n");
  await checkEnv();
  await checkDb();
  await checkClerk();
  await checkBlob();
  await checkAnthropic();
  await checkPush();
  await checkNotion();
  await checkCron();
  const failed = results.filter((r) => r.ok === false);
  const skipped = results.filter((r) => r.ok === "skip");
  console.log(`\n통과 ${results.filter((r) => r.ok === true).length} · 실패 ${failed.length} · 건너뜀 ${skipped.length}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("확인 중 예기치 않은 오류:", safe(e));
  process.exit(1);
});
