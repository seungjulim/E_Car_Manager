"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markAllReadAction, markReadAction } from "@/app/cars/(tabs)/notifications/actions";
import { formatKstShort } from "@/lib/format";

export type NotificationItem = { id: string; title: string; body: string | null; deepLink: string | null; read: boolean; createdAt: string };

/** 알림 목록: 누르면 읽음 처리하고 해당 화면으로 이동한다 */
export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  // 서버 값을 기준으로, 방금 누른 항목은 화면에서 먼저 읽음으로 보여 준다
  const [justRead, setJustRead] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const unread = items.filter((n) => !n.read && !justRead.has(n.id)).length;

  function open(n: NotificationItem) {
    if (n.read || justRead.has(n.id)) return;
    setJustRead((s) => new Set(s).add(n.id));
    startTransition(async () => {
      await markReadAction(n.id); // 실패해도 이동은 막지 않는다
    });
  }

  function readAll() {
    setError("");
    startTransition(async () => {
      const result = await markAllReadAction();
      if (!result.ok) return setError(result.error);
      setJustRead(new Set(items.map((i) => i.id)));
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{unread > 0 ? `읽지 않은 알림 ${unread}건` : "모두 읽었어요"}</p>
        <button type="button" onClick={readAll} disabled={pending || unread === 0} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
          모두 읽음
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {items.map((n) => {
          const isRead = n.read || justRead.has(n.id);
          const body = (
            <>
              <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${isRead ? "bg-transparent" : "bg-accent"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block ${isRead ? "text-muted" : "font-bold"}`}>{n.title}</span>
                {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                <span className="mt-0.5 block text-xs text-muted">{formatKstShort(n.createdAt)}</span>
              </span>
              {!isRead && <span className="sr-only">읽지 않음</span>}
            </>
          );
          const cls = `flex gap-3 rounded-xl border bg-surface p-3 ${isRead ? "border-line" : "border-accent"}`;
          return (
            <li key={n.id}>
              {n.deepLink && n.deepLink.startsWith("/") ? (
                <Link href={n.deepLink} onClick={() => open(n)} className={cls}>
                  {body}
                </Link>
              ) : (
                <button type="button" onClick={() => open(n)} className={`${cls} w-full text-left`}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
