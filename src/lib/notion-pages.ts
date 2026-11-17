/**
 * 노션에 저장할 페이지 내용(제목 + 마크다운 본문)을 만드는 순수 함수들. DB·네트워크 없이 테스트한다.
 * 개인정보를 줄이기 위해 차량번호·VIN·연락처는 넣지 않는다. 서류 사진은 비공개 저장소에 있어 링크 대신 장수만 적는다.
 */
import type { CompareCell, CompareRow, CompareTrim } from "@/lib/compare";
import { formatManwon } from "@/lib/format";
import { STATUS_ICON, STATUS_LABEL, type InspectionStatus } from "@/lib/inspection";
import { compareToQuote, quoteDiffText } from "@/lib/quotes";

export type NotionPageContent = { title: string; markdown: string };

const TITLE_MAX = 100;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const km = (n: number) => `${n.toLocaleString("ko-KR")}km`;

/** 한 줄 글자(제목·값)에서 줄바꿈을 없애고 길이를 제한한다 */
export function oneLine(s: string, max = 200): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** 마크다운으로 오해될 문자를 막는다(사용자가 쓴 메모가 제목·목록 서식으로 바뀌지 않게) */
export function plain(s: string): string {
  return s.replace(/[\\`*_{}\[\]<>#|~]/g, (c) => `\\${c}`);
}

const title = (s: string) => oneLine(s, TITLE_MAX);

/** 여러 줄 메모를 인용 블록으로 */
const quote = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => `> ${plain(l.trim())}`)
    .filter((l) => l !== "> ")
    .join("\n");

export type ServiceNotionInput = {
  vehicleLabel: string;
  servicedOn: string;
  itemName: string | null;
  category: string | null;
  mileageKm: number | null;
  shopName: string | null;
  cost: number | null;
  description: string | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
  quoteAmount: number | null;
  documentImages: number;
};

export function serviceToPage(s: ServiceNotionInput): NotionPageContent {
  const what = s.itemName ?? s.category ?? "정비";
  const lines: string[] = [];
  lines.push(`**차량** ${plain(s.vehicleLabel)}`);
  lines.push(`**정비일** ${s.servicedOn}${s.mileageKm != null ? ` · **주행거리** ${km(s.mileageKm)}` : ""}`);
  if (s.shopName) lines.push(`**정비소** ${plain(s.shopName)}`);
  if (s.cost != null) lines.push(`**비용** ${won(s.cost)}`);
  const diff = compareToQuote(s.quoteAmount, s.cost);
  if (diff && s.quoteAmount != null) lines.push(`**견적 대비** 견적 ${won(s.quoteAmount)} → 실제 ${won(s.cost as number)} · ${quoteDiffText(diff, won)}`);
  const next = [s.nextDueOn, s.nextDueKm != null ? km(s.nextDueKm) : null].filter(Boolean).join(" / ");
  if (next) lines.push(`**다음 예정** ${next}`);
  if (s.documentImages > 0) lines.push(`**첨부 서류** 사진 ${s.documentImages}장 (앱에서 확인)`);
  if (s.description) lines.push("", "## 내용", quote(s.description));
  return { title: title(`${s.vehicleLabel} · ${what} (${s.servicedOn})`), markdown: lines.join("\n\n").replace(/\n\n\n+/g, "\n\n") };
}

export type InspectionNotionInput = {
  vehicleLabel: string;
  inspectedOn: string;
  isSelfCheck: boolean;
  place: string | null;
  mileageKm: number | null;
  overallStatus: Exclude<InspectionStatus, "na"> | null;
  memo: string | null;
  items: { itemName: string; category: string | null; status: InspectionStatus; note: string | null }[];
};

const STATUS_ORDER: InspectionStatus[] = ["replace", "warn", "ok", "na"];

export function inspectionToPage(r: InspectionNotionInput): NotionPageContent {
  const kind = r.isSelfCheck ? "셀프 점검" : "정비소 점검";
  const head: string[] = [];
  head.push(`**차량** ${plain(r.vehicleLabel)}`);
  head.push(`**점검일** ${r.inspectedOn}${r.mileageKm != null ? ` · **주행거리** ${km(r.mileageKm)}` : ""}`);
  if (r.place && r.place !== "셀프 점검") head.push(`**장소** ${plain(r.place)}`);
  head.push(`**종합** ${r.overallStatus ? `${STATUS_ICON[r.overallStatus]} ${STATUS_LABEL[r.overallStatus]}` : "판단할 항목 없음"}`);
  const blocks = [head.join("\n\n")];
  for (const st of STATUS_ORDER) {
    const list = r.items.filter((i) => i.status === st);
    if (list.length === 0) continue;
    blocks.push(
      [`## ${STATUS_ICON[st]} ${STATUS_LABEL[st]} (${list.length})`, ...list.map((i) => `- ${plain(i.itemName)}${i.note ? ` — ${plain(oneLine(i.note))}` : ""}`)].join("\n"),
    );
  }
  if (r.memo) blocks.push(["## 메모", quote(r.memo)].join("\n"));
  return { title: title(`${r.vehicleLabel} · ${kind} (${r.inspectedOn})`), markdown: blocks.join("\n\n") };
}

