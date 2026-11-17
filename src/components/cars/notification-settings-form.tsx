"use client";

import { useActionState, useState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/cars/(tabs)/notifications/actions";
import { OFFSET_CHOICES, offsetLabel, type UserSettings } from "@/lib/reminders";

export function NotificationSettingsForm({ initial }: { initial: UserSettings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  const [enabled, setEnabled] = useState(initial.enabled);
  const [offsets, setOffsets] = useState<number[]>(initial.offsetsDays);
  const [schedule, setSchedule] = useState(initial.categories.schedule);
  const [insurance, setInsurance] = useState(initial.categories.insurance);
  const [selfCheck, setSelfCheck] = useState(initial.categories.selfCheck);
  const [followup, setFollowup] = useState(initial.categories.followup);
  const [mode, setMode] = useState<"all" | "primary">(initial.recipientsMode === "primary" ? "primary" : "all");

  const toggle = (n: number) => setOffsets((o) => (o.includes(n) ? o.filter((x) => x !== n) : [...o, n]));

  return (
    <form action={action} className="space-y-5">
      {enabled && <input type="hidden" name="enabled" value="on" />}
      {offsets.map((n) => (
        <input key={n} type="hidden" name="offsets" value={n} />
      ))}
      {schedule && <input type="hidden" name="schedule" value="on" />}
      {insurance && <input type="hidden" name="insurance" value="on" />}
      {selfCheck && <input type="hidden" name="selfCheck" value="on" />}
      {followup && <input type="hidden" name="followup" value="on" />}
      <input type="hidden" name="recipientsMode" value={mode} />

      <Row title="알림 받기" desc="끄면 알림 센터에도 쌓이지 않아요.">
        <Switch checked={enabled} onChange={setEnabled} label="알림 받기" />
      </Row>

      <fieldset disabled={!enabled} className="space-y-5 disabled:opacity-50">
        <section className="space-y-2">
          <h2 className="font-bold">언제 알릴까요?</h2>
          <p className="text-sm text-muted">정비 예정일·보험 만기일의 며칠 전에 알릴지 골라요. 여러 개를 고를 수 있어요.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="알림 시점">
            {OFFSET_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={offsets.includes(n)}
                onClick={() => toggle(n)}
                className={`min-h-10 rounded-full border px-3 text-sm ${offsets.includes(n) ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
              >
                {offsetLabel(n)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">기한이 지난 항목은 다음 날 한 번 더 알려 드려요(이 설정과 무관).</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">어떤 알림을 받을까요?</h2>
          <Row title="정비 예정" desc="소모품 교체 시기 (엔진오일·타이어 등)">
            <Switch checked={schedule} onChange={setSchedule} label="정비 예정 알림" />
          </Row>
          <Row title="보험 만기" desc="보험이 끝나기 전에 갱신을 챙겨요">
            <Switch checked={insurance} onChange={setInsurance} label="보험 만기 알림" />
          </Row>
          <Row title="점검 후속 확인" desc="점검에서 '필요'(1주일 뒤)·'주의'(한 달 뒤)로 기록한 항목을 조치했는지 물어봐요">
            <Switch checked={followup} onChange={setFollowup} label="점검 후속 알림" />
          </Row>
          <Row title="월간 셀프 점검" desc="매달 1일, 타이어·오일 같은 셀프 점검을 하라고 알려요 (이미 했으면 건너뛰어요)">
            <Switch checked={selfCheck} onChange={setSelfCheck} label="월간 셀프 점검 알림" />
          </Row>
        </section>

        <section className="space-y-2">
          <h2 className="font-bold">어느 차 알림을 받을까요?</h2>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line" role="group" aria-label="알림 대상 차량">
            {(
              [
                ["all", "가족 전체 차량"],
                ["primary", "내가 쓰는 차만"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
                className={`min-h-11 border-r border-line text-sm last:border-r-0 ${mode === key ? "bg-accent-soft font-semibold text-accent" : "bg-surface"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">&lsquo;내가 쓰는 차만&rsquo;은 내가 주 사용자인 차와 주 사용자가 없는 차의 알림만 받아요.</p>
        </section>
      </fieldset>

      {state.error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      {state.saved && !pending && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          저장했어요.
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40">
        {pending ? "저장 중…" : "설정 저장"}
      </button>
    </form>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <b>{title}</b>
        <p className="text-sm text-muted">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}
