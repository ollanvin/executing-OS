/** 예외 scope · 실행 컨텍스트 매칭 */

export type ExceptionScope = {
  environments: string[];
  taskKinds: string[];
  workerKinds: string[];
  appIds: string[];
};

export type ConstitutionExecutionContext = {
  environment: string;
  taskKind: string;
  workerKind: string;
  appId?: string;
};

export function scopeMatches(scope: ExceptionScope, ctx: ConstitutionExecutionContext): boolean {
  if (scope.environments.length && !scope.environments.includes(ctx.environment)) return false;
  if (scope.taskKinds.length && !scope.taskKinds.includes(ctx.taskKind)) return false;
  if (scope.workerKinds.length && !scope.workerKinds.includes(ctx.workerKind)) return false;
  if (scope.appIds.length && ctx.appId && !scope.appIds.includes(ctx.appId)) return false;
  return true;
}
