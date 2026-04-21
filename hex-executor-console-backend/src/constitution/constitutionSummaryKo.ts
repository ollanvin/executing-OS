import type {
  ConstitutionAuditResult,
  ConstitutionPreflightResult,
  ConstitutionSummaryKo,
  ConstitutionViolation,
} from "./constitutionTypes.js";

function formatViolationsKo(v: ConstitutionViolation[]): string {
  if (!v.length) return "";
  return v
    .map((x) => {
      const tag =
        x.mode === "deny" ? "[차단]"
        : x.mode === "warn" ? "[경고]"
        : x.mode === "observe" ? "[관찰]"
        : "";
      const det = x.detectorKind ? `(${x.detectorKind})` : "";
      return `${tag}${det} ${x.message}`.trim();
    })
    .join("\n");
}

export function buildPreflightSummaryKo(
  ok: boolean,
  violations: ConstitutionViolation[],
  documentVersion: string,
): ConstitutionSummaryKo {
  const body = formatViolationsKo(violations);
  const headline = ok ? "헌법 사전검사 통과" : "헌법 사전검사에서 차단 사유가 있습니다";
  const fullText = `${headline} (헌법 ${documentVersion})\n${body || "(위반 없음)"}`;
  return { headline, body: body || "(위반 없음)", fullText };
}

export function buildAuditSummaryKo(
  ok: boolean,
  violations: ConstitutionViolation[],
  drift: boolean,
  documentVersion: string,
): ConstitutionSummaryKo {
  const body = formatViolationsKo(violations);
  const driftLine = drift ? "\n드리프트(실행 결과물이 헌법과 어긋날 가능성) 감지." : "";
  const headline = ok ? "실행 후 헌법 감사 통과" : "실행 후 헌법 감사에서 문제가 발견되었습니다";
  const fullText = `${headline} (헌법 ${documentVersion})${driftLine}\n${body || "(추가 위반 없음)"}`;
  return { headline, body: (body || "(추가 위반 없음)") + driftLine, fullText };
}

export function mergeConstitutionSummariesKo(
  pre: ConstitutionPreflightResult,
  audit: ConstitutionAuditResult,
): ConstitutionSummaryKo {
  const fullText = `[사전검사] ${pre.summaryKo.headline}\n${pre.summaryKo.body}\n\n[사후감사] ${audit.summaryKo.headline}\n${audit.summaryKo.body}`;
  return {
    headline: `${pre.summaryKo.headline} / ${audit.summaryKo.headline}`,
    body: `${pre.summaryKo.body}\n---\n${audit.summaryKo.body}`,
    fullText,
  };
}
