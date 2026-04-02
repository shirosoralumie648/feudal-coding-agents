export const taskSpecSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    prompt: { type: "string" }
  },
  required: ["title", "prompt"],
  additionalProperties: false
} as const;

export const decisionBriefSchema = {
  type: "object",
  properties: {
    summary: { type: "string" }
  },
  required: ["summary"],
  additionalProperties: false
} as const;

export const reviewSchema = {
  type: "object",
  properties: {
    verdict: { type: "string" },
    note: { type: "string" }
  },
  required: ["verdict", "note"],
  additionalProperties: false
} as const;

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
