/**
 * uiautomator dump + resumed activity — explore / scenario / ScreenId 공용.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REMOTE_DUMP = "/sdcard/neo_ui_hierarchy.xml";

export async function dumpUiHierarchy(adb: string, logs: string[]): Promise<string> {
  try {
    await execFileAsync(adb, ["shell", "uiautomator", "dump", REMOTE_DUMP], { timeout: 60_000 });
  } catch (e) {
    logs.push(`[ui-dump] uiautomator dump failed: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
  try {
    const { stdout } = await execFileAsync(adb, ["shell", "cat", REMOTE_DUMP], {
      encoding: "utf8",
      timeout: 30_000,
    });
    return stdout.trim();
  } catch (e) {
    logs.push(`[ui-dump] cat ${REMOTE_DUMP}: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}

export async function getResumedActivity(adb: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(adb, ["shell", "dumpsys", "activity", "activities"], {
      encoding: "utf8",
      timeout: 45_000,
    });
    const m =
      stdout.match(/mResumedActivity[^:]*:\s*([^\s(]+)/) ??
      stdout.match(/Resumed:\s*[^\s]+\s+([^\s/]+)\//);
    return m?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}
