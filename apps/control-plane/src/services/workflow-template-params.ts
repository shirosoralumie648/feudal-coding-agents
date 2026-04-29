import type { TemplateParameter } from "./workflow-template-types";

/** Per D-08: Parameter interpolation regex — matches ${params.paramName} */
export const PARAM_REF_REGEX = /\$\{params\.(\w+)\}/g;

/**
 * Recursively interpolates ${params.paramName} references in a value.
 * Per D-08: parameter interpolation using ${params.paramName} syntax.
 *
 * - Strings: replaces all ${params.paramName} with string representation of param value
 * - Arrays: recursively interpolates each element
 * - Plain objects: recursively interpolates each property value
 * - Primitives (number, boolean, null, undefined): returned unchanged
 *
 * @throws Error if a referenced parameter is not found in the parameters record
 */
export function interpolateParams(
  value: unknown,
  parameters: Record<string, string | number | boolean>
): unknown {
  if (typeof value === "string") {
    return value.replace(PARAM_REF_REGEX, (_match, paramName: string) => {
      if (!(paramName in parameters)) {
        throw new Error(`Template parameter "${paramName}" not provided`);
      }
      return String(parameters[paramName]);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateParams(item, parameters));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = interpolateParams(val, parameters);
    }
    return result;
  }

  return value;
}

/**
 * Validates that all required parameters defined in a template are present
 * in the provided parameters object.
 *
 * Returns an array of error messages (empty = valid). Validation rules:
 * - For each TemplateParameter with required: true, the key must exist
 * - Extra keys in providedParameters are allowed (forward compatibility)
 */
export function validateParameters(
  templateParameters: TemplateParameter[],
  providedParameters: Record<string, string | number | boolean>
): string[] {
  const errors: string[] = [];

  for (const param of templateParameters) {
    if (param.required && !(param.name in providedParameters)) {
      errors.push(
        `Required parameter "${param.name}" (${param.type}) not provided`
      );
    }
  }

  return errors;
}
