/**
 * inbox/outbox JSON 프로토콜 — 호스트는 request 작성, 에이전트는 result 작성.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NeoPolicy } from "../policy.js";
import { validateArtifactPath } from "../policy.js";
import type { SandboxJobRequest, SandboxJobResult } from "../ollama/sandboxJobTypes.js";
import {
  jobRequestFileName,
  jobResultFileName,
  resolveSandboxArtifactsDir,
  resolveSandboxDeadLetterDir,
  resolveSandboxInboxDir,
  resolveSandboxLocksDir,
  resolveSandboxOutboxDir,
} from "./sandboxPaths.js";

export async function ensureSandboxBridgeDirs(sharedRoot: string): Promise<void> {
  await fs.mkdir(resolveSandboxInboxDir(sharedRoot), { recursive: true });
  await fs.mkdir(resolveSandboxOutboxDir(sharedRoot), { recursive: true });
  await fs.mkdir(resolveSandboxArtifactsDir(sharedRoot), { recursive: true });
  await fs.mkdir(resolveSandboxLocksDir(sharedRoot), { recursive: true });
  await fs.mkdir(resolveSandboxDeadLetterDir(sharedRoot), { recursive: true });
}

export async function writeSandboxJobRequest(
  sharedRoot: string,
  req: SandboxJobRequest,
  policy: NeoPolicy,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const inbox = resolveSandboxInboxDir(sharedRoot);
  const p = path.join(inbox, jobRequestFileName(req.jobId));
  const va = validateArtifactPath(p, policy);
  if (!va.ok) return { ok: false, reason: va.reason };
  await fs.mkdir(inbox, { recursive: true });
  await fs.writeFile(p, JSON.stringify(req, null, 2), "utf8");
  return { ok: true };
}

export async function writeSandboxJobResult(
  sharedRoot: string,
  res: SandboxJobResult,
  policy: NeoPolicy,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const out = resolveSandboxOutboxDir(sharedRoot);
  const p = path.join(out, jobResultFileName(res.jobId));
  const va = validateArtifactPath(p, policy);
  if (!va.ok) return { ok: false, reason: va.reason };
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(p, JSON.stringify(res, null, 2), "utf8");
  return { ok: true };
}

export async function readSandboxJobResultIfPresent(
  sharedRoot: string,
  jobId: string,
): Promise<SandboxJobResult | null> {
  const p = path.join(resolveSandboxOutboxDir(sharedRoot), jobResultFileName(jobId));
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as SandboxJobResult;
  } catch {
    return null;
  }
}

/** outbox 에 result 가 있으면 파싱, 없으면 null (폴링 루프에서 사용). */
export async function readSandboxJobResult(
  sharedRoot: string,
  jobId: string,
): Promise<SandboxJobResult | null> {
  return readSandboxJobResultIfPresent(sharedRoot, jobId);
}

