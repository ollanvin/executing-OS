/**
 * Gemini(원격 추론) vs Ollama Host Executor vs Ollama Sandbox Operator 라우팅 모델.
 * 전 워크플로 강제 적용 전 단계 — 플래너/실행기가 단계별로 target을 붙일 때 사용.
 */

import type { HostExecutionTask } from "../ollama/hostExecutionTypes.js";
import type { SandboxJobTask } from "../ollama/sandboxJobTypes.js";

export type ExecutionTarget = "gemini_remote" | "ollama_host" | "ollama_sandbox";

export type RoutedExecutionStep = {
  id: string;
  title: string;
  target: ExecutionTarget;
  payload: unknown;
};

/** 호스트 로컬 실행 단계(ADB·쉘·fs)는 ollama_host 로 라우팅하는 것이 기본 규약. */
export function routeHostTaskToTarget(_task: HostExecutionTask): "ollama_host" {
  return "ollama_host";
}

/** 격리가 필요한 샌드박스 job은 ollama_sandbox. */
export function routeSandboxTaskToTarget(_task: SandboxJobTask): "ollama_sandbox" {
  return "ollama_sandbox";
}

/** 휴리스틱: payload에 host 작업 형태가 있으면 ollama_host, 샌드박스 task 이름이면 ollama_sandbox. */
export function inferExecutionTargetFromPayload(payload: unknown): ExecutionTarget {
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (typeof o.kind === "string") {
      const k = o.kind as string;
      if (["powershell", "bash", "fs_prepare", "program_install", "adb", "screen_capture"].includes(k)) {
        return "ollama_host";
      }
    }
    if (typeof o.task === "string") {
      const t = o.task as string;
      if (["gmail_check", "browser_open", "generic_script"].includes(t)) {
        return "ollama_sandbox";
      }
    }
    if (o.planner === "gemini" || o.remoteReasoning === true) {
      return "gemini_remote";
    }
  }
  return "gemini_remote";
}
