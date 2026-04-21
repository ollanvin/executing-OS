import type {
  OperatorAction,
  OperatorExecuteResult,
  PlanPreviewPayload,
} from "./neoOperatorTypes";

async function readError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { error?: string };
    return j.error ?? (t || res.statusText);
  } catch {
    return t || res.statusText;
  }
}

export async function neoParse(text: string): Promise<{
  action: OperatorAction;
  planPreview: PlanPreviewPayload | null;
}> {
  const res = await fetch("/api/command/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<{
    action: OperatorAction;
    planPreview: PlanPreviewPayload | null;
  }>;
}

export async function neoExecute(
  action: OperatorAction,
  approved: boolean,
  approvalPreviewHash?: string | null,
): Promise<{ result: OperatorExecuteResult }> {
  const res = await fetch("/api/command/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, approved, approvalPreviewHash: approvalPreviewHash ?? null }),
  });
  if (res.status === 403) throw new Error(await readError(res));
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<{ result: OperatorExecuteResult }>;
}

export async function neoHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health");
    return res.ok;
  } catch {
    return false;
  }
}
