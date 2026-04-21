import type { ConstitutionEnforcementMode, ConstitutionViolation } from "./constitutionTypes.js";

const DENY = (code: string, message: string, evidence?: string): ConstitutionViolation => ({
  code,
  message,
  mode: "deny",
  evidence,
});

const WARN = (code: string, message: string, evidence?: string): ConstitutionViolation => ({
  code,
  message,
  mode: "warn",
  evidence,
});

/** 텍스트 기반 1차 휴리스틱 (AST는 staticAnalysis에서 병행) */
export function evaluateConstitutionText(
  text: string,
  opts: { awsFreeTierAllowed: boolean },
): ConstitutionViolation[] {
  const t = text;
  const lower = t.toLowerCase();
  const out: ConstitutionViolation[] = [];

  if (/(?:stripe|paypal)\s*(?:sdk|checkout|billing|integration)/i.test(t)) {
    out.push(
      DENY(
        "billing_non_store_provider",
        "스토어 외 결제(Stripe/PayPal 등) 통합 흔적 — Android는 Google Billing, iOS는 App Store만 허용",
        lower.slice(0, 200),
      ),
    );
  }

  if (/\bmongodb:\/\/|s3:\/\/|firebaseio\.com|\.firebasestorage\./i.test(t)) {
    out.push(
      DENY(
        "persistent_remote_storage",
        "원격 영속 저장/중앙 DB 의존 패턴 감지 — 헌법상 제로저장·무중앙 원칙 위반 소지",
        lower.slice(0, 200),
      ),
    );
  }

  if (/\bmanual[-_ ]only\b|must\s+be\s+done\s+manually|수동으로만\s*필수|반드시\s*수동/i.test(t)) {
    out.push(DENY("manual_only_required", "수동만 필수로 하는 절차는 제로휴먼/제로수동 원칙에 맞지 않음", lower.slice(0, 200)));
  }

  if (/\b(locale|currency|timezone)\s*[:=]\s*["'](?:ko-KR|en-US|USD|KRW)["']/i.test(t)) {
    out.push(
      DENY(
        "hardcoded_locale_currency_timezone",
        "고정 locale/currency/timezone 리터럴 — 디바이스 스캔·런타임 컨텍스트로 대체 필요",
        lower.slice(0, 120),
      ),
    );
  }

  if (/\baws\s+(lambda|ec2|rds|dynamodb)\b/i.test(t) && !opts.awsFreeTierAllowed) {
    out.push(
      WARN(
        "aws_without_exception",
        "AWS 리소스 언급 — Free Tier 예외 문서/승인(active)이 없으면 런타임 정책과 충돌할 수 있음",
        lower.slice(0, 160),
      ),
    );
  }

  if (/출시\s*지역\s*(?:을|를)?\s*(?:한국|미국|일본)\s*만|kr\s*only|us\s*only/i.test(t)) {
    out.push(
      WARN(
        "region_shrink_review",
        "출시 지역을 기본(전역)에서 축소하는 표현 — 규제 예외 문서와 정합성 검토 필요",
        lower.slice(0, 160),
      ),
    );
  }

  return out;
}

export { worstMode } from "./constitutionLifecycle.js";
