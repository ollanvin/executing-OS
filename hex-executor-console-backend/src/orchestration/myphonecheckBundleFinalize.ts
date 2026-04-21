/**
 * MyPhoneCheck 캡처 번들 — e2e 검증·UX 마크다운 리포트 (smoke / 오케스트레이터 공용).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { MYPHONECHECK_MIN_TOTAL_CAPTURES } from "../policy/myphonecheckScreenPolicy.js";
import type {
  E2eMyPhoneBundleVerification,
  E2eScreenCaptureVerification,
  ExecuteResult,
  ScreenCaptureSummary,
} from "../types.js";

export type MyPhoneCheckCaptureCounts = {
  onboarding: number;
  module: number;
  scenario: number;
  auto: number;
  total: number;
};

export type FinalizeMyPhoneCheckBundleOutcome = {
  bundlePath: string | null;
  e2eVerification: E2eMyPhoneBundleVerification;
  screenCap: ScreenCaptureSummary | undefined;
  captureCounts: MyPhoneCheckCaptureCounts;
  reportPath: string | null;
  summaryOut: string;
};

export async function findLatestMyPhoneCheckBundlePath(outputRoot: string): Promise<string | null> {
  const delivery = path.join(outputRoot, "control-plane-delivery");
  try {
    const dirs = await fs.readdir(delivery, { withFileTypes: true });
    const latest = dirs
      .filter((d) => d.isDirectory() && d.name.startsWith("myphonecheck-"))
      .map((d) => d.name)
      .sort()
      .pop();
    return latest ? path.join(delivery, latest) : null;
  } catch {
    return null;
  }
}

/** 워크플로 결과 + 번들 디스크 스캔으로 e2eVerification·캡처 집계 */
export async function computeMyPhoneCheckBundleE2e(
  result: ExecuteResult,
  outputRoot: string,
): Promise<Omit<FinalizeMyPhoneCheckBundleOutcome, "reportPath" | "summaryOut">> {
  const bundlePath = await findLatestMyPhoneCheckBundlePath(outputRoot);

  let onboardingN = 0;
  let moduleN = 0;
  let scenarioN = 0;
  let autoN = 0;
  let manifestOk = false;
  let manifestScreenSummary: ScreenCaptureSummary | undefined;
  if (bundlePath) {
    const ob = path.join(bundlePath, "captures", "onboarding");
    const md = path.join(bundlePath, "captures", "module");
    const sc = path.join(bundlePath, "captures", "scenario");
    const au = path.join(bundlePath, "captures", "auto");
    try {
      onboardingN = (await fs.readdir(ob)).filter((f) => f.endsWith(".png")).length;
    } catch {
      onboardingN = 0;
    }
    try {
      moduleN = (await fs.readdir(md)).filter((f) => f.endsWith(".png")).length;
    } catch {
      moduleN = 0;
    }
    try {
      scenarioN = (await fs.readdir(sc)).filter((f) => f.endsWith(".png")).length;
    } catch {
      scenarioN = 0;
    }
    try {
      autoN = (await fs.readdir(au)).filter((f) => f.endsWith(".png")).length;
    } catch {
      autoN = 0;
    }
    try {
      await fs.access(path.join(bundlePath, "manifest.json"));
      manifestOk = true;
      try {
        const raw = await fs.readFile(path.join(bundlePath, "manifest.json"), "utf8");
        const m = JSON.parse(raw) as { screenCaptureSummary?: ScreenCaptureSummary };
        manifestScreenSummary = m.screenCaptureSummary;
      } catch {
        manifestScreenSummary = undefined;
      }
    } catch {
      manifestOk = false;
    }
  }

  const screenCap = result.screenCaptureSummary ?? manifestScreenSummary;
  const totalPng =
    screenCap?.totalScreensCaptured ?? onboardingN + moduleN + scenarioN + autoN;
  const distinctScreenIds = screenCap?.distinctScreenIds;
  const perCategoryCounts = screenCap?.perCategoryCounts;
  const missingCategories = screenCap?.missingCategories ?? [];

  const e2eMissing: string[] = [];
  if (!result.hostExecutionTrace?.length) e2eMissing.push("hostExecutionTrace (expected ≥1 entry)");
  if (result.sandboxBridgeJob?.status !== "ok") e2eMissing.push("sandboxBridgeJob.status===ok");
  if (autoN < 1) e2eMissing.push("captureCounts.auto>=1");

  const reportGaps: string[] = [];
  const minReq = screenCap?.minScreensRequired ?? MYPHONECHECK_MIN_TOTAL_CAPTURES;
  if (totalPng < minReq) {
    reportGaps.push(`screen_capture_total_screens_below_min (${totalPng} < ${minReq})`);
  }
  if (missingCategories.length > 0) {
    reportGaps.push(`screen_capture_missing_categories: ${missingCategories.join(", ")}`);
  }

  const escTrace = result.emulatorScreenCaptureTrace ?? [];
  const emulatorWindowCropOk = escTrace.some(
    (e) =>
      e.ok &&
      e.captureBackend === "host_window" &&
      e.rect !== null &&
      e.rect.width > 0 &&
      e.rect.height > 0,
  );
  const emulatorWindowNotFound = escTrace.some(
    (e) => !e.ok && /emulator window not found|emulator_window_not_found/i.test(e.summary),
  );
  if (emulatorWindowNotFound) {
    reportGaps.push("screen_capture_emulator_window_not_found");
  }

  const backendsUsed = [...new Set(escTrace.map((e) => e.captureBackend))];
  const distinctCaptured = screenCap?.distinctScreenIds ?? distinctScreenIds ?? 0;

  const screenCapture: E2eScreenCaptureVerification = {
    minScreensRequired: minReq,
    totalScreensCaptured: totalPng,
    distinctScreenIdsCaptured: distinctCaptured,
    perCategoryCounts: perCategoryCounts ?? {},
    backendsUsed: backendsUsed.length ? backendsUsed : escTrace.length === 0 ? [] : ["host_window"],
    emulatorWindowCropOk,
  };

  const e2eVerification: E2eMyPhoneBundleVerification = {
    ok: e2eMissing.length === 0,
    missing: e2eMissing,
    minScreensRequired: minReq,
    totalScreensCaptured: totalPng,
    distinctScreenIds,
    distinctScreenIdsCaptured: distinctCaptured,
    perCategoryCounts,
    missingCategories: missingCategories.length ? missingCategories : undefined,
    reportGaps: reportGaps.length ? reportGaps : undefined,
    screenCapture,
  };

  return {
    bundlePath,
    e2eVerification,
    screenCap,
    captureCounts: {
      onboarding: onboardingN,
      module: moduleN,
      scenario: scenarioN,
      auto: autoN,
      total: totalPng,
    },
  };
}

