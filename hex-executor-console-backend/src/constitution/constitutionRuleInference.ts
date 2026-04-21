/** 휴리스틱/탐지기 code → rule id */
export function inferRuleIdFromViolationCode(code: string): string {
  const m: Record<string, string> = {
    billing_non_store_provider: "billing",
    persistent_remote_storage: "privacy",
    manual_only_required: "operations",
    hardcoded_locale_currency_timezone: "coding",
    aws_without_exception: "runtime",
    region_shrink_review: "release",
    ast_hardcoded_locale: "locale",
    ast_hardcoded_currency: "locale",
    ast_hardcoded_timezone: "locale",
    ast_hardcoded_country: "locale",
    ast_forbidden_billing_sdk: "billing",
    ast_remote_persistent_storage: "privacy",
    ast_manual_only_marker: "operations",
    ast_aws_sdk_without_exception: "runtime",
  };
  return m[code] ?? "coding";
}
