import * as assert from "assert";
import { wireConcept } from "./fixtures";
import {
  CATEGORIES,
  CONCEPTS_OUTPUT_SCHEMA,
  responseEnvelopeSchema,
  wireConceptSchema,
} from "./schema";

suite("extraction schema", () => {
  test("a valid wire concept becomes a Concept with tuple spans", () => {
    const parsed = wireConceptSchema.parse(wireConcept());
    assert.deepStrictEqual(parsed, {
      id: "optional-chaining",
      name: "Optional chaining",
      category: "language-feature",
      definition:
        "Optional chaining reads a property only when the value before it is not null or undefined.",
      spans: [{ start: [3, 5], end: [3, 20] }],
    });
  });

  test("accepts a multi-line span and several spans", () => {
    const spans = [
      { start: { line: 1, column: 9 }, end: { line: 4, column: 1 } },
      { start: { line: 6, column: 1 }, end: { line: 6, column: 1 } },
    ];
    const parsed = wireConceptSchema.parse(wireConcept({ spans }));
    assert.deepStrictEqual(parsed.spans, [
      { start: [1, 9], end: [4, 1] },
      { start: [6, 1], end: [6, 1] },
    ]);
  });

  const invalid: [string, Record<string, unknown>][] = [
    ["an id that is not kebab-case", { id: "Optional Chaining" }],
    ["an id with a trailing hyphen", { id: "optional-" }],
    ["an unknown category", { category: "framework" }],
    ["an empty name", { name: "  " }],
    ["an empty definition", { definition: "" }],
    [
      "a span that ends before it starts",
      {
        spans: [{ start: { line: 4, column: 1 }, end: { line: 3, column: 1 } }],
      },
    ],
    [
      "a zero column",
      {
        spans: [{ start: { line: 1, column: 0 }, end: { line: 1, column: 2 } }],
      },
    ],
    ["a missing field", { definition: undefined }],
  ];
  for (const [label, overrides] of invalid) {
    test(`rejects ${label}`, () => {
      assert.strictEqual(
        wireConceptSchema.safeParse(wireConcept(overrides)).success,
        false,
      );
    });
  }

  test("the JSON schema's category enum matches CATEGORIES", () => {
    assert.deepStrictEqual(
      CONCEPTS_OUTPUT_SCHEMA.properties.concepts.items.properties.category.enum,
      [...CATEGORIES],
    );
  });

  test("the envelope requires a concepts array", () => {
    assert.ok(responseEnvelopeSchema.safeParse({ concepts: [] }).success);
    assert.ok(!responseEnvelopeSchema.safeParse({ items: [] }).success);
    assert.ok(!responseEnvelopeSchema.safeParse({ concepts: {} }).success);
  });
});
