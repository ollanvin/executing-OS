import path from "node:path";

export function isExcludedTestOrFixturePath(filePath: string): boolean {
  const n = filePath.replace(/\\/g, "/").toLowerCase();
  return (
    /\/fixtures\//i.test(n) ||
    /\/__tests__\//i.test(n) ||
    /\.(test|spec)\.(tsx?|jsx?)$/i.test(n) ||
    /\/node_modules\//i.test(n) ||
    /\/shared\/constitution\/schema\//i.test(n) ||
    /\/smoke\/fixtures\//i.test(n)
  );
}

export function relativeWorkspace(filePath: string, workspaceRoot: string): string {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}