export async function moveRequestToDeadLetter(
  sharedRoot: string,
  jobId: string,
  policy: NeoPolicy,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const src = path.join(resolveSandboxInboxDir(sharedRoot), jobRequestFileName(jobId));
  const deadDir = resolveSandboxDeadLetterDir(sharedRoot);
  const dest = path.join(deadDir, jobRequestFileName(jobId));
  const va = validateArtifactPath(dest, policy);
  if (!va.ok) return { ok: false, reason: va.reason };
  const reasonPath = path.join(deadDir, `job-${jobId}.reason.txt`);
  const vr = validateArtifactPath(reasonPath, policy);
  if (!vr.ok) return { ok: false, reason: vr.reason };
  try {
    await fs.mkdir(deadDir, { recursive: true });
    await fs.rename(src, dest);
    await fs.writeFile(reasonPath, reason, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** 스모크·로컬 테스트: 에이전트 없이 inbox 요청을 읽고 stub result를 outbox에 씀. */
export async function runStubSandboxAgentOnce(
  sharedRoot: string,
  jobId: string,
  policy: NeoPolicy,
): Promise<{ ok: true; result: SandboxJobResult } | { ok: false; reason: string }> {
  const reqPath = path.join(resolveSandboxInboxDir(sharedRoot), jobRequestFileName(jobId));
  let raw: string;
  try {
    raw = await fs.readFile(reqPath, "utf8");
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  let req: SandboxJobRequest;
  try {
    req = JSON.parse(raw) as SandboxJobRequest;
  } catch {
    await moveRequestToDeadLetter(sharedRoot, jobId, policy, "invalid_json");
    return { ok: false, reason: "invalid request JSON" };
  }
  if (req.jobId !== jobId) {
    await moveRequestToDeadLetter(sharedRoot, jobId, policy, "jobId mismatch");
    return { ok: false, reason: "jobId mismatch" };
  }
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const result: SandboxJobResult = {
    jobId,
    status: "ok",
    startedAt,
    finishedAt,
    summary: `stub sandbox agent processed task=${req.task}`,
    logs: ["[stub] no real VM; protocol round-trip only"],
    data: { task: req.task, params: req.params },
  };
  const wr = await writeSandboxJobResult(sharedRoot, result, policy);
  if (!wr.ok) return { ok: false, reason: wr.reason };
  try {
    await fs.unlink(reqPath);
  } catch {
    /* inbox 정리 실패는 무시 */
  }
  return { ok: true, result };
}

/**
 * 별도 프로세스·in-process 공통: inbox job 1건 처리 → artifacts + outbox.
 */
export async function executeSandboxAgentJob(
  sharedRoot: string,
  jobId: string,
  policy: NeoPolicy,
): Promise<{ ok: true; result: SandboxJobResult } | { ok: false; reason: string }> {
  const reqPath = path.join(resolveSandboxInboxDir(sharedRoot), jobRequestFileName(jobId));
  let raw: string;
  try {
    raw = await fs.readFile(reqPath, "utf8");
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  let req: SandboxJobRequest;
  try {
    req = JSON.parse(raw) as SandboxJobRequest;
  } catch {
    await moveRequestToDeadLetter(sharedRoot, jobId, policy, "invalid_json");
    return { ok: false, reason: "invalid request JSON" };
  }
  if (req.jobId !== jobId) {
    await moveRequestToDeadLetter(sharedRoot, jobId, policy, "jobId mismatch");
    return { ok: false, reason: "jobId mismatch" };
  }
  const startedAt = new Date().toISOString();
  const artDir = resolveSandboxArtifactsDir(sharedRoot);
  const artPath = path.join(artDir, `job-${jobId}-out.txt`);
  const va = validateArtifactPath(artPath, policy);
  if (!va.ok) return { ok: false, reason: va.reason };
  await fs.mkdir(artDir, { recursive: true });

  let body: string;
  let summary: string;
  let logs: string[];

  switch (req.task) {
    case "generic_script": {
      const safeEcho =
        typeof req.params?.echo === "string" ? String(req.params.echo).slice(0, 200) : "hello-from-generic_script";
      body = `sandbox-bridge-agent\n${safeEcho}\njob=${jobId}\ntask=${req.task}\n`;
      summary = `sandbox smoke: executed generic_script; artifact written (${path.relative(sharedRoot, artPath).split(path.sep).join("/")})`;
      logs = [`[agent] generic_script artifact`];
      break;
    }
    case "browser_open": {
      body = `placeholder browser_open\njob=${jobId}\n(no browser automation in Iteration 3)\n`;
      summary =
        "sandbox: browser_open placeholder — no automated browser in Iteration 3; inbox/outbox protocol only";
      logs = ["[agent] browser_open placeholder"];
      break;
    }
    case "gmail_check": {
      body = `placeholder gmail_check\njob=${jobId}\n(no Gmail automation in Iteration 3)\n`;
      summary =
        "sandbox: gmail_check placeholder — no Gmail automation in Iteration 3; inbox/outbox protocol only";
      logs = ["[agent] gmail_check placeholder"];
      break;
    }
  }

  await fs.writeFile(artPath, body, "utf8");
  const relArt = path.relative(sharedRoot, artPath).split(path.sep).join("/");
  const finishedAt = new Date().toISOString();
  const result: SandboxJobResult = {
    jobId,
    status: "ok",
    startedAt,
    finishedAt,
    summary,
    logs,
    artifacts: [relArt],
    data: { task: req.task, params: req.params },
  };
  const wr = await writeSandboxJobResult(sharedRoot, result, policy);
  if (!wr.ok) return { ok: false, reason: wr.reason };
  try {
    await fs.unlink(reqPath);
  } catch {
    /* ignore */
  }
  return { ok: true, result };
}

/**
 * 동일 프로세스 내 "실제" 샌드박스 에이전트 (executeSandboxAgentJob 위임).
 */
export async function runRealSandboxAgentOnce(
  sharedRoot: string,
  jobId: string,
  policy: NeoPolicy,
): Promise<{ ok: true; result: SandboxJobResult } | { ok: false; reason: string }> {
  return executeSandboxAgentJob(sharedRoot, jobId, policy);
}

export function newSandboxJobId(): string {
  return randomUUID();
}
