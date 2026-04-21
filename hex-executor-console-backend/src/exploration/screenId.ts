/**
 * 질적 화면 단위 ScreenId — activity / 제목 / 탭 / 거친 레이아웃 시그니처 기반.
 * 시계·숫자만·짧은 동적 텍스트 등은 노이즈로 제외(보수적으로 같은 화면에 묶임).
 */
import { createHash } from "node:crypto";

export type ScreenId = string;

export type ScreenIdComponents = {
  activity: string;
  title: string;
  tabs: string[];
  layoutSignature: string;
};

const NOISE_TEXT =
  /^(?:\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?|\d+\s*%|%\d+|\d{1,3}(?:,\d{3})*$|now|today|yesterday|just now|방금|\d+분 전|\d+초 전)$/i;

function isNoiseText(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 2 || t.length > 120) return true;
  if (NOISE_TEXT.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(t)) return true;
  return false;
}

/** node 태그 한 줄에서 bounds 파싱 */
function parseBounds(tag: string): [number, number, number, number] | null {
  const m = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function parseText(tag: string): string {
  const m = tag.match(/text="([^"]*)"/);
  return (m?.[1] ?? "").trim();
}

function parseClass(tag: string): string {
  const m = tag.match(/class="([^"]+)"/);
  return (m?.[1] ?? "").split(".").pop() ?? "";
}

function parseResourceId(tag: string): string {
  const m = tag.match(/resource-id="([^"]*)"/);
  return (m?.[1] ?? "").trim();
}

/**
 * 화면 높이를 모를 때 상대 구역 — XML 전체에서 최대 bounds로 근사.
 */
function estimateScreenHeight(xml: string): number {
  let maxY = 800;
  const re = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const y2 = Number(m[4]);
    if (y2 > maxY) maxY = y2;
  }
  return Math.max(400, maxY);
}

/**
 * 상단 앱바/툴바 후보 텍스트 (상단 28% 영역).
 */
function extractTitleCandidates(xml: string): string[] {
  const h = estimateScreenHeight(xml);
  const yTop = h * 0.28;
  const out: string[] = [];
  const re = /<node\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0]!;
    const b = parseBounds(tag);
    if (!b) continue;
    const [, y1, , y2] = b;
    const cy = (y1 + y2) / 2;
    if (cy > yTop) continue;
    const text = parseText(tag);
    if (!text || isNoiseText(text)) continue;
    const rid = parseResourceId(tag).toLowerCase();
    const cls = parseClass(tag).toLowerCase();
    const prefer =
      /title|toolbar|action_bar|appbar|header|collapsing/.test(rid) ||
      /toolbar|actionbar|textview|materialtextview/.test(cls);
    if (prefer || text.length >= 3) out.push(text);
  }
  const uniq = [...new Set(out)];
  return uniq.slice(0, 3);
}

/**
 * 하단 탭바 후보 (하단 20% + 짧은 라벨).
 */
function extractTabLabels(xml: string): string[] {
  const h = estimateScreenHeight(xml);
  const yMin = h * 0.8;
  const out: string[] = [];
  const re = /<node\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0]!;
    const b = parseBounds(tag);
    if (!b) continue;
    const [, y1] = b;
    if (y1 < yMin) continue;
    const text = parseText(tag);
    if (!text || text.length > 24 || isNoiseText(text)) continue;
    if (!/clickable="true"/.test(tag) && !/selected="true"/.test(tag)) continue;
    out.push(text);
  }
  return [...new Set(out)].slice(0, 8).sort();
}

/**
 * RecyclerView / ViewPager / WebView 등 거친 구조 시그니처.
 */
function coarseLayoutSignature(xml: string): string {
  const counts: Record<string, number> = {};
  const interesting = [
    "RecyclerView",
    "ListView",
    "ViewPager",
    "ViewPager2",
    "WebView",
    "ScrollView",
    "NestedScrollView",
    "FragmentContainerView",
    "BottomNavigationView",
    "TabLayout",
  ];
  for (const k of interesting) counts[k] = 0;
  const re = /class="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const full = m[1] ?? "";
    for (const k of interesting) {
      if (full.endsWith(k)) counts[k]!++;
    }
  }
  const parts = interesting.filter((k) => counts[k]! > 0).map((k) => `${k}:${counts[k]}`);
  return parts.length > 0 ? parts.join("|") : "flat";
}

export function buildScreenIdComponents(activity: string, hierarchyXml: string): ScreenIdComponents {
  const titles = extractTitleCandidates(hierarchyXml);
  const title = titles[0] ?? "";
  const tabs = extractTabLabels(hierarchyXml);
  const layoutSignature = coarseLayoutSignature(hierarchyXml);
  return {
    activity: activity || "unknown",
    title,
    tabs,
    layoutSignature,
  };
}

/** 사람이 읽기 쉬운 짧은 라벨(리포트용) */
export function roughLabelFromComponents(c: ScreenIdComponents): string {
  const t = c.title || "(no title)";
  const tabHint = c.tabs.length ? ` [${c.tabs.slice(0, 3).join(",")}]` : "";
  const shortAct = c.activity.split("/").pop() ?? c.activity;
  return `${shortAct}: ${t}${tabHint}`;
}

/**
 * 질적 화면 ID — 동일 화면에서 시계/카운터만 바뀌면 title/tabs/layoutSignature 가 동일해져야 함.
 */
export function computeScreenId(activity: string, hierarchyXml: string): ScreenId {
  const c = buildScreenIdComponents(activity, hierarchyXml);
  const tabPart = c.tabs.join(",");
  const canonical = `activity:${c.activity}|title:${c.title}|tabs:${tabPart}|layout:${c.layoutSignature}`;
  return createHash("sha256").update(canonical).digest("hex");
}

export function shortScreenId(full: ScreenId): string {
  return full.slice(0, 12);
}

/** 번들 파일명용 — 동일 ScreenId 비교·나란히 배치 시 짧은 키 (hex 8자). */
export function screenIdFileTag(full: ScreenId): string {
  return full.slice(0, 8);
}

/** XML 전체(절단) 해시 — 정밀 상태·탐색 보조용 */
export function computeStateId(activity: string, hierarchyXml: string): string {
  const body = hierarchyXml.length > 12_000 ? hierarchyXml.slice(0, 12_000) : hierarchyXml;
  return createHash("sha256").update(`${activity}\n${body}`).digest("hex");
}

export function shortStateId(full: string): string {
  return full.slice(0, 12);
}
