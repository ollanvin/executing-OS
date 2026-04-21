import type { NeoPolicy } from "../policy.js";
import type { ExecuteContext } from "../types.js";

/** Stage 1 internal workflow 공통 컨텍스트 (executor 핸들러에서 공유). */
export type InternalCellBaseCtx = {
  executeCtx: ExecuteContext;
  logs: string[];
  policy: NeoPolicy;
};
