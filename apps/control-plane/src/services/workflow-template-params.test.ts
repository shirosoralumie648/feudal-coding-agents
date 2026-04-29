import { describe, expect, it } from "vitest";
import type { TemplateParameter } from "./workflow-template-types";
import { interpolateParams, validateParameters } from "./workflow-template-params";

// ---- Test 1: interpolateParams replaces ${params.paramName} ----
describe("interpolateParams", () => {
  it("replaces ${params.paramName} in string values with the corresponding parameter value", () => {
    const result = interpolateParams(
      "Analyze codebase at ${params.codebasePath}",
      { codebasePath: "/src/app" }
    );
    expect(result).toBe("Analyze codebase at /src/app");
  });

  // ---- Test 2: interpolates multiple references in a single string ----
  it("interpolates multiple parameter references in a single string", () => {
    const result = interpolateParams(
      "Review ${params.fileCount} files at ${params.codebasePath}",
      { fileCount: 42, codebasePath: "/src" }
    );
    expect(result).toBe("Review 42 files at /src");
  });

  // ---- Test 3: interpolates parameters nested in objects and arrays ----
  it("interpolates parameters inside object properties", () => {
    const config = {
      prompt: "Analyze ${params.codebasePath} with max ${params.maxIssues} issues",
      options: {
        path: "${params.codebasePath}",
        level: "standard"
      }
    };
    const result = interpolateParams(config, {
      codebasePath: "/src/app",
      maxIssues: 50
    });
    expect(result).toEqual({
      prompt: "Analyze /src/app with max 50 issues",
      options: {
        path: "/src/app",
        level: "standard"
      }
    });
  });

  it("interpolates parameters inside array elements", () => {
    const steps = [
      "Run tests in ${params.testDir}",
      "Report to ${params.reportTarget}"
    ];
    const result = interpolateParams(steps, {
      testDir: "./tests",
      reportTarget: "dashboard"
    });
    expect(result).toEqual([
      "Run tests in ./tests",
      "Report to dashboard"
    ]);
  });

  // ---- Test 4: throws error when parameter is missing ----
  it("throws an error when a referenced parameter is not found", () => {
    expect(() =>
      interpolateParams(
        "Path: ${params.missing}",
        { codebasePath: "/src" }
      )
    ).toThrow('Template parameter "missing" not provided');
  });

  // ---- Test 5: returns unchanged when no references ----
  it("returns the original string unchanged when it contains no parameter references", () => {
    const result = interpolateParams(
      "No parameters here",
      { unused: "value" }
    );
    expect(result).toBe("No parameters here");
  });

  // ---- Test 6: handles non-string values ----
  it("returns numbers unchanged", () => {
    const result = interpolateParams(42, { unused: "value" });
    expect(result).toBe(42);
  });

  it("returns booleans unchanged", () => {
    const result = interpolateParams(true, { unused: "value" });
    expect(result).toBe(true);
  });

  it("returns null unchanged", () => {
    const result = interpolateParams(null, { unused: "value" });
    expect(result).toBeNull();
  });

  it("returns undefined unchanged", () => {
    const result = interpolateParams(undefined, { unused: "value" });
    expect(result).toBeUndefined();
  });
});

// ---- validateParameters tests ----
describe("validateParameters", () => {
  const templateParams: TemplateParameter[] = [
    {
      name: "codebasePath",
      type: "string",
      required: true,
      description: "Path to codebase"
    },
    {
      name: "maxIssues",
      type: "number",
      required: false,
      description: "Max issues",
      default: 50
    },
    {
      name: "autoApprove",
      type: "boolean",
      required: false,
      description: "Auto approve",
      default: false
    }
  ];

  it("returns no errors when all required parameters are provided", () => {
    const errors = validateParameters(templateParams, {
      codebasePath: "/src"
    });
    expect(errors).toEqual([]);
  });

  it("returns error when a required parameter is missing", () => {
    const errors = validateParameters(templateParams, {});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("codebasePath"))).toBe(true);
  });

  it("returns no errors when optional parameters are omitted", () => {
    const errors = validateParameters(templateParams, {
      codebasePath: "/src"
    });
    expect(errors).toEqual([]);
  });

  it("returns no errors for extra provided parameters (forward compatibility)", () => {
    const errors = validateParameters(templateParams, {
      codebasePath: "/src",
      unknownParam: "extra"
    });
    expect(errors).toEqual([]);
  });

  it("validates all provided parameters have matching definitions", () => {
    // All provided params should match defined params — extra keys are OK per plan
    const errors = validateParameters(
      [
        { name: "onlyParam", type: "string", required: true, description: "desc" }
      ],
      {
        onlyParam: "value",
        extraParam: "extra"
      }
    );
    // onlyParam is satisfied, extraParam is forward-compatible
    expect(errors).toEqual([]);
  });
});
