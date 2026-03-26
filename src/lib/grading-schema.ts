export const gradingResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: {
      type: "number",
    },
    gradingSummary: { type: "string" },
    strengths: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5,
    },
    improvements: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5,
    },
    rubricBreakdown: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          criterion: { type: "string" },
          score: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["criterion", "score", "feedback"],
      },
    },
    professorFeedback: { type: "string" },
  },
  required: [
    "score",
    "gradingSummary",
    "strengths",
    "improvements",
    "rubricBreakdown",
    "professorFeedback",
  ],
} as const;
