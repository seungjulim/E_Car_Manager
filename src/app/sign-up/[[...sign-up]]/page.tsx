import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      {/* Clerk 컴포넌트는 현재 경로를 읽으므로(요청 시점 데이터) Suspense 안에 둔다 */}
      <Suspense fallback={<div className="h-96 w-80 animate-pulse rounded-xl bg-soft" />}>
        <SignUp />
      </Suspense>
    </main>
  );
}
