"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { MAX_COMPARE } from "@/lib/compare";

/**
 * "비교 담기" 바구니: 이 기기(브라우저)에만 저장해 두는 임시 선택. 서버에는 저장하지 않는다.
 * 비교 화면에서 [저장]을 누르면 그때 가족 공유용으로 저장된다.
 */
const KEY = "ecar:compare:v1";
const EVENT = "ecar:compare-change";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]"; // 저장소를 쓸 수 없는 환경(비공개 모드 등)
  }
}

function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_COMPARE)));
  } catch {
    /* 저장 불가: 이번 방문에서는 담기가 유지되지 않을 수 있음 */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback); // 다른 탭에서 바꾼 경우
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useCompareBasket() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const ids = useMemo(() => parse(raw), [raw]);
  return {
    ids,
    full: ids.length >= MAX_COMPARE,
    has: (id: string) => ids.includes(id),
    add: (id: string) => {
      if (!ids.includes(id) && ids.length < MAX_COMPARE) write([...ids, id]);
    },
    remove: (id: string) => write(ids.filter((x) => x !== id)),
    clear: () => write([]),
  };
}

/** 트림 하나를 비교 바구니에 담고 빼는 버튼 */
export function CompareToggle({ trimId, className = "" }: { trimId: string; className?: string }) {
  const basket = useCompareBasket();
  const on = basket.has(trimId);
  const disabled = !on && basket.full;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={disabled ? `비교는 ${MAX_COMPARE}대까지 담을 수 있어요` : undefined}
      onClick={() => (on ? basket.remove(trimId) : basket.add(trimId))}
      className={`min-h-11 rounded-xl border text-sm font-semibold disabled:opacity-40 ${
        on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"
      } ${className}`}
    >
      {on ? "⇄ 비교에 담김" : "⇄ 비교 담기"}
    </button>
  );
}

/** 담아 둔 차량이 있으면 탭바 위에 나타나는 "비교하기" 바 */
export function CompareBar() {
  const basket = useCompareBasket();
  if (basket.ids.length === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2">
      <div className="mx-auto flex max-w-md items-center gap-2 rounded-xl border border-accent bg-surface p-2 shadow-lg">
        <span className="flex-1 pl-2 text-sm">
          ⇄ 비교 <b>{basket.ids.length}</b>/{MAX_COMPARE}대 담음
        </span>
        <button type="button" onClick={basket.clear} className="min-h-10 rounded-lg border border-line px-3 text-sm">
          비우기
        </button>
        <Link
          href={`/shop/compare?t=${basket.ids.join(",")}`}
          aria-disabled={basket.ids.length < 2}
          className={`grid min-h-10 place-items-center rounded-lg px-3 text-sm font-semibold ${
            basket.ids.length < 2 ? "pointer-events-none bg-line text-muted" : "bg-accent text-white"
          }`}
        >
          {basket.ids.length < 2 ? "2대 이상 담기" : "비교하기"}
        </Link>
      </div>
    </div>
  );
}
