"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CompareCell, CompareRow } from "@/lib/compare";

export type CompareHeader = {
  id: string;
  modelId: string;
  title: string; // "브랜드 모델"
  trimName: string;
  coverUrl: string | null;
  removeHref: string; // 이 트림을 뺀 비교 주소
};

/** 비교표: 첫 열 고정 + 가로 스크롤, "차이 나는 항목만" 토글 */
export function CompareTable({ headers, rows }: { headers: CompareHeader[]; rows: CompareRow[] }) {
  const [diffOnly, setDiffOnly] = useState(false);
  const visible = useMemo(() => (diffOnly ? rows.filter((r) => r.differs) : rows), [rows, diffOnly]);
  const differCount = rows.filter((r) => r.differs).length;

  const groups: { name: string; rows: CompareRow[] }[] = [];
  for (const r of visible) {
    const last = groups[groups.length - 1];
    if (last && last.name === r.group) last.rows.push(r);
    else groups.push({ name: r.group, rows: [r] });
  }

  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4">
        <span className="text-sm">
          차이 나는 항목만 보기 <span className="text-muted">({differCount}개)</span>
        </span>
        <input
          type="checkbox"
          checked={diffOnly}
          onChange={(e) => setDiffOnly(e.target.checked)}
          className="size-5 accent-[var(--accent)]"
        />
      </label>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-24 border-b border-line bg-background p-2" />
              {headers.map((h) => (
                <th key={h.id} className="w-36 min-w-36 border-b border-line bg-background p-2 align-top font-normal">
                  <Link href={`/shop/models/${h.modelId}`} className="block text-left">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-soft">
                      {h.coverUrl ? (
                        <Image src={h.coverUrl} alt="" fill sizes="144px" className="object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-[11px] text-muted">이미지 없음</div>
                      )}
                    </div>
                    <div className="mt-1 font-bold leading-tight">{h.title}</div>
                    <div className="text-xs text-muted">{h.trimName}</div>
                  </Link>
                  <Link href={h.removeHref} className="mt-1 inline-block text-xs text-muted underline">
                    빼기
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={headers.length + 1} className="p-6 text-center text-muted">
                  차이 나는 항목이 없어요.
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <GroupRows key={g.name} name={g.name} rows={g.rows} columns={headers.length} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ name, rows, columns }: { name: string; rows: CompareRow[]; columns: number }) {
  return (
    <>
      <tr>
        <th
          colSpan={columns + 1}
          scope="colgroup"
          className="sticky left-0 border-b border-line bg-soft px-2 py-1.5 text-left text-xs font-bold text-muted"
        >
          {name}
        </th>
      </tr>
      {rows.map((r) => (
        <tr key={r.key} className={r.differs ? "bg-accent-soft/40" : undefined}>
          <th
            scope="row"
            className="sticky left-0 z-10 w-24 border-b border-line bg-background p-2 text-left align-top text-xs font-semibold"
          >
            {r.label}
          </th>
          {r.cells.map((c, i) => (
            <td key={i} className="min-w-36 border-b border-line p-2 align-top">
              <Cell cell={c} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Cell({ cell }: { cell: CompareCell }) {
  if (cell.kind === "bool") {
    return cell.value ? (
      <span className="font-bold text-ok" aria-label="있음">
        ●
      </span>
    ) : (
      <span className="text-muted" aria-label="없음">
        ○
      </span>
    );
  }
  if (cell.kind === "list") {
    return cell.items.length === 0 ? (
      <span className="text-muted">-</span>
    ) : (
      <ul className="list-disc space-y-0.5 pl-4 text-xs">
        {cell.items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    );
  }
  return cell.value ? <span>{cell.value}</span> : <span className="text-muted">-</span>;
}
