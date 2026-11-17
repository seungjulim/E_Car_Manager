import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { MAX_UPLOAD_BYTES } from "@/lib/image-constants";

/**
 * 사용자가 입력한 이미지 주소를 서버가 대신 내려받을 때 쓰는 SSRF 방어 fetch.
 *
 * - https(443)만 허용, 주소에 계정정보·IP 직접 입력 금지
 * - 연결 시점의 DNS 결과가 사설/예약 대역이면 차단(DNS rebinding 방지: 검사한 주소로 그대로 접속)
 * - 리다이렉트는 최대 3번, 매번 같은 검사를 다시 한다
 * - 타임아웃 10초, 최대 10MB, 응답 헤더가 아니라 파일 내용(매직 바이트)으로 형식 판별
 */

export const MAX_IMAGE_BYTES = MAX_UPLOAD_BYTES;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

export type ImageContentType = "image/jpeg" | "image/png" | "image/webp";

export type ImageFetchErrorCode =
  | "invalid_url"
  | "blocked"
  | "timeout"
  | "too_large"
  | "not_image"
  | "http_error"
  | "network";

export class ImageFetchError extends Error {
  constructor(
    readonly code: ImageFetchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageFetchError";
  }
}

/* ---------------- IP 검사 ---------------- */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96], // NAT64
  ["100::", 64],
  ["2001::", 32], // Teredo
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** IPv4-mapped IPv6(::ffff:a.b.c.d)면 내장된 IPv4 문자열을, 아니면 null */
function mappedV4(ip: string): string | null {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (m) return m[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return null;
}

/** 공인 인터넷 주소인지(사설·루프백·링크로컬·예약 대역이 아닌지) */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  if (family === 6) {
    const v4 = mappedV4(ip);
    if (v4) return isPublicIp(v4);
    return !blocked.check(ip, "ipv6");
  }
  return !blocked.check(ip, "ipv4");
}

/* ---------------- URL 검사 ---------------- */

export function parseImageUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ImageFetchError("invalid_url", "올바른 이미지 주소가 아니에요.");
  }
  if (url.protocol !== "https:") {
    throw new ImageFetchError("invalid_url", "https:// 로 시작하는 주소만 사용할 수 있어요.");
  }
  if (url.username || url.password) {
    throw new ImageFetchError("invalid_url", "계정 정보가 들어간 주소는 사용할 수 없어요.");
  }
  if (url.port && url.port !== "443") {
    throw new ImageFetchError("invalid_url", "기본 포트(443)가 아닌 주소는 사용할 수 없어요.");
  }
  // IP 주소를 직접 쓰는 주소는 허용하지 않는다(도메인만)
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new ImageFetchError("blocked", "이 주소는 사용할 수 없어요.");
  }
  if (url.toString().length > 2000) {
    throw new ImageFetchError("invalid_url", "주소가 너무 길어요.");
  }
  return url;
}

/* ---------------- 전송 계층 (테스트에서 교체 가능) ---------------- */

export type RawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
};
export type Transport = (url: URL, signal: AbortSignal) => Promise<RawResponse>;

type LookupCallback = (err: Error | null, address?: string | LookupAddress[], family?: number) => void;

/** 접속 직전에 DNS 를 풀고 사설 주소가 하나라도 있으면 막는다 */
function guardedLookup(hostname: string, options: { all?: boolean } & Record<string, unknown>, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicIp(a.address))) {
      return callback(new ImageFetchError("blocked", "이 주소는 사용할 수 없어요."));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

const httpsTransport: Transport = (url, signal) =>
  new Promise<RawResponse>((resolve, reject) => {
    const req = https.request(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { accept: "image/jpeg,image/png,image/webp,image/*;q=0.8", "user-agent": "E-car-manage/1.0 (image import)" },
        lookup: guardedLookup as unknown as https.RequestOptions["lookup"],
        signal,
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }),
    );
    req.on("error", reject);
    req.end();
  });

/* ---------------- 파일 형식 판별 ---------------- */

export function sniffImageType(bytes: Uint8Array): ImageContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/* ---------------- 본체 ---------------- */

export async function fetchImageSafely(
  rawUrl: string,
  opts: { transport?: Transport } = {},
): Promise<{ bytes: Uint8Array; contentType: ImageContentType; finalUrl: string }> {
  const transport = opts.transport ?? httpsTransport;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let url = parseImageUrl(rawUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await transport(url, controller.signal);

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.location;
        const target = Array.isArray(location) ? location[0] : location;
        if (!target) throw new ImageFetchError("http_error", "이미지 주소가 올바르게 이동하지 않아요.");
        url = parseImageUrl(new URL(target, url).toString()); // 이동한 주소도 같은 검사를 다시 한다
        continue;
      }
      if (res.status !== 200) {
        throw new ImageFetchError("http_error", `이미지를 가져오지 못했어요. (응답 ${res.status})`);
      }

      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
        throw new ImageFetchError("too_large", "이미지가 너무 커요. (10MB 이하만 가능)");
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of res.body) {
        total += chunk.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          throw new ImageFetchError("too_large", "이미지가 너무 커요. (10MB 이하만 가능)");
        }
        chunks.push(chunk);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.byteLength;
      }

      const contentType = sniffImageType(bytes);
      if (!contentType) {
        throw new ImageFetchError("not_image", "jpg · png · webp 이미지가 아니에요.");
      }
      return { bytes, contentType, finalUrl: url.toString() };
    }
    throw new ImageFetchError("http_error", "이동(리다이렉트)이 너무 많아요.");
  } catch (error) {
    if (error instanceof ImageFetchError) throw error;
    if (controller.signal.aborted) throw new ImageFetchError("timeout", "이미지를 가져오는 데 시간이 너무 오래 걸려요.");
    throw new ImageFetchError("network", "이미지를 가져오지 못했어요. 주소를 확인해 주세요.");
  } finally {
    clearTimeout(timer);
  }
}
