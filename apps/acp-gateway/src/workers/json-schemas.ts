import { z } from "zod";

export const taskSpecSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    prompt: { type: "string" }
  },
  required: ["title", "prompt"],
  additionalProperties: false
} as const;

export const taskSpecResultSchema = z
  .object({
    title: z.string(),
    prompt: z.string()
  })
  .strict();

export const decisionBriefSchema = {
  type: "object",
  properties: {
    summary: { type: "string" }
  },
  required: ["summary"],
  additionalProperties: false
} as const;

export const decisionBriefResultSchema = z
  .object({
    summary: z.string()
  })
  .strict();

export const reviewSchema = {
  type: "object",
  properties: {
    verdict: { type: "string" },
    note: { type: "string" }
  },
  required: ["verdict", "note"],
  additionalProperties: false
} as const;

export const reviewResultSchema = z
  .object({
    verdict: z.string(),
    note: z.string()
  })
  .strict();

export const factCheckSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: { type: "string" }
    },
    policyReasons: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["summary", "findings", "policyReasons"],
  additionalProperties: false
} as const;

export const factCheckResultSchema = z
  .object({
    summary: z.string(),
    findings: z.array(z.string()),
    policyReasons: z.array(z.string())
  })
  .strict();

export const executionReportSchema = {
  type: "object",
  properties: {
    result: { type: "string" },
    output: { type: "string" },
    blockingIssues: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["result", "output"],
  additionalProperties: false
} as const;

export const executionReportResultSchema = z
  .object({
    result: z.string(),
    output: z.string(),
    blockingIssues: z.array(z.string()).optional()
  })
  .strict();
