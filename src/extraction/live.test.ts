import * as assert from "assert";
import type { BreakdownContext } from "../context/types";
import {
  PYTHON_FILE,
  REACT_COMPONENT,
  TYPESCRIPT_MODULE,
} from "../context/fixtures";
import { extractConcepts } from "./client";
import { CATEGORIES } from "./schema";

// Calls the real API. Runs only when ANTHROPIC_API_KEY is set.
const apiKey = process.env.ANTHROPIC_API_KEY;

const SNIPPETS: [string, BreakdownContext][] = [
  [
    "React",
    {
      code: REACT_COMPONENT.slice(0, 11).join("\n"),
      languageId: "typescriptreact",
      startLine: 1,
    },
  ],
  [
    "TypeScript",
    {
      code: TYPESCRIPT_MODULE.slice(7, 11).join("\n"),
      languageId: "typescript",
      startLine: 8,
    },
  ],
  [
    "Python",
    {
      code: PYTHON_FILE.slice(3, 9).join("\n"),
      languageId: "python",
      startLine: 4,
    },
  ],
];

suite("extractConcepts (live API)", function () {
  this.timeout(120_000);

  suiteSetup(function () {
    if (!apiKey) {
      this.skip();
    }
  });

  for (const [label, context] of SNIPPETS) {
    test(`${label} snippet returns valid concepts`, async () => {
      const result = await extractConcepts(context, { apiKey: apiKey! });
      assert.ok(result.concepts.length > 0, "expected at least one concept");
      for (const concept of result.concepts) {
        assert.match(concept.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
        assert.ok(CATEGORIES.includes(concept.category), concept.category);
        assert.ok(concept.definition.length > 0);
      }
      assert.ok(result.usage.inputTokens > 0);
    });
  }
});
