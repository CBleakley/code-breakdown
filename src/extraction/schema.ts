import { z } from "zod";

export const CATEGORIES = [
  "language-feature",
  "idiom",
  "design-pattern",
  "library-api",
  "cs-fundamental",
] as const;

export type ConceptCategory = (typeof CATEGORIES)[number];

// File line numbers, 1-based; columns 1-based
export interface Span {
  start: [number, number];
  end: [number, number];
}

export interface Concept {
  id: string;
  name: string;
  category: ConceptCategory;
  definition: string;
  spans: Span[];
}

export interface ExtractionResult {
  concepts: Concept[];
  dropped: number;
  usage: { inputTokens: number; outputTokens: number };
}

const positionJsonSchema = {
  type: "object",
  properties: {
    line: { type: "integer" },
    column: { type: "integer" },
  },
  required: ["line", "column"],
  additionalProperties: false,
} as const;

// Structured outputs can't express string, number or tuple constraints, so
// this describes shape only; wireConceptSchema enforces the rest.
export const CONCEPTS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
          definition: { type: "string" },
          spans: {
            type: "array",
            items: {
              type: "object",
              properties: {
                start: positionJsonSchema,
                end: positionJsonSchema,
              },
              required: ["start", "end"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "name", "category", "definition", "spans"],
        additionalProperties: false,
      },
    },
  },
  required: ["concepts"],
  additionalProperties: false,
} as const;

const position = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

const wireSpan = z
  .object({ start: position, end: position })
  .refine(
    ({ start, end }) =>
      start.line < end.line ||
      (start.line === end.line && start.column <= end.column),
    { message: "span end is before its start" },
  )
  .transform(({ start, end }): Span => ({
    start: [start.line, start.column],
    end: [end.line, end.column],
  }));

export const wireConceptSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be lowercase kebab-case"),
    name: z.string().trim().min(1),
    category: z.enum(CATEGORIES),
    definition: z.string().trim().min(1),
    spans: z.array(wireSpan),
  })
  .transform((c): Concept => c);

export const responseEnvelopeSchema = z.object({
  concepts: z.array(z.unknown()),
});
