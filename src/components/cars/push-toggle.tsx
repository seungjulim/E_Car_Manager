"use client";

import { useEffect, useState, useTransition } from "react";
import { sendTestPushAction, subscribePushAction, unsubscribePushAction } from "@/app/cars/(tabs)/notifications/actions";
import { deviceLabel, detectPushSupport, urlBase64ToUint8Array, type PushSupport } from "@/lib/push-client";

type View =
  | { kind: "checking" }
  | { kind: "no-key" }
  | { kind: "unsupported"; reason: Extract<PushSupport, { ok: false }>["reason"] }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on"; endpoint: string };

/** 이 기기에서 푸시 알림을 켜고 끄는 버튼 */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [view, setView] = useState<View>({ kind: "checking" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function inspect() {
      if (!vapidPublicKey) return setView({ kind: "no-key" });
      const support = detectPushSupport({
        hasServiceWorker: "serviceWorker" in navigator,
        hasPushManager: "PushManager" in window,
        hasNotification: "Notification" in window,
        userAgent: navigator.userAgent,
        standalone: window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      });
      if (!support.ok) return setView({ kind: "unsupported", reason: support.reason });
      if (Notification.permission === "denied") return setView({ kind: "denied" });
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled) setView(sub ? { kind: "on", endpoint: sub.endpoint } : { kind: "off" });
      } catch {
        if (!cancelled) setView({ kind: "off" });
      }
    }
    void inspect();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  function enable() {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setView(permission === "denied" ? { kind: "denied" } : { kind: "off" });
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
        const json = sub.toJSON();
        const result = await subscribePushAction({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          deviceLabel: deviceLabel(navigator.userAgent),
        });
        if (!result.ok) {
          await sub.unsubscribe().catch(() => undefined);
          setError(result.error);
          return;
        }
        setView({ kind: "on", endpoint: sub.endpoint });
        setMessage("이 기기에서 알림을 받아요.");
      } catch (e) {
        console.error(e);
        setError("푸시 알림을 켜지 못했어요. 브라우저 설정에서 알림 권한을 확인해 주세요.");
      }
    });
  }

  function disable() {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await unsubscribePushAction(sub.endpoint);
          await sub.unsubscribe();
        }
        setView({ kind: "off" });
        setMessage("이 기기의 푸시 알림을 껐어요.");
      } catch (e) {
        console.error(e);
        setError("끄지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function test() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await sendTestPushAction();
      if (result.ok) setMessage(result.message ?? "시험 알림을 보냈어요.");
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h2 className="font-bold">이 기기에서 푸시 알림 받기</h2>
        <p className="text-sm text-muted">앱을 열지 않아도 정비·보험 알림이 화면에 나타나요. 기기마다 한 번씩 켜야 해요.</p>
      </div>

      {view.kind === "checking" && <p className="text-sm text-muted">확인하는 중…</p>}
      {view.kind === "no-key" && <Note>서버에 푸시 키(VAPID)가 아직 설정되지 않았어요. 설정 전에는 알림 센터에서만 확인할 수 있어요.</Note>}
      {view.kind === "unsupported" && view.reason === "ios-not-installed" && (
        <Note>
          아이폰·아이패드는 <b>홈 화면에 추가한 앱</b>에서만 푸시를 받을 수 있어요. Safari 공유 버튼 → &lsquo;홈 화면에 추가&rsquo; 후 그 앱에서 켜 주세요.
        </Note>
      )}
      {view.kind === "unsupported" && view.reason === "unsupported" && <Note>이 브라우저는 푸시 알림을 지원하지 않아요. 알림 센터에서 확인해 주세요.</Note>}
      {view.kind === "denied" && <Note>알림이 차단돼 있어요. 브라우저(또는 기기) 설정에서 이 사이트의 알림을 허용한 뒤 다시 시도해 주세요.</Note>}

      {view.kind === "off" && (
        <button type="button" onClick={enable} disabled={pending} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40">
          {pending ? "켜는 중…" : "🔔 이 기기에서 알림 켜기"}
        </button>
      )}
      {view.kind === "on" && (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={test} disabled={pending} className="min-h-11 rounded-xl border border-line text-sm font-semibold disabled:opacity-40">
            시험 알림 보내기
          </button>
          <button type="button" onClick={disable} disabled={pending} className="min-h-11 rounded-xl border border-line text-sm font-semibold text-bad disabled:opacity-40">
            이 기기 알림 끄기
          </button>
        </div>
      )}
      {view.kind === "on" && <p className="text-xs text-ok">✓ 이 기기에서 푸시 알림이 켜져 있어요.</p>}

      {message && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{children}</p>;
}
