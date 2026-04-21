/**
 * App Factory — Constitution as code (types)
 */

export type ConstitutionEnforcementMode = "allow" | "observe" | "warn" | "deny";

export type RuleLifecycleStage = "observe" | "warn" | "deny";

export type DetectorKind = "schema" | "ast" | "heuristic";

export type ConstitutionTaskKind =
  | "neo_action"
  | "mutation_pipeline"
  | "planner_parse"
  | "host_executor"
  | "ollama_sandbox"
  | "smoke_run"
  | "orchestrator"
  | "e2e_run"
  | "bundle_finalize"
  | "code_mutation"
  | "payment_integration"
  | "storage_access"
  | "release_prepare"
  | "app_scaffold";

export type ConstitutionWorkerKind =
  | "neo"
  | "host"
  | "sandbox"
  | "smoke"
  | "orchestrator"
  | "external";

export type ConstitutionDocument = {
  version: string;
  effectiveDate: string;
  owners?: string[];
  defaultEnforcementMode?: ConstitutionEnforcementMode;
  principles?: Array<{ id?: string; title?: string }>;
  ruleRefs: string[];
  exceptionPolicy?: Record<string, unknown>;
  auditPolicy?: Record<string, unknown>;
};

export type ConstitutionRule = {
  id: string;
  title?: string;
  lifecycleStage?: RuleLifecycleStage;
  promotionCriteria?: string;
  falsePositiveNotes?: string;
  lastReviewedAt?: string;
  [key: string]: unknown;
};

export type ConstitutionViolation = {
  code: string;
  message: string;
  mode: ConstitutionEnforcementMode;
  ruleId?: string;
  lifecycleStage?: RuleLifecycleStage;
  evidence?: string;
  detectorKind?: DetectorKind;
  filePath?: string;
  line?: number;
  column?: number;
  evidenceSnippet?: string;
  autoFixHint?: string;
  repeatedViolationScore?: number;
};

export type ConstitutionSummaryKo = {
  headline: string;
  body: string;
  fullText: string;
};

export type StaticAnalysisPreflightOpts = {
  backendRoot: string;
  /** 기본: [`${backendRoot}/src`] */
  scanRoots?: string[];
  changedFiles?: string[];
  maxFiles?: number;
};

export type ConstitutionPreflightInput = {
  workspaceRoot: string;
  taskKind: ConstitutionTaskKind;
  workerKind: ConstitutionWorkerKind;
  rawText: string;
  actionIntent?: string;
  goalId?: string;
  targetAppId?: string;
  capabilities?: string[];
  scenarioId?: string;
  /** 실행 환경 (예외 scope 매칭) */
  environment?: string;
  staticAnalysis?: StaticAnalysisPreflightOpts;
};

export type ConstitutionPreflightResult = {
  ok: boolean;
  finalMode: ConstitutionEnforcementMode;
  evaluatedRuleIds: string[];
  violations: ConstitutionViolation[];
  requiredOverrides: string[];
  recommendedAutoFixes: string[];
  summaryKo: ConstitutionSummaryKo;
  documentVersion: string;
  schemaDigest?: string;
  astScannedFiles?: string[];
  resolutionSnapshot?: ConstitutionResolutionSnapshot;
};

export type ConstitutionResolutionSnapshot = {
  documentVersion: string;
  schemaDigest: string;
  evaluatedRuleIds: string[];
  exceptionBundleKinds: string[];
  expiredExceptionIds: string[];
};

export type ConstitutionAuditInput = {
  workspaceRoot: string;
  taskKind: ConstitutionTaskKind;
  workerKind?: ConstitutionWorkerKind;
  rawText?: string;
  actionIntent?: string;
  goalId?: string;
  artifactText: string;
  driftHints?: string[];
  environment?: string;
  staticAnalysis?: StaticAnalysisPreflightOpts;
};

export type ConstitutionAuditResult = {
  ok: boolean;
  finalMode: ConstitutionEnforcementMode;
  violations: ConstitutionViolation[];
  driftDetected: boolean;
  summaryKo: ConstitutionSummaryKo;
  reportPath?: string;
  recommendedAutoFixes: string[];
  documentVersion: string;
  astScannedFiles?: string[];
};