export async function writeMyPhoneCheckUxReportMarkdown(opts: {
  outputRoot: string;
  packageName: string | null;
  userGoalText: string;
  result: ExecuteResult;
  bundlePath: string | null;
  e2eVerification: E2eMyPhoneBundleVerification;
  screenCap: ScreenCaptureSummary | undefined;
  captureCounts: MyPhoneCheckCaptureCounts;
}): Promise<string | null> {
  const { outputRoot, packageName: pkg, userGoalText, result, bundlePath, e2eVerification, screenCap, captureCounts } =
    opts;
  if (!bundlePath) return null;

  const delivery = path.join(outputRoot, "control-plane-delivery");
  const reportPath = path.join(
    delivery,
    `report-myphonecheck-ux-${path.basename(bundlePath).replace(/^myphonecheck-/, "")}.md`,
  );
  const { onboarding: onboardingN, module: moduleN, scenario: scenarioN, auto: autoN, total: totalPng } =
    captureCounts;
  const perCategoryCounts = screenCap?.perCategoryCounts;
  const missingCategories = screenCap?.missingCategories ?? [];
  const reportGaps = e2eVerification.reportGaps ?? [];
  const minReq = e2eVerification.minScreensRequired ?? MYPHONECHECK_MIN_TOTAL_CAPTURES;
  const distinctCaptured = e2eVerification.distinctScreenIdsCaptured ?? 0;
  const distinctScreenIds = e2eVerification.distinctScreenIds;
  const screenCapture = e2eVerification.screenCapture;
  if (!screenCapture) {
    return null;
  }
  const emulatorWindowCropOk = screenCapture.emulatorWindowCropOk;

  let manifestOk = false;
  try {
    await fs.access(path.join(bundlePath, "manifest.json"));
    manifestOk = true;
  } catch {
    manifestOk = false;
  }

  let summaryOut = result.summary ?? "";
  if (result.ok && !e2eVerification.ok) {
    summaryOut = `${summaryOut} | e2e verification gaps: ${e2eVerification.missing.join("; ")}`;
  } else if (result.ok && reportGaps.length) {
    summaryOut = `${summaryOut} | screen coverage notes: ${reportGaps.join("; ")}`;
  }

  const uxEx = (process.env.NEO_UX_EXCEPTION_PHYSICAL_DEVICE ?? "").trim() === "1";
  let autoSampleLines = "- (none)";
  if (autoN > 0) {
    try {
      const au = path.join(bundlePath, "captures", "auto");
      const files = (await fs.readdir(au)).filter((f) => f.endsWith(".png")).sort();
      autoSampleLines = files
        .slice(0, 8)
        .map((f) => `- \`captures/auto/${f}\``)
        .join("\n");
    } catch {
      autoSampleLines = "- (could not list)";
    }
  }

  const screenTableRows =
    screenCap?.screenIdsBySource?.length ?
      screenCap.screenIdsBySource
        .map(
          (row) =>
            `| \`${row.shortId}\` | ${row.label ?? "—"} | ${row.category ?? "—"} | \`${row.source}\` |`,
        )
        .join("\n")
    : "| — | — | — | — |";

  const hostTraceMd =
    result.hostExecutionTrace?.length && result.hostExecutionTrace[0] ?
      result.hostExecutionTrace
        .map(
          (h, i) =>
            `### Trace block ${i + 1} (\`${h.workflowStepId}\`)\n\n` +
            (h.results
              ?.map((r) => `- **${r.taskKind}** ok=${r.ok} — ${r.summary}`)
              .join("\n") ?? "(no results)"),
        )
        .join("\n\n")
    : "(none)";

  const sandboxMd = result.sandboxBridgeJob
    ? `- **jobId:** \`${result.sandboxBridgeJob.jobId}\`
- **status:** ${result.sandboxBridgeJob.status}
- **summary:** ${result.sandboxBridgeJob.summary}
- **sharedRoot:** \`${result.sandboxBridgeJob.sharedRoot}\`
- **artifacts:** ${result.sandboxBridgeJob.artifacts?.join(", ") ?? "(none)"}`
    : "(none)";

  const targetsMd = result.executionTargetsUsed?.length
    ? result.executionTargetsUsed.map((t) => `- \`${t}\``).join("\n")
    : "(none)";

  const dispatchMd = result.dispatchAudit?.length
    ? result.dispatchAudit.map((d) => `- **${d.routedId}** → \`${d.target}\` — ${d.summary}`).join("\n")
    : "(none)";

  const catJson = perCategoryCounts ? JSON.stringify(perCategoryCounts, null, 2) : "(n/a)";

  const escTraceMd =
    result.emulatorScreenCaptureTrace?.length ?
      result.emulatorScreenCaptureTrace
        .map((e) => {
          const r = e.rect ? `${e.rect.width}×${e.rect.height} @ (${e.rect.x},${e.rect.y})` : "—";
          const sum = e.summary.slice(0, 100) + (e.summary.length > 100 ? "…" : "");
          return `- **${e.phase}** \`${e.screenIdShort}\` | backend=\`${e.captureBackend}\` | rect=${r} | ok=${e.ok} — ${sum}`;
        })
        .join("\n")
    : "(none — screen_capture events not present in result)";

  const coreCats = ["home", "settings", "timeline", "call_check", "sms_check", "camera_check", "mic_check", "overlay"];
  const covered = coreCats.filter((c) => (perCategoryCounts?.[c] ?? 0) >= 1);
  const coreCoverageLine =
    covered.length >= coreCats.length ?
      "all listed categories have ≥1 capture (perCategoryCounts)"
    : `partial: ${covered.length}/${coreCats.length} (${covered.join(", ") || "none"})`;

  const body = `# MyPhoneCheck UX capture report (ScreenId / 에뮬 화면 캡처)

## Emulator / Simulator Screen Capture Summary

- **Total PNGs (bundle):** ${totalPng}
- **Distinct ScreenIds:** ${distinctCaptured}
- **Backends used:** ${screenCapture.backendsUsed.join(", ")}
- **emulatorWindowCropOk:** ${emulatorWindowCropOk ? "true" : "false"} (host_window + 유효 창 rect ≥1건)
- **Core categories (home/settings/timeline/…/overlay):** ${coreCoverageLine}
- **reportGaps:** ${reportGaps.length ? reportGaps.join("; ") : "(none)"}

---

- **Constitution:** \`docs/OPERATING-CONSTITUTION.md\` (emulator-first; physical = UX exception only)
- **Package:** \`${pkg}\`
- **Target mode:** ${uxEx ? "UX exception (physical allowed by env)" : "default (emulator / virtualized target)"}
- **Bundle:** \`${bundlePath}\`
- **User goal:** ${userGoalText}
- **e2e verification (hard):** ${e2eVerification.ok ? "PASS" : "GAPS"} ${e2eVerification.missing.length ? `— missing: ${e2eVerification.missing.join("; ")}` : ""}
- **Screen coverage (soft):** min=${minReq}, total=${totalPng}, distinctScreenIds=${distinctScreenIds ?? "n/a"} ${reportGaps.length ? `— notes: ${reportGaps.join("; ")}` : ""}

## Capture backend & window rect (host_window)

시나리오·자동탐색 PNG는 **Android Emulator 창만** 잘라 저장합니다 (\`targetWindowHint=android_emulator\`, Windows + GetWindowRect + CopyFromScreen). ScreenId 판별은 기존처럼 ADB UI 덤프를 사용합니다.

${escTraceMd}

### Window rect detail (per capture)

| phase | ScreenIdShort | backend | rect (W×H) | ok |
|-------|---------------|---------|------------|-----|
${result.emulatorScreenCaptureTrace?.length ?
      result.emulatorScreenCaptureTrace
        .map(
          (e) =>
            `| ${e.phase} | \`${e.screenIdShort}\` | ${e.captureBackend} | ${e.rect ? `${e.rect.width}×${e.rect.height}` : "—"} | ${e.ok} |`,
        )
        .join("\n")
    : "| — | — | — | — | — |"}

