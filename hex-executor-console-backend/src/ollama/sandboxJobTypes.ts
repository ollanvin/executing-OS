/**
 * Sandbox Operator — 격리 환경(Windows Sandbox 등) 쪽에서 수행할 job 스키마.
 * 실제 에이전트 프로세스는 별도; 호스트는 inbox/outbox로만 소통.
 */

/** 초도작업 범위 task 이름 (확장 시 union 만 추가). */
export type SandboxJobTask = "gmail_check" | "browser_open" | "generic_script";

export type SandboxJobRequest = {
  jobId: string;
  task: SandboxJobTask;
  createdAt: string;
  params: Record<string, unknown>;
};

export type SandboxJobResult = {
  jobId: string;
  status: "ok" | "failed" | "timeout";
  startedAt: string;
  finishedAt: string;
  summary: string;
  logs?: string[];
  artifacts?: string[];
  data?: Record<string, unknown>;
  error?: string;
};
