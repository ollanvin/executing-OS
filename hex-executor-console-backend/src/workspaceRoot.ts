import path from "node:path";
import { fileURLToPath } from "node:url";

/** executing-OS 루트 (NEO_WORKSPACE_ROOT 또는 백엔드 패키지 기준 상위). */
export function getDefaultWorkspaceRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(process.env.NEO_WORKSPACE_ROOT || path.join(here, "..", ".."));
}
