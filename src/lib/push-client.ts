/** 브라우저 푸시 구독에 쓰는 순수 헬퍼(서버·클라이언트 공용) */

/** VAPID 공개키(URL-safe base64) → PushManager.subscribe 가 요구하는 바이트 배열 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "ios-not-installed" };

/**
 * 이 기기에서 웹 푸시를 쓸 수 있는지. 아이폰·아이패드는 홈 화면에 추가한 앱에서만 받을 수 있다.
 * env 를 인자로 받아 브라우저 밖에서도 테스트할 수 있게 했다.
 */
export function detectPushSupport(env: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  userAgent: string;
  standalone: boolean;
}): PushSupport {
  const ios = /iPhone|iPad|iPod/i.test(env.userAgent);
  if (ios && !env.standalone) return { ok: false, reason: "ios-not-installed" };
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return { ok: false, reason: "unsupported" };
  return { ok: true };
}

const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome·Edge·Samsung Internet 등
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, // Safari(iOS·macOS)
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/, // Edge(Windows)
];

/**
 * 서버가 푸시를 보낼 주소는 브라우저가 알려 준 값이라, 아무 주소나 받으면 서버가 임의의 외부 주소로
 * 요청을 보내게 된다(SSRF). 주요 브라우저의 푸시 서비스 주소만 허용한다.
 */
export function isKnownPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  return PUSH_HOSTS.some((re) => re.test(url.hostname));
}

/** "Chrome · Android" 처럼 기기를 알아볼 수 있는 짧은 이름 */
export function deviceLabel(userAgent: string): string {
  const os = /iPhone|iPad|iPod/i.test(userAgent)
    ? "iOS"
    : /Android/i.test(userAgent)
      ? "Android"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS X/i.test(userAgent)
          ? "Mac"
          : "기기";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : /Firefox\//.test(userAgent) ? "Firefox" : "브라우저";
  return `${browser} · ${os}`;
}
