"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";

/**
 * 홈(모드 선택) 화면 맨 아래 가운데의 '종료' 버튼.
 * 웹앱은 스스로 완전히 꺼지지 않아서 '앱 닫기'(닫기를 시도하고, 막히면 방법을 안내)와 '로그아웃' 중에서 고른다.
 */
export function ExitButton() {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function closeApp() {
    window.close();
    // 기기·브라우저가 닫기를 막으면 화면이 그대로 남아 있다 → 직접 닫는 방법을 안내한다
    setTimeout(() => setCloseBlocked(true), 400);
  }

  async function logout() {
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } finally {
      setSigningOut(false);
    }
  }

  function dismiss() {
    setOpen(false);
    setCloseBlocked(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-12 min-w-32 rounded-xl border border-line bg-surface px-6 font-semibold text-muted"
      >
        종료
      </button>

      {open && (
        <div className="fixed inset-0 z-30 grid place-items-end bg-black/40 p-4 sm:place-items-center" onClick={dismiss}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="종료"
            className="w-full max-w-sm space-y-3 rounded-2xl bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">어떻게 종료할까요?</h2>

            {closeBlocked ? (
              <p role="status" className="rounded-lg bg-soft px-3 py-2 text-sm">
                이 기기에서는 앱이 스스로 닫히지 않아요. 휴대폰의 <b>홈 버튼</b>을 누르거나 <b>최근 앱 화면에서 위로 밀어</b> 닫아 주세요.
              </p>
            ) : (
              <p className="text-sm text-muted">&lsquo;앱 닫기&rsquo;는 로그인을 유지하고, &lsquo;로그아웃&rsquo;은 다음에 다시 로그인해야 해요.</p>
            )}

            <button type="button" onClick={closeApp} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white">
              앱 닫기
            </button>
            <button
              type="button"
              onClick={logout}
              disabled={signingOut}
              className="min-h-12 w-full rounded-xl border border-line bg-surface font-semibold disabled:opacity-50"
            >
              {signingOut ? "로그아웃 중…" : "로그아웃"}
            </button>
            <button type="button" onClick={dismiss} className="min-h-12 w-full rounded-xl text-sm text-muted">
              취소
            </button>
          </div>
        </div>
      )}
    </>
  );
}
