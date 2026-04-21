import type { LoadedConstitutionBundle } from "./loadConstitution.js";
import { scopeMatches, type ConstitutionExecutionContext } from "./constitutionScope.js";

/** 예외 번들 + scope 기준 AWS Free Tier 예외 적용 여부 */
export function resolveAwsFreeTierAllowed(
  bundle: LoadedConstitutionBundle,
  ctx: ConstitutionExecutionContext,
): boolean {
  return bundle.exceptionBundles.aws.exceptions.some((e) => scopeMatches(e.scope, ctx));
}