export type ComparisonNotionInput = {
  title: string;
  savedOn: string;
  trims: CompareTrim[];
  rows: CompareRow[];
};

function cellText(c: CompareCell): string {
  if (c.kind === "bool") return c.value ? "있음" : "없음";
  if (c.kind === "list") return c.items.length > 0 ? c.items.join(", ") : "-";
  return c.value ?? "-";
}

export function comparisonToPage(c: ComparisonNotionInput): NotionPageContent {
  const name = (t: CompareTrim) => `${t.brandName} ${t.modelName} ${t.trimName}`.trim();
  const blocks: string[] = [];
  blocks.push(`**비교한 차량** ${c.trims.length}대 · **저장일** ${c.savedOn}`);

  blocks.push(
    [
      "## 후보",
      ...c.trims.map((t) => {
        const price = t.price != null ? formatManwon(t.price) : "가격 미등록";
        const rating = t.rating.avg != null ? ` · 가족 평점 ${t.rating.avg.toFixed(1)}(${t.rating.count}명)` : "";
        return `- **${plain(name(t))}** — ${price}${rating}`;
      }),
    ].join("\n"),
  );

  const differing = c.rows.filter((r) => r.differs);
  if (differing.length > 0) {
    const lines: string[] = ["## 차이 나는 항목"];
    let group = "";
    for (const r of differing) {
      if (r.group !== group) {
        group = r.group;
        lines.push("", `**${plain(group)}**`);
      }
      lines.push(`- ${plain(r.label)}: ${r.cells.map((cell, i) => `${plain(c.trims[i]?.modelName ?? `${i + 1}`)} ${plain(cellText(cell))}`).join(" / ")}`);
    }
    blocks.push(lines.join("\n"));
  }

  for (const t of c.trims) {
    if (t.pros.length === 0 && t.cons.length === 0) continue;
    const lines = [`## ${plain(name(t))} 장단점`];
    for (const p of t.pros) lines.push(`- 👍 ${plain(oneLine(p))}`);
    for (const x of t.cons) lines.push(`- 👎 ${plain(oneLine(x))}`);
    blocks.push(lines.join("\n"));
  }
  return { title: title(c.title), markdown: blocks.join("\n\n") };
}

/** 노션 페이지 주소나 id 에서 32자리 id 를 꺼낸다(대시 유무 무관). 없으면 null */
export function parseNotionId(input: string | undefined | null): string | null {
  if (!input) return null;
  // 주소의 쿼리·해시·끝 슬래시를 떼고 대시를 없앤다. 노션 주소는 "제목-<32자리>" 꼴이라 id 는 항상 맨 끝에 있다.
  const stripped = input.trim().split(/[?#]/)[0].replace(/\/+$/, "").replace(/-/g, "");
  // 전부 16진수인 입력(id 만 붙여 넣은 경우)은 정확히 32자리여야 한다. 긴 문자열의 일부를 잘라 쓰지 않는다.
  if (/^[0-9a-fA-F]+$/.test(stripped)) return stripped.length === 32 ? stripped.toLowerCase() : null;
  const m = stripped.match(/([0-9a-fA-F]{32})$/);
  return m ? m[1].toLowerCase() : null;
}

/** 저장된 페이지 id 로 노션 주소를 만든다 */
export const notionPageUrl = (pageId: string) => `https://www.notion.so/${pageId.replace(/-/g, "")}`;
