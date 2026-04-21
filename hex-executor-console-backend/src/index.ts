import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyWithAiOrFallback } from "./ai/router.js";
import { executeAction } from "./executeAction.js";
import { finalizeAction } from "./enrichAction.js";
import { normalizeParsedAction } from "./normalizeParsedAction.js";
import { buildPlanPreview, type PlanPreviewPayload } from "./planPreview.js";
import { loadNeoPolicy, type ToolBreakerKey } from "./policy.js";
import { readRecentLogArtifact } from "./recentLogs.js";
import { restoreByRestorePointId } from "./restore.js";
import { verifyLatestAuditChain } from "./safekeep/auditVerify.js";
import { getSystemStatus } from "./systemStatus.js";
import {
  evaluateMutatingPipelineBreaker,
  manualResetToolBreaker,
  recordMutatingPipelineAttempt,
  recordMutatingPipelineFailure,
  recordMutatingPipelineSuccess,
} from "./toolCircuitBreaker.js";
import type { ActionRequest } from "./types.js";
import { getDefaultWorkspaceRoot } from "./workspaceRoot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3847);

const WORKSPACE_ROOT = getDefaultWorkspaceRoot();
const RUNS_DIR = path.join(WORKSPACE_ROOT, "runs");
const OUTPUT_ROOT = path.join(__dirname, "..", "output");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

await fs.mkdir(RUNS_DIR, { recursive: true });
await fs.mkdir(path.join(OUTPUT_ROOT, "screenshots"), { recursive: true });

app.use("/artifacts", express.static(OUTPUT_ROOT));

app.post("/api/command/parse", async (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "text required" });
    return;
  }

  const { loadConstitution } = await import("./constitution/loadConstitution.js");
  const { runConstitutionPreflight } = await import("./constitution/runConstitutionPreflight.js");

  let constitutionContext: {
    documentVersion: string;
    effectiveDate: string;
    ruleFileCount: number;
    awsExceptionActive: boolean;
  };

  try {
    const bundle = await loadConstitution(WORKSPACE_ROOT);
    constitutionContext = {
      documentVersion: bundle.document.version,
      effectiveDate: bundle.document.effectiveDate,
      ruleFileCount: bundle.rules.size,
      awsExceptionActive: bundle.awsExceptionActive,
    };
    const preParse = await runConstitutionPreflight({
      workspaceRoot: WORKSPACE_ROOT,
      taskKind: "planner_parse",
      workerKind: "neo",
      rawText: text,
    });
    if (!preParse.ok) {
      res.status(403).json({
        error: "constitution_preflight_denied",
        constitution: {
          summaryKo: preParse.summaryKo.fullText,
          finalMode: preParse.finalMode,
          violations: preParse.violations,
          documentVersion: bundle.document.version,
        },
      });
      return;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(503).json({ error: "constitution_unavailable", detail: msg });
    return;
  }

  const policy = await loadNeoPolicy(WORKSPACE_ROOT);
  const draft = await classifyWithAiOrFallback(text, policy);
  const normalized = normalizeParsedAction(text, draft);
  const action = await finalizeAction(normalized, WORKSPACE_ROOT);
  let planPreview: PlanPreviewPayload | null = null;

  if (action.isMutating) {
    const prev = await buildPlanPreview(action, WORKSPACE_ROOT, OUTPUT_ROOT);
    if (prev && !prev.ok) {
      res.status(400).json({ error: prev.reason, action });
      return;
    }
    if (prev?.ok) {
      planPreview = prev.preview;
    } else {
      res.status(400).json({
        error: "mutating 작업에 대한 PLAN 미리보기를 만들 수 없습니다.",
        action,
      });
      return;
    }
  }

  res.json({ action, planPreview, constitutionContext });
});

if (process.env.NEO_PARSE_DEBUG === "1") {
  app.post("/api/command/parse-debug", async (req, res) => {
    const text = String(req.body?.text ?? "").trim();
    if (!text) {
      res.status(400).json({ error: "text required" });
      return;
    }
    const policy = await loadNeoPolicy(WORKSPACE_ROOT);
    const { parseCommand } = await import("./parseCommand.js");
    const { GeminiProvider } = await import("./ai/geminiProvider.js");
    const { OllamaProvider } = await import("./ai/ollamaProvider.js");
    const det = parseCommand(text);
    const g = new GeminiProvider();
    const o = new OllamaProvider();
    let geminiOut: unknown = null;
    let ollamaOut: unknown = null;
    if (await g.isAvailable()) {
      geminiOut = await g.classifyCommand(text).catch((e) => ({ error: String(e) }));
    }
    if (await o.isAvailable()) {
      ollamaOut = await o.classifyCommand(text).catch((e) => ({ error: String(e) }));
    }
    const routed = await classifyWithAiOrFallback(text, policy);
    const normalized = normalizeParsedAction(text, routed);
    const finalized = await finalizeAction(normalized, WORKSPACE_ROOT);
    res.json({
      deterministic: det,
      gemini: geminiOut,
      ollama: ollamaOut,
      routed,
      normalized,
      finalized,
    });
  });
}

