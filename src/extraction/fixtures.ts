// Test-only wire-format concept, as the model would return it.
export function wireConcept(overrides: Record<string, unknown> = {}) {
  return {
    id: "optional-chaining",
    name: "Optional chaining",
    category: "language-feature",
    definition:
      "Optional chaining reads a property only when the value before it is not null or undefined.",
    spans: [{ start: { line: 3, column: 5 }, end: { line: 3, column: 20 } }],
    ...overrides,
  };
}