## Capture counts

| kind | count |
|------|-------|
| onboarding | ${onboardingN} |
| module | ${moduleN} |
| scenario | ${scenarioN} |
| auto (ScreenId explore) | ${autoN} |
| **total** | **${totalPng}** |

## Screens captured (by ScreenId)

| short ScreenId | label | category | source |
|----------------|-------|----------|--------|
${screenTableRows}

- **perCategoryCounts (JSON):**

\`\`\`json
${catJson}
\`\`\`

- **missingCategories (scenario expected):** ${missingCategories.length ? missingCategories.map((c) => `\`${c}\``).join(", ") : "(none)"}

## Execution targets used (order)

${targetsMd}

## Dispatcher audit

${dispatchMd}

## Flow captured

- **Onboarding PNGs:** ${onboardingN} file(s) under \`captures/onboarding/\`
- **Module PNGs:** ${moduleN} file(s) under \`captures/module/\`
- **Scenario PNGs:** ${scenarioN} file(s) under \`captures/scenario/\`
- **Auto (ScreenId exploration) PNGs:** ${autoN} file(s) under \`captures/auto/\`
- **manifest.json:** ${manifestOk ? "present" : "missing"}

## Host Executor trace

${hostTraceMd}

## Sandbox bridge job

${sandboxMd}

## Auto captured states (explore)

- **Total auto screenshots (this run):** ${autoN}
- **Sample paths (up to 8):**

${autoSampleLines}

## Final bundle contents

- **Relative (from output):** \`${path.relative(outputRoot, bundlePath).split(path.sep).join("/")}\`
- **Counts:** onboarding=${onboardingN}, module=${moduleN}, scenario=${scenarioN}, auto=${autoN}, manifest=${manifestOk ? "yes" : "no"}

## 1–3 line UX assessment (human / control-plane first pass)

- ScreenId 기준으로 같은 질적 화면은 1장으로 묶이고, 시나리오·자동탐색이 서로 시드를 넘겨 중복 촬영을 줄입니다.
- \`reportGaps\` / \`missingCategories\`가 있으면 네비게이션 키 시퀀스(\`myphonecheckScreenPolicy\`) 또는 기기 해상도를 조정할 여지가 있습니다.

## Suspected UX issues

- (Fill on review) e.g. unexpected permission dialog order, missing module screen, blank capture.

## Raw result summary

\`\`\`text
${summaryOut || "(no summary)"}
\`\`\`
`;
  await fs.writeFile(reportPath, body, "utf8");
  return reportPath;
}