app.post("/api/command/execute", async (req, res) => {
  const body = req.body as {
    action?: ActionRequest;
    approved?: boolean;
    approvalPreviewHash?: string | null;
  };
  const action = body?.action;
  if (!action?.rawText) {
    res.status(400).json({ error: "action.rawText required" });
    return;
  }

  const policy = await loadNeoPolicy(WORKSPACE_ROOT);
  const draft = await classifyWithAiOrFallback(action.rawText, policy);
  const normalized = normalizeParsedAction(action.rawText, draft);
  const reparsed = await finalizeAction(normalized, WORKSPACE_ROOT);
  if (reparsed.intent !== action.intent || reparsed.category !== action.category) {
    res.status(409).json({
      error: "stale action — 서버 재해석 결과와 일치하지 않습니다. 다시 전송하세요.",
      action: reparsed,
    });
    return;
  }

  if (reparsed.requiresApproval && !body.approved) {
    res.status(403).json({ error: "approval required", action: reparsed });
    return;
  }

  const hash = typeof body.approvalPreviewHash === "string" ? body.approvalPreviewHash.trim() : "";

  if (reparsed.isMutating) {
    if (!hash) {
      res.status(400).json({
        error: "approvalPreviewHash required — parse 응답의 planPreview.previewHash 를 전달하세요.",
        action: reparsed,
      });
      return;
    }
    recordMutatingPipelineAttempt(policy);
    const br = evaluateMutatingPipelineBreaker(policy);
    if (br.blocked) {
      res.json({
        result: {
          ok: false,
          status: "error",
          summary: br.reason ?? "circuit breaker",
          logs: [],
          breakerBlocked: true,
          pipelineStages: {
            circuitBreaker: {
              status: "failed",
              summary: `${br.phase}: ${br.reason ?? "mutating_pipeline OPEN"}`,
            },
          },
        },
      });
      return;
    }
  }

  const result = await executeAction(reparsed, {
    workspaceRoot: WORKSPACE_ROOT,
    outputRoot: OUTPUT_ROOT,
    runsDir: RUNS_DIR,
    approved: Boolean(body.approved),
    approvalPreviewHash: hash || null,
  });

  if (reparsed.isMutating) {
    if (result.ok) recordMutatingPipelineSuccess();
    else recordMutatingPipelineFailure(policy, result.summary);
  }

  res.json({ result });
});

app.post("/api/restore/:restorePointId", async (req, res) => {
  const id = String(req.params.restorePointId ?? "").trim();
  if (!id) {
    res.status(400).json({ error: "restorePointId required" });
    return;
  }
  const out = await restoreByRestorePointId(WORKSPACE_ROOT, id);
  res.status(out.ok ? 200 : 500).json(out);
});

app.get("/api/logs/recent", async (_req, res) => {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const data = await readRecentLogArtifact(RUNS_DIR, 20);
  res.json({
    path: data.path,
    excerpt: data.excerpt,
    lineCount: data.logs.length,
  });
});

app.get("/api/audit/verify/latest", async (_req, res) => {
  const r = await verifyLatestAuditChain(WORKSPACE_ROOT);
  res.status(r.ok ? 200 : 422).json(r);
});

app.post("/api/system/breaker/reset", (req, res) => {
  const key = String(req.body?.key ?? "").trim() as ToolBreakerKey;
  const allowed: ToolBreakerKey[] = [
    "gemini",
    "ollama",
    "emulator",
    "adb",
    "file_move_mutation",
    "mutating_pipeline",
  ];
  if (!allowed.includes(key)) {
    res.status(400).json({ error: "invalid breaker key" });
    return;
  }
  manualResetToolBreaker(key);
  res.json({ ok: true, key });
});

app.get("/api/system/status", async (_req, res) => {
  const status = await getSystemStatus(WORKSPACE_ROOT);
  res.json(status);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, workspaceRoot: WORKSPACE_ROOT });
});

app.listen(PORT, () => {
  console.log(`Neo Local Operator API http://localhost:${PORT}`);
  console.log(`NEO_WORKSPACE_ROOT=${WORKSPACE_ROOT}`);
});
