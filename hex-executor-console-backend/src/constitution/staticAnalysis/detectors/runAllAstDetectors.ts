import type { SourceFile } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";
import { detectAwsUsageWithoutException } from "./detectAwsUsageWithoutException.js";
import { detectForbiddenBillingProvider } from "./detectForbiddenBillingProvider.js";
import { detectHardcodedCurrency } from "./detectHardcodedCurrency.js";
import { detectHardcodedLocale } from "./detectHardcodedLocale.js";
import { detectHardcodedTimezone } from "./detectHardcodedTimezone.js";
import { detectManualOnlyProcessMarkers } from "./detectManualOnlyProcessMarkers.js";
import { detectRemotePersistentStorage } from "./detectRemotePersistentStorage.js";

export type AstDetectorContext = {
  awsAllowed: boolean;
};

export function runAllAstDetectors(
  sf: SourceFile,
  fileLabel: string,
  ctx: AstDetectorContext,
): ConstitutionViolation[] {
  const v: ConstitutionViolation[] = [];
  v.push(...detectHardcodedLocale(sf, fileLabel));
  v.push(...detectHardcodedCurrency(sf, fileLabel));
  v.push(...detectHardcodedTimezone(sf, fileLabel));
  v.push(...detectForbiddenBillingProvider(sf, fileLabel));
  v.push(...detectRemotePersistentStorage(sf, fileLabel));
  v.push(...detectManualOnlyProcessMarkers(sf, fileLabel));
  v.push(...detectAwsUsageWithoutException(sf, fileLabel, ctx.awsAllowed));
  return v;
}