/** e2e 계산 + (옵션) UX 리포트 — 한 번에 */
export async function finalizeMyPhoneCheckCaptureBundle(opts: {
  result: ExecuteResult;
  outputRoot: string;
  workspaceRoot: string;
  packageName: string | null;
  userGoalText: string;
  writeReport: boolean;
}): Promise<FinalizeMyPhoneCheckBundleOutcome> {
  const { result, outputRoot, packageName, userGoalText, writeReport } = opts;
  const computed = await computeMyPhoneCheckBundleE2e(result, outputRoot);

  let summaryOut = result.summary ?? "";
  if (result.ok && !computed.e2eVerification.ok) {
    summaryOut = `${summaryOut} | e2e verification gaps: ${computed.e2eVerification.missing.join("; ")}`;
  } else if (result.ok && (computed.e2eVerification.reportGaps?.length ?? 0) > 0) {
    summaryOut = `${summaryOut} | screen coverage notes: ${(computed.e2eVerification.reportGaps ?? []).join("; ")}`;
  }

  let reportPath: string | null = null;
  if (writeReport && computed.bundlePath) {
    reportPath = await writeMyPhoneCheckUxReportMarkdown({
      outputRoot,
      packageName,
      userGoalText,
      result,
      bundlePath: computed.bundlePath,
      e2eVerification: computed.e2eVerification,
      screenCap: computed.screenCap,
      captureCounts: computed.captureCounts,
    });
  }

  return {
    ...computed,
    reportPath,
    summaryOut,
  };
}
