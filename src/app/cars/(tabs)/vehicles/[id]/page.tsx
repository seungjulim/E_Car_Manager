import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteRecordButton } from "@/components/cars/forms";
import { NotionSaveButton } from "@/components/notion-save-button";
import { DeleteVehicleButton } from "@/components/cars/delete-vehicle-button";
import { EmptyBox, km, PT_BADGE, UpcomingRow, won } from "@/components/cars/ui";
import { getDb } from "@/db";
import { daysBetween, findPreset, formatDday, todayKst } from "@/lib/car-care";
import {
  listEnergy,
  listMileage,
  listPolicies,
  listServices,
  loadUpcoming,
  vehicleLabel,
  type VehicleRow,
} from "@/lib/cars";
import { firstParam, requireVehicle } from "@/lib/cars-server";
import { itemsForPowertrain, STATUS_ICON, STATUS_LABEL, topProgress } from "@/lib/inspection";
import { DOCUMENT_KIND_LABEL, isDocumentKind } from "@/lib/document-constants";
import { listDocuments } from "@/lib/documents";
import { notionSavedUrls } from "@/lib/notion-sync";
import { listRequests } from "@/lib/repairs";
import { compareToQuote, quoteDiffText } from "@/lib/quotes";
import { PART_PREF_LABEL } from "@/lib/quotes";
import { checkedCodesSince, latestStatuses, listInspections } from "@/lib/inspections";
import { displayName, getMemberNames } from "@/lib/members";

export const metadata: Metadata = { title: "차량 정보" };

