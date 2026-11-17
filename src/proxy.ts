import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

// 로그인 없이 접근 가능한 경로. (Next.js 16부터 middleware.ts 는 proxy.ts 로 이름이 바뀌었다.)
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Vercel Cron 은 로그인 세션이 없으므로 라우트 안에서 CRON_SECRET 으로 직접 검증한다.
  "/api/cron/(.*)",
]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

/** 로그인 처리에 꼭 필요한 환경변수. 하나라도 비어 있으면 Clerk 가 모든 요청에서 오류(500)를 내므로 먼저 막는다 */
const REQUIRED_ENV = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"] as const;

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    // 값은 절대 보여 주지 않고, 어떤 변수가 비었는지(이름)만 알려 준다
    return new NextResponse(`서버 설정이 아직 끝나지 않았어요.\n빠진 환경변수: ${missing.join(", ")}\n(Vercel 프로젝트의 Environment Variables 에 추가한 뒤 다시 배포해 주세요.)\n`, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Next.js 내부 경로, 정적 파일, 배포 진단용 /api/health 는 제외(키가 빠져 로그인 처리가 죽어도 진단은 열려야 한다)
    "/((?!_next|api/health(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/health(?:/|$))|trpc)(.*)",
  ],
};
