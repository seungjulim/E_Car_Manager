/**
 * 폼 입력(문자열)을 검증·변환하는 zod 조각들. 서버 액션과 테스트가 함께 쓴다.
 * 빈 칸은 null, 잘못된 값은 한국어 오류 메시지로 돌려준다.
 */
import { z } from "zod";
import { isDateString, todayKst } from "@/lib/car-care";

const clean = (v: string) => v.replace(/[,\s]/g, "").replace(/(원|km|kwh|l|리터)$/i, "");

/** 정수 입력(빈 칸 허용). 쉼표·'원'·'km' 같은 단위는 무시한다 */
export function intField(label: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const c = clean(v);
      // 일반적인 숫자 표기만 받는다(1e3, 0x10 같은 표기는 거부)
      const n = /^-?\d+$/.test(c) ? Number(c) : Number.NaN;
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label}은(는) ${min.toLocaleString("ko-KR")}~${max.toLocaleString("ko-KR")} 사이의 숫자로 입력해 주세요.` });
        return z.NEVER;
      }
      return n;
    });
}

/** 소수 입력(빈 칸 허용) */
export function decimalField(label: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const c = clean(v);
      const n = /^-?\d+(\.\d+)?$/.test(c) ? Number(c) : Number.NaN;
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label}은(는) ${min.toLocaleString("ko-KR")}~${max.toLocaleString("ko-KR")} 사이의 숫자로 입력해 주세요.` });
        return z.NEVER;
      }
      return n;
    });
}

/** 날짜(YYYY-MM-DD). notFuture 면 오늘(한국 시간)보다 뒤의 날짜는 거부한다. 오늘은 검증하는 시점에 계산한다 */
export function dateField(label: string, opts: { notFuture?: boolean } = {}) {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      if (!isDateString(v)) {
        ctx.addIssue({ code: "custom", message: `${label}을(를) 날짜로 입력해 주세요.` });
        return z.NEVER;
      }
      if (opts.notFuture && v > todayKst()) {
        ctx.addIssue({ code: "custom", message: `${label}은(는) 오늘 이후로 정할 수 없어요.` });
        return z.NEVER;
      }
      return v;
    });
}

/** 자유 텍스트(빈 칸은 null) */
export function textField(label: string, max: number) {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      if (v.length > max) {
        ctx.addIssue({ code: "custom", message: `${label}은(는) ${max}자까지 쓸 수 있어요.` });
        return z.NEVER;
      }
      return v;
    });
}

/** 꼭 필요한 텍스트 */
export function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label}을(를) 입력해 주세요.`)
    .max(max, `${label}은(는) ${max}자까지 쓸 수 있어요.`);
}

/** 라이브러리 기본(영문) 메시지는 감추고 한국어 메시지만 보여 준다 */
export function firstIssue(error: z.ZodError): string {
  const msg = error.issues[0]?.message;
  return msg && /[가-힣]/.test(msg) ? msg : "입력한 내용을 확인해 주세요.";
}

/** FormData 의 문자열 값을 꺼낸다(없거나 파일이면 빈 문자열) */
export function formString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}