const TABS = [
  { key: "overview", label: "개요" },
  { key: "service", label: "정비" },
  { key: "inspection", label: "점검" },
  { key: "quotes", label: "견적" },
  { key: "insurance", label: "보험" },
  { key: "mileage", label: "주행" },
  { key: "energy", label: "충전·주유" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function VehicleDetailPage(props: PageProps<"/cars/vehicles/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <DetailContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function DetailContent({
  params,
  searchParams,
}: {
  params: PageProps<"/cars/vehicles/[id]">["params"];
  searchParams: PageProps<"/cars/vehicles/[id]">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { userId, orgId, vehicle: v } = await requireVehicle(id);
  const rawTab = firstParam(query.tab);
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "overview";
  const badge = PT_BADGE[v.powertrain];

  return (
    <div className="space-y-4">
      <Link href="/cars/vehicles" className="inline-block text-sm text-muted">
        ‹ 내 차
      </Link>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{vehicleLabel(v)}</h1>
            <p className="text-sm text-muted">
              {v.plateNo}
              {v.purchaseYear ? ` · ${v.purchaseYear}년식` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
        </div>
        <p className="mt-2 text-2xl font-bold">{km(v.currentMileageKm)}</p>
      </section>

      <nav className="-mx-4 flex overflow-x-auto border-b border-line px-4" aria-label="차량 정보 탭">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "overview" ? `/cars/vehicles/${v.id}` : `/cars/vehicles/${v.id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-accent font-bold text-accent" : "border-transparent text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview vehicle={v} userId={userId} orgId={orgId} />}
      {tab === "service" && <ServiceTab vehicle={v} orgId={orgId} />}
      {tab === "inspection" && <InspectionTab vehicle={v} orgId={orgId} />}
      {tab === "quotes" && <QuotesTab vehicle={v} orgId={orgId} />}
      {tab === "insurance" && <InsuranceTab vehicle={v} orgId={orgId} />}
      {tab === "mileage" && <MileageTab vehicle={v} orgId={orgId} />}
      {tab === "energy" && <EnergyTab vehicle={v} orgId={orgId} />}
    </div>
  );
}

function AddLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
      {children}
    </Link>
  );
}

const FUEL_LABEL = { gasoline: "휘발유", diesel: "경유", lpg: "LPG" } as const;

async function Overview({ vehicle: v, userId, orgId }: { vehicle: VehicleRow; userId: string; orgId: string }) {
  const [upcoming, names] = await Promise.all([loadUpcoming(getDb(), orgId), getMemberNames(orgId)]);
  const mine = upcoming.filter((u) => u.vehicleId === v.id);
  const rows: [string, string | null][] = [
    ["차량번호", v.plateNo],
    ["유형", `${PT_BADGE[v.powertrain].label}${v.iceFuel ? ` · ${FUEL_LABEL[v.iceFuel]}` : ""}`],
    ["차종", [v.brand, v.model, v.trim].filter(Boolean).join(" ") || null],
    ["구입", [v.purchaseYear ? `${v.purchaseYear}년` : null, v.purchasedAt].filter(Boolean).join(" · ") || null],
    ["색상", v.color],
    ["차대번호", v.vin],
    ["주 사용자", v.ownerUserId ? displayName(names, v.ownerUserId, userId) : null],
  ];

  return (
    <div className="space-y-4">
      <section className="space-y-2" aria-label="빠른 기록">
        <h2 className="font-bold">빠른 기록</h2>
        <div className="grid grid-cols-5 gap-2">
          {[
            ["mileage", "🛣", "주행"],
            ["service", "🔧", "정비"],
            ["inspections", "📋", "점검"],
            ["energy", "⚡", "충전·주유"],
            ["insurance", "🛡", "보험"],
          ].map(([path, icon, label]) => (
            <Link
              key={path}
              href={path === "inspections" ? `/cars/vehicles/${v.id}/inspections/new?mode=shop` : `/cars/vehicles/${v.id}/${path}/new`}
              className="grid min-h-14 place-items-center rounded-xl border border-line bg-surface text-xs font-semibold"
            >
              <span aria-hidden>{icon}</span>
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2" aria-label="다음 예정">
        <h2 className="font-bold">다음 예정</h2>
        {mine.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">정비·보험을 기록하면 다음 시기가 나타나요.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((u) => (
              <UpcomingRow key={u.key} item={u} showVehicle={false} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4" aria-label="차량 정보">
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-semibold">{value || "-"}</dd>
            </div>
          ))}
        </dl>
        {v.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-soft px-3 py-2 text-sm">{v.notes}</p>}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href={`/cars/vehicles/${v.id}/edit`} className="grid min-h-11 place-items-center rounded-xl border border-line text-sm font-semibold">
          정보 수정
        </Link>
        <DeleteVehicleButton id={v.id} label={vehicleLabel(v)} />
      </div>
    </div>
  );
}

function QuoteDiffLine({ quoteAmount, actual }: { quoteAmount: number | null; actual: number | null }) {
  const d = compareToQuote(quoteAmount, actual);
  if (!d) return quoteAmount != null ? <p className="mt-1 text-xs text-muted">견적 {won(quoteAmount)} (실제 금액을 입력하면 비교해 드려요)</p> : null;
  const tone = d.kind === "extra" ? "bg-warn-soft text-warn" : d.kind === "saved" ? "bg-ok-soft text-ok" : "bg-soft text-muted";
  return (
    <p className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${tone}`}>
      견적 {won(quoteAmount)} → 실제 {won(actual)} · {quoteDiffText(d, won)}
    </p>
  );
}

async function ServiceTab({ vehicle: v, orgId }: { vehicle: VehicleRow; orgId: string }) {
  const [list, docs] = await Promise.all([listServices(getDb(), orgId, v.id), listDocuments(getDb(), orgId, v.id, 200)]);
  const notionUrls = await notionSavedUrls(getDb(), orgId, "service_record", list.map((s) => s.id)).catch(() => ({}) as Record<string, string>);
  const byService = new Map<string, typeof docs>();
  for (const d of docs) if (d.serviceRecordId) byService.set(d.serviceRecordId, [...(byService.get(d.serviceRecordId) ?? []), d]);
  const loose = docs.filter((d) => !d.serviceRecordId && !d.quoteLinked); // 견적에 붙은 견적서는 견적 비교 화면에서 보인다
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">정비 기록 {list.length > 0 && <span className="text-sm font-normal text-muted">{list.length}건</span>}</h2>
        <div className="flex gap-2">
          <Link href={`/cars/vehicles/${v.id}/quotes/new`} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
            💸 견적
          </Link>
          <Link href={`/cars/vehicles/${v.id}/statements/new`} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
            🧾 내역서
          </Link>
          <AddLink href={`/cars/vehicles/${v.id}/service/new`}>+ 정비 기록</AddLink>
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyBox title="정비 기록이 없어요">오일·타이어·배터리 같은 소모품을 교체했다면 기록해 두세요. 다음 교체 시기를 알려 드려요.</EmptyBox>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => {
            const title = findPreset(s.itemCode)?.name ?? s.category ?? "정비";
            return (
              <li key={s.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{title}</p>
                    <p className="text-xs text-muted">
                      {s.servicedOn}
                      {s.mileageKm != null && ` · ${km(s.mileageKm)}`}
                      {s.shopName && ` · ${s.shopName}`}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{won(s.cost)}</p>
                </div>
                {(s.nextDueOn || s.nextDueKm != null) && (
                  <p className="mt-1 text-xs text-muted">
                    다음 예정: {[s.nextDueOn, s.nextDueKm != null ? km(s.nextDueKm) : null].filter(Boolean).join(" / ")}
                  </p>
                )}
                {s.description && <p className="mt-1 whitespace-pre-line text-sm">{s.description}</p>}
                <QuoteDiffLine quoteAmount={s.quoteAmount} actual={s.cost} />
                {(byService.get(s.id) ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(byService.get(s.id) ?? []).map((d) => (
                      <Link key={d.id} href={`/cars/vehicles/${v.id}/statements/${d.id}`} className="rounded-full bg-soft px-3 py-1 text-xs font-semibold">
                        📎 {isDocumentKind(d.kind) ? DOCUMENT_KIND_LABEL[d.kind] : "서류"} {d.imageCount}장
                      </Link>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <NotionSaveButton entityType="service_record" entityId={s.id} savedUrl={notionUrls[s.id]} />
                  <DeleteRecordButton id={s.id} vehicleId={v.id} type="service" label={`${title} 기록`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {loose.length > 0 && (
        <div className="space-y-2 rounded-xl border border-dashed border-line p-3">
          <h3 className="text-sm font-bold">정비 기록과 연결되지 않은 서류 {loose.length}건</h3>
          <ul className="space-y-1">
            {loose.map((d) => (
              <li key={d.id}>
                <Link href={`/cars/vehicles/${v.id}/statements/${d.id}`} className="text-sm text-accent underline">
                  📎 {isDocumentKind(d.kind) ? DOCUMENT_KIND_LABEL[d.kind] : "서류"} {d.imageCount}장 · {d.createdAt.toISOString().slice(0, 10)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

async function InspectionTab({ vehicle: v, orgId }: { vehicle: VehicleRow; orgId: string }) {
  const today = todayKst();
  const db = getDb();
  const [list, latest, checked] = await Promise.all([
    listInspections(db, orgId, v.id),
    latestStatuses(db, orgId, v.id),
    checkedCodesSince(db, orgId, v.id, `${today.slice(0, 7)}-01`),
  ]);
  const progress = topProgress(v.powertrain, checked);
  const tops = itemsForPowertrain(v.powertrain).filter((i) => i.topRank != null);
  const percent = Math.round((progress.done / progress.total) * 100);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">이번 달 점검 TOP 10</h2>
          <p className="text-sm font-semibold">
            {progress.done}/{progress.total}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total} aria-label="이번 달 점검 진행도">
          <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link href={`/cars/vehicles/${v.id}/inspections/new?mode=self`} className="grid min-h-12 place-items-center rounded-xl bg-accent text-sm font-semibold text-white">
            ⏱ 월간 셀프 점검
          </Link>
          <Link href={`/cars/vehicles/${v.id}/inspections/new?mode=shop`} className="grid min-h-12 place-items-center rounded-xl border border-line text-sm font-semibold">
            🛠 정비소 점검 기록
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-bold">항목별 최근 상태</h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {tops.map((it) => {
            const l = latest.get(it.itemCode);
            return (
              <li key={it.itemCode} className="flex items-center gap-3 px-3 py-2">
                <span aria-hidden>{l ? STATUS_ICON[l.status] : "⚪"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    <span className="mr-1 text-xs text-accent">TOP {it.topRank}</span>
                    {it.name}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted">{l ? `${STATUS_LABEL[l.status]} · ${l.on}` : "점검 기록 없음"}</p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="font-bold">점검 기록 {list.length > 0 && <span className="text-sm font-normal text-muted">{list.length}건</span>}</h2>
        {list.length === 0 ? (
          <EmptyBox title="점검 기록이 없어요">셀프 점검은 1분이면 끝나요. 정비소에서 점검받았다면 결과를 항목별로 남겨 두세요.</EmptyBox>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-surface p-3">
                <Link href={`/cars/vehicles/${v.id}/inspections/${r.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold">
                      {r.overallStatus ? STATUS_ICON[r.overallStatus] : "⚪"} {r.isSelfCheck ? "셀프 점검" : "정비소 점검"}
                    </p>
                    <p className="shrink-0 text-xs text-muted">{r.inspectedOn}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {[r.place && r.place !== "셀프 점검" ? r.place : null, r.mileageKm != null ? km(r.mileageKm) : null, `${r.itemCount}개 점검`].filter(Boolean).join(" · ")}
                  </p>
                  {r.problemCount > 0 && <p className="mt-1 text-sm font-semibold text-bad">확인이 필요한 항목 {r.problemCount}개</p>}
                </Link>
                <div className="mt-2 flex justify-end">
                  <DeleteRecordButton id={r.id} vehicleId={v.id} type="inspection" label="점검 기록" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

async function QuotesTab({ vehicle: v, orgId }: { vehicle: VehicleRow; orgId: string }) {
  const list = await listRequests(getDb(), orgId, v.id);
  const statusLabel = { open: "비교 중", chosen: "정함", done: "완료" } as const;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">수리 견적 {list.length > 0 && <span className="text-sm font-normal text-muted">{list.length}건</span>}</h2>
        <AddLink href={`/cars/vehicles/${v.id}/quotes/new`}>+ 견적 받기</AddLink>
      </div>
      {list.length === 0 ? (
        <EmptyBox title="견적 요청이 없어요">수리가 필요할 때 여러 정비소의 견적을 모아 최저가 TOP 10으로 비교해 보세요.</EmptyBox>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/cars/vehicles/${v.id}/quotes/${r.id}`} className="block rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-bold">{findPreset(r.itemCode)?.name ?? r.description ?? "수리"}</p>
                  <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs text-muted">{statusLabel[r.status]}</span>
                </div>
                <p className="text-xs text-muted">
                  {r.createdAt.toISOString().slice(0, 10)} · 견적 {r.quoteCount}건{r.lowest != null ? ` · 최저 ${won(r.lowest)}` : ""} · {PART_PREF_LABEL[r.partPref]}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function InsuranceTab({ vehicle: v, orgId }: { vehicle: VehicleRow; orgId: string }) {
  const list = await listPolicies(getDb(), orgId, v.id);
  const today = todayKst();
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">보험</h2>
        <AddLink href={`/cars/vehicles/${v.id}/insurance/new`}>+ 보험 추가</AddLink>
      </div>
      {list.length === 0 ? (
        <EmptyBox title="등록된 보험이 없어요">만기일을 등록해 두면 일정 탭에서 미리 확인할 수 있어요.</EmptyBox>
      ) : (
        <ul className="space-y-2">
          {list.map((p, i) => {
            const days = daysBetween(today, p.endOn);
            const current = i === 0;
            return (
              <li key={p.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {p.insurer}
                      {current && <span className="ml-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">최신</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {[p.startOn, p.endOn].filter(Boolean).join(" ~ ")}
                      {p.coverageType && ` · ${p.coverageType}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{won(p.premium)}</p>
                    <p className={`text-xs ${days < 0 ? "text-muted" : days <= 30 ? "text-bad" : "text-muted"}`}>{days < 0 ? "만료됨" : formatDday(days)}</p>
                  </div>
                </div>
                {(p.policyNo || p.contact) && <p className="mt-1 text-xs text-muted">{[p.policyNo && `증권 ${p.policyNo}`, p.contact].filter(Boolean).join(" · ")}</p>}
                {p.notes && <p className="mt-1 whitespace-pre-line text-sm">{p.notes}</p>}
                <div className="mt-2 flex justify-end">
                  <DeleteRecordButton id={p.id} vehicleId={v.id} type="policy" label={`${p.insurer} 보험`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

async function MileageTab({ vehicle: v, orgId }: { vehicle: VehicleRow; orgId: string }) {
  const list = await listMileage(getDb(), orgId, v.id);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">주행거리 기록</h2>
        <AddLink href={`/cars/vehicles/${v.id}/mileage/new`}>+ 기록</AddLink>
      </div>
      {list.length === 0 ? (
        <EmptyBox title="주행거리 기록이 없어요">가끔 계기판 숫자를 기록해 두면 평균 주행거리로 정비 시기를 추정해 드려요.</EmptyBox>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{km(m.mileageKm)}</p>
                <p className="text-xs text-muted">
                  {m.recordedOn}
                  {m.note && ` · ${m.note}`}
                </p>
              </div>
              <DeleteRecordButton id={m.id} vehicleId={v.id} type="mileage" label="주행거리 기록" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function EnergyTab({ vehicle: v, orgId }: { vehicle: VehicleRow; orgId: string }) {
  const list = await listEnergy(getDb(), orgId, v.id);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">충전·주유 기록</h2>
        <AddLink href={`/cars/vehicles/${v.id}/energy/new`}>+ 기록</AddLink>
      </div>
      {list.length === 0 ? (
        <EmptyBox title="충전·주유 기록이 없어요">금액을 기록하면 비용 탭에서 월별로 볼 수 있어요.</EmptyBox>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {list.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-3 py-2">
              <span aria-hidden className="text-lg">
                {e.kind === "charging" ? "⚡" : "⛽"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {won(e.cost)}
                  {e.amount != null && <span className="font-normal text-muted"> · {e.amount.toLocaleString("ko-KR")}{e.kind === "charging" ? "kWh" : "L"}</span>}
                </p>
                <p className="text-xs text-muted">
                  {[e.on, e.place, e.detail === "dc" ? "급속" : e.detail === "ac" ? "완속" : e.detail, e.odometerKm != null ? km(e.odometerKm) : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <DeleteRecordButton id={e.id} vehicleId={v.id} type={e.kind} label={e.kind === "charging" ? "충전 기록" : "주유 기록"} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
