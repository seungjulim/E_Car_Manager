"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TypeCarOption = { id: string; label: string; priceText: string };

/** 선택한 유형의 차량 이름을 라디오 버튼으로 고르고, 선택한 차량의 상세 화면으로 이동한다. */
export function TypeCarPicker({ options }: { options: TypeCarOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) router.push(`/shop/models/${selected}`);
      }}
      className="space-y-3"
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">차량 이름을 선택하세요</legend>
        <ul className="space-y-2">
          {options.map((opt) => (
            <li key={opt.id}>
              <label
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${
                  selected === opt.id ? "border-accent bg-accent-soft" : "border-line bg-surface"
                }`}
              >
                <input type="radio" name="model" value={opt.id} checked={selected === opt.id} onChange={() => setSelected(opt.id)} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{opt.label}</b>
                  {opt.priceText && <span className="block text-xs text-muted">{opt.priceText}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <button
        type="submit"
        disabled={!selected}
        className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
      >
        선택한 차량 보기
      </button>
    </form>
  );
}
