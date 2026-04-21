/**
 * Neo Local Operator 운영 검증 스모크 러너.
 *
 * 실행: npm run smoke:operator
 *
 * 환경:
 * - SMOKE_HTTP_BASE=http://127.0.0.1:3847 — API가 떠 있을 때 system status / parse-debug HTTP 검증
 * - SMOKE_SKIP_RESTORE=1 — 파일 이동·복구 시나리오 생략
 * - NEO_PARSE_DEBUG=1 — 서버 쪽; SMOKE_HTTP_BASE 와 함께 parse-debug 호출
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allowOllamaFallbackAfterGemini } from "../ai/fallbackPolicy.js";
import {
  classifyWithAiOrFallback,
  getLlmInvocationCountForVerification,
  resetLlmInvocationCountForVerification,
} from "../ai/router.js";
import { executeAction } from "../executeAction.js";
import { finalizeAction } from "../enrichAction.js";
import { normalizeParsedAction } from "../normalizeParsedAction.js";
import { buildPlanPreview } from "../planPreview.js";
import { loadNeoPolicy, type NeoPolicy } from "../policy.js";
import { restoreByRestorePointId } from "../restore.js";
import { verifyAuditLogFile, verifyLatestAuditChain } from "../safekeep/auditVerify.js";
import {
  evaluateMutatingPipelineBreaker,
  evaluateToolBreaker,
  getToolBreakerSnapshot,
  manualResetToolBreaker,
  recordMutatingPipelineAttempt,
  recordToolFailure,
  recordToolSuccess,
  resetToolBreakerBucketsForVerification,
} from "../toolCircuitBreaker.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

const __smokeDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__smokeDir, "..", "..");
const outputRoot = path.join(backendRoot, "output");

type Snap = {
  category: string;
  intent: string;
  mutationKind: string;
  previewHash: string | null;
};

async function parseToSnap(ws: string, text: string, policy: NeoPolicy): Promise<Snap> {
  const draft = await classifyWithAiOrFallback(text, policy);
  const norm = normalizeParsedAction(text, draft);
  const action = await finalizeAction(norm, ws);
  let previewHash: string | null = null;
  if (action.isMutating) {
    const prev = await buildPlanPreview(action, ws, outputRoot);
    if (!prev || !prev.ok) throw new Error(prev && !prev.ok ? prev.reason : "plan preview 없음");
    previewHash = prev.preview.previewHash;
  }
  return {
    category: action.category,
    intent: action.intent,
    mutationKind: action.mutationKind,
    previewHash,
  };
}

function assertSnapsEqual(a: Snap, b: Snap) {
  assert.equal(a.category, b.category);
  assert.equal(a.intent, b.intent);
  assert.equal(a.mutationKind, b.mutationKind);
  assert.equal(a.previewHash, b.previewHash);
}

async function section(name: string, fn: () => Promise<void>): Promise<void> {
  process.stdout.write(`\n── ${name} ──\n`);
  await fn();
  process.stdout.write(`OK: ${name}\n`);
}

async function main() {
  await smokeConstitutionStep0("runOperatorVerification");
  const ws = getDefaultWorkspaceRoot();
  await fs.mkdir(path.join(ws, "runs"), { recursive: true });
  await fs.mkdir(path.join(outputRoot, "screenshots"), { recursive: true });
  const smokeData = path.join(ws, ".smoke-operator");
  await fs.mkdir(smokeData, { recursive: true });

  const policy = await loadNeoPolicy(ws);

  await section("1) Deterministic parse — 반복 시 category/intent/mutationKind/canonical hash 동일", async () => {
    const phrases = [
      "마이폰첵을 에뮬레이터로 온보드 화면 및 모듈 앱 화면을 사진 찍어서 컨트롤플레인에게 전달할 파일로 만들어줘",
      "MyPhoneCheck 온보딩 첫 화면 캡처해줘",
      "MyPhoneCheck 앱 실행해줘",
      "MyPhoneCheck 에뮬레이터 돌려줘",
      "최근 로그 보여줘",
    ];
    const src = path.join(smokeData, "det_a.txt");
    const dst = path.join(smokeData, "det_b.txt");
    await fs.writeFile(src, "det", "utf8");
    try {
      await fs.unlink(dst);
    } catch {
      /* */
    }
    phrases.push(`"${src}" 를 "${dst}" 로 옮겨줘`);

    for (const text of phrases) {
      resetLlmInvocationCountForVerification();
      const s1 = await parseToSnap(ws, text, policy);
      const s2 = await parseToSnap(ws, text, policy);
      const s3 = await parseToSnap(ws, text, policy);
      assertSnapsEqual(s1, s2);
      assertSnapsEqual(s2, s3);
      assert.equal(
        getLlmInvocationCountForVerification(),
        0,
        `deterministic 구간에서 LLM classify 호출이 없어야 함: ${text.slice(0, 40)}`,
      );
    }
  });

  await section("2) Fallback policy — 단위 규칙", async () => {
    assert.equal(allowOllamaFallbackAfterGemini(429), true);
    assert.equal(allowOllamaFallbackAfterGemini(503), true);
    assert.equal(allowOllamaFallbackAfterGemini(400), false);
    assert.equal(allowOllamaFallbackAfterGemini(null), true);
    process.stdout.write(
      "  (라이브 Gemini 429/Ollama·forced 모드는 README «운영 검증» 수동 절 참고)\n",
    );
  });

  await section("3) Approval binding — PLAN 변경 후 stale hash 거부 + 감사 기록", async () => {
    const src = path.join(smokeData, "approval_src.txt");
    const dst = path.join(smokeData, "approval_dst.txt");
    await fs.writeFile(src, "body1", "utf8");
    try {
      await fs.unlink(dst);
    } catch {
      /* */
    }
    const text = `"${src}" 를 "${dst}" 로 옮겨줘`;
    resetLlmInvocationCountForVerification();
    const draft = await classifyWithAiOrFallback(text, policy);
    const norm = normalizeParsedAction(text, draft);
    const action = await finalizeAction(norm, ws);
    const prev = await buildPlanPreview(action, ws, outputRoot);
    assert(prev && prev.ok);
    const staleHash = prev.preview.previewHash;
    await fs.appendFile(src, "x", "utf8");

    const result = await executeAction(action, {
      workspaceRoot: ws,
      outputRoot,
      runsDir: path.join(ws, "runs"),
      approved: true,
      approvalPreviewHash: staleHash,
    });
    assert.equal(result.ok, false);
    assert.match(
      result.summary,
      /일치하지 않아|계획과 일치하지 않아/,
      `요약에 불일치 안내가 있어야 함: ${result.summary}`,
    );

    const audit = await verifyLatestAuditChain(ws);
    assert(audit.logFile, "감사 로그가 있어야 함");
    const tail = await fs.readFile(audit.logFile!, "utf8");
    assert.match(tail, /approval_hash_mismatch|일치하지 않아/);
  });

  await section("4) Circuit breaker — OPEN → HALF_OPEN(cooldown 0) → CLOSED / 수동 reset", async () => {
    resetToolBreakerBucketsForVerification();
    const p = {
      ...policy,
      breakers: {
        ...policy.breakers,
        gemini: { failureThreshold: 2, cooldownSeconds: 0 },
      },
    };
    recordToolFailure("gemini", p, "t1");
    recordToolFailure("gemini", p, "t2");
    let snap = getToolBreakerSnapshot("gemini", p);
    assert.equal(snap.state, "OPEN");
    let ev = evaluateToolBreaker("gemini", p);
    assert.equal(ev.allowed, true);
    assert.equal(ev.phase, "HALF_OPEN");
    recordToolSuccess("gemini");
    snap = getToolBreakerSnapshot("gemini", p);
    assert.equal(snap.state, "CLOSED");

    resetToolBreakerBucketsForVerification();
    recordToolFailure("gemini", p, "t1");
    recordToolFailure("gemini", p, "t2");
    evaluateToolBreaker("gemini", p);
    recordToolFailure("gemini", p, "probe fail");
    snap = getToolBreakerSnapshot("gemini", p);
    assert.equal(snap.state, "OPEN");

    manualResetToolBreaker("gemini");
    snap = getToolBreakerSnapshot("gemini", p);
    assert.equal(snap.state, "CLOSED");

    resetToolBreakerBucketsForVerification();
    const ratePolicy = { ...policy, maxMutatingCommandsPerMinute: 2 };
    recordMutatingPipelineAttempt(ratePolicy);
    recordMutatingPipelineAttempt(ratePolicy);
    recordMutatingPipelineAttempt(ratePolicy);
    const br = evaluateMutatingPipelineBreaker(ratePolicy);
    assert.equal(br.blocked, true);
    manualResetToolBreaker("mutating_pipeline");

    const snapGem = getToolBreakerSnapshot("gemini", p);
    assert.ok("state" in snapGem && "trippedAt" in snapGem && "reason" in snapGem);
    assert.ok(typeof snapGem.cooldownSeconds === "number");
    assert.ok(typeof snapGem.manualResetRequired === "boolean");
  });

  await section("5) Audit verify — latest 체인 + 변조본에서 brokenAtLine", async () => {
    const v = await verifyLatestAuditChain(ws);
    assert.ok(v.ok, v.detail ?? "audit verify");
    if (v.logFile) {
      const raw = await fs.readFile(v.logFile, "utf8");
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]!) as { entryHash?: string };
        last.entryHash = "deadbeef";
        lines[lines.length - 1] = JSON.stringify(last);
        const corruptPath = path.join(smokeData, "_corrupt_audit.log");
        await fs.writeFile(corruptPath, lines.join("\n"), "utf8");
        const bad = await verifyAuditLogFile(corruptPath);
        assert.equal(bad.ok, false);
        assert.ok(bad.brokenAtLine && bad.brokenAtLine > 0);
      }
    }
  });

  if (process.env.SMOKE_SKIP_RESTORE === "1") {
    process.stdout.write("\n── 6) Restore (SKIP: SMOKE_SKIP_RESTORE=1) ──\n");
  } else {
    await section("6) Restore — file move 후 restorePointId 복구", async () => {
      const src = path.join(smokeData, "restore_src.txt");
      const dst = path.join(smokeData, "restore_dst.txt");
      const content = `restore-${Date.now()}`;
      await fs.writeFile(src, content, "utf8");
      try {
        await fs.unlink(dst);
      } catch {
        /* */
      }
      const text = `"${src}" 를 "${dst}" 로 옮겨줘`;
      const draft = await classifyWithAiOrFallback(text, policy);
      const norm = normalizeParsedAction(text, draft);
      const action = await finalizeAction(norm, ws);
      const prev = await buildPlanPreview(action, ws, outputRoot);
      assert(prev && prev.ok);
      const hash = prev.preview.previewHash;

      const result = await executeAction(action, {
        workspaceRoot: ws,
        outputRoot,
        runsDir: path.join(ws, "runs"),
        approved: true,
        approvalPreviewHash: hash,
      });
      assert.equal(result.ok, true, result.summary);
      const rid = result.restorePointId;
      assert.ok(rid, "restorePointId 필요");
      try {
        await fs.access(dst);
      } catch {
        assert.fail("이동 후 대상 파일이 있어야 함");
      }

      const rest = await restoreByRestorePointId(ws, rid!);
      assert.equal(rest.ok, true, rest.summary);
      assert.ok(rest.verificationStatus === "passed" || rest.verificationStatus === "skipped");
      const back = await fs.readFile(src, "utf8");
      assert.equal(back, content);
    });
  }

  const base = process.env.SMOKE_HTTP_BASE?.replace(/\/$/, "");
  if (base) {
    await section(`7) HTTP smoke — ${base}`, async () => {
      const stRes = await fetch(`${base}/api/system/status`);
      assert.equal(stRes.ok, true);
      const st = (await stRes.json()) as {
        toolBreakers?: { key: string; state: string; trippedAt: string | null; reason: string | null }[];
        ai?: { message?: string; providerDetail?: string };
      };
      assert.ok(Array.isArray(st.toolBreakers));
      for (const b of st.toolBreakers ?? []) {
        assert.ok(["CLOSED", "OPEN", "HALF_OPEN"].includes(b.state));
      }
      const resetRes = await fetch(`${base}/api/system/breaker/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "gemini" }),
      });
      assert.equal(resetRes.ok, true);

      if (process.env.NEO_PARSE_DEBUG === "1") {
        const dbg = await fetch(`${base}/api/command/parse-debug`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "최근 로그 보여줘" }),
        });
        assert.equal(dbg.ok, true);
        const j = (await dbg.json()) as { finalized?: { intent?: string }; gemini?: unknown; ollama?: unknown };
        assert.equal(j.finalized?.intent, "recent_logs");
      } else {
        process.stdout.write("  (parse-debug 생략: 서버에 NEO_PARSE_DEBUG=1 필요)\n");
      }
    });
  } else {
    process.stdout.write("\n── 7) HTTP smoke (SKIP: SMOKE_HTTP_BASE 미설정) ──\n");
  }

  process.stdout.write("\n모든 스모크 섹션 통과.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
