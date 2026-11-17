import { connection } from "next/server";

/**
 * 배포 진단용. 로그인(Clerk) 처리를 거치지 않아서, 환경변수가 빠져 다른 화면이 모두 500 일 때도 열린다.
 * 값은 절대 돌려주지 않고 "설정 여부"와 "형식이 맞는지"만 알려 준다. 문제를 해결한 뒤에는 이 파일을 지워도 된다.
 */
const NAMES = [
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "NOTION_TOKEN",
  "NOTION_PARENT_PAGE_ID",
] as const;

const kind = (v: string | undefined, prefixes: Record<string, string>) => {
  if (!v) return "missing";
  for (const [prefix, label] of Object.entries(prefixes)) if (v.startsWith(prefix)) return label;
  return "bad-format";
};

export async function GET(): Promise<Response> {
  await connection(); // 빌드 때 굳지 않고 요청마다 실제 환경을 읽게 한다
  const env = process.env;
  const set = Object.fromEntries(NAMES.map((n) => [n, !!env[n] && env[n]!.trim() !== ""]));
  // 값 앞뒤에 공백·줄바꿈이 섞였는지(키를 붙여 넣다가 자주 생긴다)
  const whitespace = NAMES.filter((n) => env[n] != null && env[n] !== env[n]!.trim());
  return Response.json(
    {
      ok: true,
      vercelEnv: env.VERCEL_ENV ?? null,
      node: process.version,
      set,
      format: {
        clerkPublishableKey: kind(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, { pk_test_: "test", pk_live_: "live" }),
        clerkSecretKey: kind(env.CLERK_SECRET_KEY, { sk_test_: "test", sk_live_: "live" }),
        databaseUrl: kind(env.DATABASE_URL, { "postgres://": "ok", "postgresql://": "ok" }),
      },
      whitespace,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
