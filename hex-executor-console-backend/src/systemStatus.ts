import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { getAiRouterStatus } from "./ai/router.js";
import { loadNeoPolicy } from "./policy.js";
import {
  buildBreakerBannerMessages,
  getAllToolBreakerSnapshots,
  getToolBreakerSnapshot,
} from "./toolCircuitBreaker.js";

const execFileAsync = promisify(execFile);

export type SystemStatusPayload = {
  androidHome: string | null;
  adbPath: string | null;
  adbDevices: string[];
  emulatorHint: string;
  timestamp: string;
  /** @deprecated mutating_pipeline 요약 — toolBreakers 사용 권장 */
  circuitBreaker: {
    open: boolean;
    state: string;
    openedAt: string | null;
    consecutiveFailures: number;
    mutatingLastMinute: number;
  };
  toolBreakers: ReturnType<typeof getAllToolBreakerSnapshots>;
  breakerBanners: string[];
  ai: Awaited<ReturnType<typeof getAiRouterStatus>>;
};

function adbPathFromHome(home: string | undefined): string | null {
  if (!home) return null;
  const win = path.join(home, "platform-tools", "adb.exe");
  return win;
}

export async function getSystemStatus(workspaceRoot: string): Promise<SystemStatusPayload> {
  const androidHome = process.env.ANDROID_HOME?.trim() || null;
  const adb = adbPathFromHome(androidHome ?? undefined);
  const adbDevices: string[] = [];
  let emulatorHint = "ANDROID_HOME 미설정 시 에뮬레이터/adb 경로를 확인할 수 없습니다.";

  if (adb) {
    try {
      const { stdout } = await execFileAsync(adb, ["devices", "-l"], {
        encoding: "utf8",
        timeout: 15_000,
      });
      emulatorHint = stdout.trim() || "(adb devices 출력 없음)";
      adbDevices.push(
        ...stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      );
    } catch (e) {
      emulatorHint = `adb 실행 실패: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const policy = await loadNeoPolicy(workspaceRoot);
  const ai = await getAiRouterStatus(policy);
  const toolBreakers = getAllToolBreakerSnapshots(policy);
  const mut = getToolBreakerSnapshot("mutating_pipeline", policy);

  return {
    androidHome,
    adbPath: adb,
    adbDevices,
    emulatorHint,
    timestamp: new Date().toISOString(),
    circuitBreaker: {
      open: mut.state !== "CLOSED",
      state: mut.state,
      openedAt: mut.trippedAt,
      consecutiveFailures: mut.consecutiveFailures,
      mutatingLastMinute: mut.mutatingLastMinute ?? 0,
    },
    toolBreakers,
    breakerBanners: buildBreakerBannerMessages(policy),
    ai,
  };
}
