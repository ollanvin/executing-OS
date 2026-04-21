/**
 * Ollama Host Executor — 호스트 OS에서의 폐쇄형 로컬 작업 (Gemini 플랜의 "손발").
 * LLM 호출 책임과 분리: {@link ../ai/ollamaProvider.js}
 */

export type HostExecutionTask =
  | {
      kind: "powershell";
      command: string;
      cwd?: string;
      timeoutMs?: number;
    }
  | {
      kind: "bash";
      command: string;
      cwd?: string;
      timeoutMs?: number;
    }
  | {
      kind: "fs_prepare";
      createDirs?: string[];
      deletePaths?: string[];
      ensureFiles?: { path: string; content: string }[];
    }
  | {
      kind: "program_install";
      installerHint: string;
      packageName?: string;
      args?: string[];
    }
  | {
      kind: "adb";
      args: string[];
      timeoutMs?: number;
    }
  /** 에뮬레이터/시뮬레이터 등 호스트 OS에 표시된 창을 OS 레벨 도구로 PNG 저장 (주로 Windows 전체 화면 1차). */
  | {
      kind: "screen_capture";
      /** 예: "Android Emulator", "iOS Simulator" — 구현체가 창 매칭에 사용(미구현 시 로그/요약만). */
      targetWindowHint?: string;
      /** PNG 절대 경로 (workspaceRoot 또는 outputRoot 하위만 허용). */
      outputPath: string;
      /** 후속: 특정 영역만 캡처 (현재 Windows 1차에서는 무시 가능). */
      regionHint?: { x: number; y: number; width: number; height: number };
    };

export type HostExecutionContext = {
  workspaceRoot: string;
  backendRoot: string;
  /** 백엔드 패키지 `output` (예: …/hex-executor-console-backend/output) */
  outputRoot: string;
};

/** screen_capture 성공 시 창 좌표·백엔드 (컨트롤플레인 diff·리포트용). */
export type ScreenCaptureDetails = {
  rect: { x: number; y: number; width: number; height: number };
  captureBackend: "host_window" | "adb_screencap" | "emulator_builtin";
  emulatorWindowFound: boolean;
};

export type HostExecutionResult = {
  ok: boolean;
  taskKind: HostExecutionTask["kind"];
  startedAt: string;
  finishedAt: string;
  stdoutTail?: string[];
  stderrTail?: string[];
  changedPaths?: string[];
  summary: string;
  error?: string;
  /** kind === screen_capture 일 때 채움 */
  screenCaptureDetails?: ScreenCaptureDetails;
};
