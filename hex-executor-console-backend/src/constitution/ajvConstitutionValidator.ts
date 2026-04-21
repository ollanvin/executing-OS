import fs from "node:fs/promises";
import path from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export type ConstitutionValidators = {
  validateConstitution: ValidateFunction;
  validateRule: ValidateFunction;
  validateExceptionBundle: ValidateFunction;
  validateRealrunReport: ValidateFunction;
};

let validatorsCache: { schemaDir: string; validators: ConstitutionValidators } | null = null;

export function formatAjvErrors(errors: ErrorObject[] | null | undefined, filePath: string): string {
  if (!errors?.length) return `${filePath}: validation failed (no details)`;
  return errors.map((e) => `${filePath}${e.instancePath || ""}: ${e.message} (${e.keyword})`).join("\n");
}

/** schema 디렉터리에서 AJV 컴파일 (경로별 캐시) */
export async function getConstitutionValidators(schemaDir: string): Promise<ConstitutionValidators> {
  if (validatorsCache?.schemaDir === schemaDir) return validatorsCache.validators;
  const build = (async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
    (addFormats as unknown as (a: InstanceType<typeof Ajv2020>) => void)(ajv);

    const readSchema = async (name: string) =>
      JSON.parse(await fs.readFile(path.join(schemaDir, name), "utf8")) as object;

    const constitutionSchema = await readSchema("constitution.schema.json");
    const ruleSchema = await readSchema("rule.schema.json");
    const exceptionBundleSchema = await readSchema("exception-bundle.schema.json");
    const realrunReportSchema = await readSchema("realrun-report.schema.json");

    const validateConstitution = ajv.compile(constitutionSchema);
    const validateRule = ajv.compile(ruleSchema);
    const validateExceptionBundle = ajv.compile(exceptionBundleSchema);
    const validateRealrunReport = ajv.compile(realrunReportSchema);

    return { validateConstitution, validateRule, validateExceptionBundle, validateRealrunReport };
  })();
  const validators = await build;
  validatorsCache = { schemaDir, validators };
  return validators;
}

export async function assertValid(
  validate: ValidateFunction,
  data: unknown,
  filePath: string,
): Promise<void> {
  const ok = validate(data);
  if (!ok) {
    throw new Error(`헌법 Schema 검증 실패:\n${formatAjvErrors(validate.errors ?? null, filePath)}`);
  }
}
