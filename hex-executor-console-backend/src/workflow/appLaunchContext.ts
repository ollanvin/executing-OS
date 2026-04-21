import type { InternalCellBaseCtx } from "./internalCellContext.js";

export type AppLaunchWorkflowCtx = InternalCellBaseCtx & {
  packageName: string;
  scenarioId?: string | null;
};
